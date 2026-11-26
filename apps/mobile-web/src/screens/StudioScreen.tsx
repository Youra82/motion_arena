import { useEffect, useRef, useState } from "react";
import { synthPose } from "@motion-arena/pose-engine";
import type { Landmark } from "@motion-arena/shared";
import { MainLayout } from "../components/common";
import { AVATARS, AVATAR_CATEGORIES, avatarById, drawAvatar, type AvatarCategory, type AvatarDef } from "../render/avatars";
import { ROOMS, drawRoom, roomById, type RoomDef } from "../render/rooms";
import { conceptArt, conceptImage, drawCover, roomBackdrop } from "../render/concept-art";
import { actions, useApp } from "../store";

const pad = (n: number) => String(n).padStart(2, "0");

/** Canvas in CSS-Größe × Pixeldichte vorbereiten; liefert Kontext und Pixelmaße. */
function prepare(c: HTMLCanvasElement): { ctx: CanvasRenderingContext2D; w: number; h: number } | null {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.round(c.clientWidth * dpr);
  const h = Math.round(c.clientHeight * dpr);
  if (!w || !h) return null;
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  }
  const ctx = c.getContext("2d");
  return ctx ? { ctx, w, h } : null;
}

/**
 * Zeichnet `paint` sofort und erneut, sobald sich die Pixelgröße des Canvas ändert (Drehen, Fenstergröße, Zoom).
 * Mehrere Größenänderungen in einem Bild werden zusammengefasst.
 */
function useCanvasPaint(ref: React.RefObject<HTMLCanvasElement | null>, paint: (c: HTMLCanvasElement) => void, deps: unknown[]): void {
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    let raf = 0;
    const run = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => paint(c));
    };
    paint(c);
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(run) : null;
    ro?.observe(c);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/** Avatar in einer Pose (Bildkoordinaten 0..1) auf w×h zeichnen. */
function paintAvatar(ctx: CanvasRenderingContext2D, lms: Landmark[], w: number, h: number, a: AvatarDef): void {
  const P = (i: number): [number, number] => [(1 - lms[i]!.x) * w, lms[i]!.y * h];
  const leg = (hip: number, knee: number, ankle: number) =>
    Math.hypot(P(knee)[0] - P(hip)[0], P(knee)[1] - P(hip)[1]) + Math.hypot(P(ankle)[0] - P(knee)[0], P(ankle)[1] - P(knee)[1]);
  drawAvatar(ctx, lms, P, (leg(23, 25, 27) + leg(24, 26, 28)) / 2, a);
}

function ConceptThumb({ url, room = false }: { url: string; room?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [loaded, setLoaded] = useState<string | null>(null);
  useEffect(() => {
    const image = conceptImage(url);
    const ready = () => setLoaded(url);
    if (image.naturalWidth) ready();
    else image.addEventListener("load", ready);
    return () => image.removeEventListener("load", ready);
  }, [url]);
  useCanvasPaint(ref, (c) => {
    const r = prepare(c);
    if (!r) return;
    const { ctx, w, h } = r;
    ctx.fillStyle = "#141f22";
    ctx.fillRect(0, 0, w, h);
    if (loaded === url) drawCover(ctx, conceptImage(url), w, h);
  }, [url, loaded]);
  return <canvas ref={ref} className={`studio-thumb${room ? " room" : ""}`} aria-hidden="true" />;
}

/** Vorschau: gewählter Avatar macht im gewählten Raum ruhige Kniebeugen (bei „Bewegung reduzieren“ still). */
function Preview({ avatar, room }: { avatar: AvatarDef; room: RoomDef }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    // Bewegung reduzieren: live beachten (auch wenn die Einstellung bei geöffneter Seite geändert wird)
    const mq = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
    let calm = !!mq?.matches;
    let raf = 0;
    const t0 = performance.now();
    const paint = (now: number) => {
      const r = prepare(c);
      if (r) {
        const { ctx, w, h } = r;
        const phase = calm ? 0.35 : (1 - Math.cos(((now - t0) / 2600) * 2 * Math.PI)) / 2;
        drawRoom(ctx, room, w, h, phase * 0.6);
        const { landmarks } = synthPose({
          view: "side",
          kneeFlexDeg: 85 * phase,
          arms: "forward",
          aspect: w / h,
          scale: 0.62,
          groundY: 0.9,
        });
        paintAvatar(ctx, landmarks, w, h, avatar);
      }
    };
    const loop = (now: number) => {
      paint(now);
      if (!calm) raf = requestAnimationFrame(loop);
    };
    const restart = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(loop); // bei calm: genau ein Standbild
    };
    const onMotion = () => {
      calm = !!mq?.matches;
      restart();
    };
    mq?.addEventListener("change", onMotion);
    const artwork = conceptImage(roomBackdrop(room.nr));
    artwork.addEventListener("load", restart);
    // Standbild bei Größenwechsel neu zeichnen (die Animation passt sich ohnehin jedes Bild an)
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => calm && restart()) : null;
    ro?.observe(c);
    restart();
    return () => {
      cancelAnimationFrame(raf);
      mq?.removeEventListener("change", onMotion);
      artwork.removeEventListener("load", restart);
      ro?.disconnect();
    };
  }, [avatar, room]);
  return (
    <canvas
      ref={ref}
      className="studio-preview"
      role="img"
      aria-label={`Vorschau: ${avatar.name} im Raum ${room.name}`}
    />
  );
}

