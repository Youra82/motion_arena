import { useEffect, useRef, useState } from "react";
import { AVATARS, avatarById } from "../render/avatars";
import { ROOMS, isRoomId, roomById } from "../render/rooms";
import { conceptArt, roomBackdrop } from "../render/concept-art";
import { trainerPhoto } from "./common";
import { ARENA_ROOMS, isArenaRoom } from "../arena/rooms";
import { actions, useApp } from "../store";

type Kind = "trainer" | "avatar" | "room";

const TITLE: Record<Kind, string> = { trainer: "Trainer wählen", avatar: "Deinen Avatar wählen", room: "Arena wählen" };

/**
 * Drei Knöpfe im Training: Trainer (macht vor), dein Avatar (macht nach) und Arena – jederzeit umschaltbar.
 * Jeder Knopf öffnet eine Auswahl mit Bildkarten (Porträts bzw. Raumbilder aus dem Konzept).
 */
export function StagePicker() {
  const settings = useApp((s) => s.settings);
  const [open, setOpen] = useState<Kind | null>(null);
  const trainer = avatarById(settings.trainer);
  const me = avatarById(settings.avatar);
  const lebombo = settings.arenaRoom === "lebombo";
  const room = roomById(settings.room);
  const roomLabel = lebombo ? ARENA_ROOMS.find((r) => r.id === "lebombo")?.label ?? "Lebombo" : room.name;
  return (
    <>
      <div className="stage-picker" role="group" aria-label="Trainer, Avatar und Arena">
        <button className="stage-chip" onClick={() => setOpen("trainer")} aria-label={`Trainer: ${trainer.name} – ändern`}>
          <img src={conceptArt("avatars", trainer.nr)} alt="" />
          <span><small>Trainer</small>{trainer.name}</span>
        </button>
        <button className="stage-chip" onClick={() => setOpen("avatar")} aria-label={`Dein Avatar: ${me.name} – ändern`}>
          <img src={conceptArt("avatars", me.nr)} alt="" />
          <span><small>Ich</small>{me.name}</span>
        </button>
        <button className="stage-chip" onClick={() => setOpen("room")} aria-label={`Arena: ${roomLabel} – ändern`}>
          {!lebombo && <img src={conceptArt("rooms", room.nr)} alt="" className="wide" />}
          <span><small>Arena</small>{roomLabel}</span>
        </button>
      </div>
      {open && <PickerDialog kind={open} onClose={() => setOpen(null)} />}
    </>
  );
}

/**
 * Vorschau-Karte vor dem Training (z. B. im Baukasten): gewählter Trainer im gewählten Raum, darunter dieselben drei
 * Auswahl-Knöpfe wie im Live-Training. Die Wahl gilt sofort für das nächste Training.
 */
export function StageCard() {
  const settings = useApp((s) => s.settings);
  const [open, setOpen] = useState<Kind | null>(null);
  const trainer = avatarById(settings.trainer);
  const lebombo = settings.arenaRoom === "lebombo";
  const room = roomById(settings.room);
  const roomLabel = lebombo ? ARENA_ROOMS.find((r) => r.id === "lebombo")?.label ?? "Lebombo" : room.name;
  const backdrop = lebombo ? `${import.meta.env.BASE_URL}arena/lebombo.jpg` : roomBackdrop(room.nr);
  return (
    <section className="stage-card" aria-label="Trainer und Arena für dieses Training">
      <img className="stage-card-bg" src={backdrop} alt="" />
      <img className="stage-card-trainer" src={trainerPhoto(trainer.id)} alt={`Trainer ${trainer.name} in ${roomLabel}`} />
      <p className="stage-card-title">
        <small>Trainer &amp; Arena</small>
        {trainer.name} · {roomLabel}
      </p>
      <div className="stage-picker" role="group" aria-label="Trainer und Arena wählen">
        <button className="stage-chip" onClick={() => setOpen("trainer")} aria-label={`Trainer: ${trainer.name} – ändern`}>
          <img src={conceptArt("avatars", trainer.nr)} alt="" />
          <span><small>Trainer</small>{trainer.name}</span>
        </button>
        <button className="stage-chip" onClick={() => setOpen("room")} aria-label={`Arena: ${roomLabel} – ändern`}>
          {!lebombo && <img src={conceptArt("rooms", room.nr)} alt="" className="wide" />}
          <span><small>Arena</small>{roomLabel}</span>
        </button>
      </div>
      {open && <PickerDialog kind={open} onClose={() => setOpen(null)} />}
    </section>
  );
}

function PickerDialog({ kind, onClose }: { kind: Kind; onClose: () => void }) {
  const settings = useApp((s) => s.settings);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("[aria-pressed='true'], button")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", onKey);
    return () => {
      removeEventListener("keydown", onKey);
      prev?.focus();
    };
  }, [onClose]);
  const pick = (patch: Parameters<typeof actions.updateSettings>[0]) => {
    actions.updateSettings(patch);
    onClose();
  };
  return (
    <div className="picker-backdrop" onClick={onClose}>
      <div className="picker-dialog" role="dialog" aria-modal="true" aria-label={TITLE[kind]} ref={ref} onClick={(e) => e.stopPropagation()}>
        <div className="picker-head">
          <h2>{TITLE[kind]}</h2>
          <button className="btn btn-ghost" onClick={onClose}>Schließen</button>
        </div>
        <div className={`picker-grid${kind === "room" ? " rooms" : ""}`}>
          {kind !== "room"
            ? AVATARS.map((a) => {
                const active = (kind === "trainer" ? settings.trainer : settings.avatar) === a.id;
                return (
                  <button key={a.id} className="picker-card" aria-pressed={active}
                    onClick={() => pick(kind === "trainer" ? { trainer: a.id } : { avatar: a.id })}>
                    <img src={conceptArt("avatars", a.nr)} alt="" loading="lazy" />
                    <b>{a.name}</b>
                    <small>{a.focus}</small>
                  </button>
                );
              })
            : [
                ...ROOMS.map((r) => {
                  const active = settings.arenaRoom !== "lebombo" && settings.room === r.id;
                  return (
                    <button key={r.id} className="picker-card" aria-pressed={active}
                      onClick={() => isRoomId(r.id) && pick({ room: r.id, arenaRoom: "loft" })}>
                      <img src={conceptArt("rooms", r.nr)} alt="" loading="lazy" />
                      <b>{r.name}</b>
                      <small>{r.focus}</small>
                    </button>
                  );
                }),
                ...ARENA_ROOMS.filter(({ id }) => id !== "loft").map(({ id, label }) => (
                  <button key={id} className="picker-card" aria-pressed={settings.arenaRoom === id}
                    onClick={() => isArenaRoom(id) && pick({ arenaRoom: id })}>
                    <span className="picker-photo" aria-hidden="true">360°</span>
                    <b>{label}</b>
                    <small>Fotopanorama</small>
                  </button>
                )),
              ]}
        </div>
      </div>
    </div>
  );
}
