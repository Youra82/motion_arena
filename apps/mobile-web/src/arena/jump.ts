import { LM, type Landmark } from "@motion-arena/shared";

const VIS = 0.45;
/** Zeitkonstante, mit der die Bodenlinie einem Abstandswechsel zur Kamera nach oben folgt (ms). */
const FLOOR_FOLLOW_MS = 2500;
/** Wie lange eine Sprunghöhe bei fehlenden Fußpunkten gehalten und dann weich zurückgeführt wird (ms). */
const HOLD_MS = 180;

/**
 * Sprunghöhe der Person in Metern aus dem Kamerabild.
 *
 * Die Weltkoordinaten der Erkennung sind hüftzentriert – ein Sprung ist dort unsichtbar. Darum kommt die Höhe aus
 * dem Bild: wie weit die Füße über ihrem Bodenstand liegen, umgerechnet über die Beinlänge im Bild (≈ 0,9 m).
 * Beim Springen werden die Knöchel oft unscharf und unsicher erkannt; dann zählen Ferse oder Fußspitze, und fehlt
 * alles, wird die letzte Höhe kurz gehalten statt auf 0 zu springen.
 */
export class JumpTracker {
  private floor: number | null = null;
  private leg = 0;
  private lift = 0;
  private lastSeen = -Infinity;
  private lastAt: number | null = null;

  reset(): void {
    this.floor = null;
    this.lift = 0;
    this.lastAt = null;
    this.lastSeen = -Infinity;
  }

  update(pose: Landmark[] | null | undefined, now: number): number {
    const dt = this.lastAt === null ? 0 : Math.max(0, now - this.lastAt);
    this.lastAt = now;
    const p = (i: number) => {
      const q = pose?.[i];
      return q && q.visibility >= VIS && Number.isFinite(q.y) ? q : null;
    };
    // tiefster sichtbarer Punkt je Fuß (größeres y = weiter unten im Bild)
    const foot = (ids: number[]) => {
      const ys = ids.map(p).filter((q): q is Landmark => q !== null).map((q) => q.y);
      return ys.length ? Math.max(...ys) : null;
    };
    const left = foot([LM.LEFT_ANKLE, LM.LEFT_HEEL, LM.LEFT_FOOT_INDEX]);
    const right = foot([LM.RIGHT_ANKLE, LM.RIGHT_HEEL, LM.RIGHT_FOOT_INDEX]);
    // Beinlänge im Bild: aus dem besser sichtbaren Bein, sonst die letzte bekannte
    for (const [h, k, a] of [[LM.LEFT_HIP, LM.LEFT_KNEE, LM.LEFT_ANKLE], [LM.RIGHT_HIP, LM.RIGHT_KNEE, LM.RIGHT_ANKLE]] as const) {
      const hip = p(h), knee = p(k), ankle = p(a);
      if (hip && knee && ankle) {
        const len = Math.hypot(knee.x - hip.x, knee.y - hip.y) + Math.hypot(ankle.x - knee.x, ankle.y - knee.y);
        if (len > 0.05) this.leg = this.leg ? Math.max(this.leg * 0.97, len) : len; // gebeugtes Bein verkürzt nicht
      }
    }
    if ((left === null && right === null) || this.leg < 0.05) {
      // nichts Verlässliches: Höhe kurz halten, dann weich zum Boden
      if (now - this.lastSeen > HOLD_MS) this.lift *= Math.exp(-dt / 120);
      return this.lift < 0.01 ? 0 : this.lift;
    }
    this.lastSeen = now;
    const feet = Math.max(left ?? -Infinity, right ?? -Infinity);
    if (this.floor === null || feet > this.floor) this.floor = feet; // Boden = tiefster Stand
    else this.floor += (feet - this.floor) * (1 - Math.exp(-dt / FLOOR_FOLLOW_MS));
    const lift = ((this.floor - feet) / this.leg) * 0.9;
    this.lift = lift > 0.03 ? Math.min(lift, 1.2) : 0;
    return this.lift;
  }
}