/** Avatar & Trainingsraum wählen (gilt für die Ansicht „Avatar“ und den Hintergrund aller Ansichten ohne Kamerabild). */
export function StudioScreen() {
  const settings = useApp((s) => s.settings);
  const target = useApp((s) => s.targetReps);
  const [cat, setCat] = useState<AvatarCategory | "alle">("alle");
  const avatar = avatarById(settings.avatar);
  const room = roomById(settings.room);
  const shown = cat === "alle" ? AVATARS : AVATARS.filter((a) => a.category === cat);

  return (
    <MainLayout className="studio">
      <h1 className="page-title">Avatar &amp; Raum</h1>

      <section className="card studio-hero" aria-label="Vorschau">
        <Preview avatar={avatar} room={room} />
        <div className="studio-hero-text">
          <p className="eyebrow">
            {pad(avatar.nr)} {avatar.name} · {pad(room.nr)} {room.name}
          </p>
          <p className="muted small">
            Der gewählte Raum erscheint im Live-Training. Lukas hat ein bewegliches 3D-Modell. Die übrigen Porträts
            zeigen die Designvorlagen für die Avatare, deren Live-Figuren bisher in 2D animiert werden.
          </p>
          <button className="btn btn-primary" onClick={() => actions.openLive("demo", target, "squat", "avatar")}>
            Demo als Avatar ansehen
          </button>
        </div>
      </section>

      <section aria-labelledby="studio-avatar-title">
        <h2 className="section-title" id="studio-avatar-title">
          Avatar wählen
        </h2>
        <div className="chips" role="group" aria-label="Kategorie">
          {AVATAR_CATEGORIES.map((c) => (
            <button key={c.id} className="chip-btn" aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>
              {c.label}
            </button>
          ))}
        </div>
        <div className="studio-grid">
          {shown.map((a) => (
            <button
              key={a.id}
              className="studio-card"
              aria-pressed={a.id === avatar.id}
              aria-label={`${a.name}, ${a.focus}, Intensität ${a.level} von 5`}
              onClick={() => actions.updateSettings({ avatar: a.id })}
            >
              <ConceptThumb url={conceptArt("avatars", a.nr)} />
              <span className="studio-name">
                <small>{pad(a.nr)}</small> {a.name}
              </span>
              <span className="studio-focus">{a.focus}</span>
              <span className="studio-level" aria-hidden="true">
                {[1, 2, 3, 4, 5].map((k) => (
                  <i key={k} className={k <= a.level ? "on" : ""} />
                ))}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section aria-labelledby="studio-room-title">
        <h2 className="section-title" id="studio-room-title">
          Trainingsraum wählen
        </h2>
        <div className="studio-grid rooms">
          {ROOMS.map((r) => (
            <button
              key={r.id}
              className="studio-card"
              aria-pressed={r.id === room.id}
              aria-label={`${r.name}, ${r.focus}`}
              onClick={() => actions.updateSettings({ room: r.id, arenaRoom: "loft" })}
            >
              <ConceptThumb url={conceptArt("rooms", r.nr)} room />
              <span className="studio-name">
                <small>{pad(r.nr)}</small> {r.name}
              </span>
              <span className="studio-focus">{r.focus}</span>
            </button>
          ))}
        </div>
      </section>
    </MainLayout>
  );
}
