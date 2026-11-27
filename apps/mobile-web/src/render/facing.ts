import { LM, type Landmark } from "@motion-arena/shared";

/**
 * Ausrichtung angleichen: Die Foto-Trainer sind leicht schräg aufgenommen – ihre näher zur Kamera liegende Schulter
 * erscheint rechts im Bild. Dreht sich die Person in die andere Richtung, wird der Trainer gespiegelt, damit beide in
 * dieselbe Richtung schauen. Bei frontaler Haltung (kaum Tiefenunterschied) bleibt die letzte Entscheidung (kein Flackern).
 */
let flipped = false;

export function trainerFlip(pose: Landmark[] | null | undefined, mirror: boolean): boolean {
  if (!pose) return flipped;
  const pairs = [
    [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER],
    [LM.LEFT_HIP, LM.RIGHT_HIP],
  ] as const;
  let dz = 0;
  let dx = 0;
  let n = 0;
  for (const [l, r] of pairs) {
    const L = pose[l];
    const R = pose[r];
    if (!L || !R || L.visibility < 0.5 || R.visibility < 0.5) continue;
    const lx = mirror ? 1 - L.x : L.x;
    const rx = mirror ? 1 - R.x : R.x;
    // z: kleiner = näher an der Kamera. Vorzeichen: näher liegende Seite rechts im Bild → wie das Foto
    dz += L.z - R.z;
    dx += lx - rx;
    n++;
  }
  if (!n) return flipped;
  dz /= n;
  dx /= n;
  if (Math.abs(dz) < 0.06) return flipped; // frontal: nichts ändern
  const leftCloser = dz < 0;
  const leftOnRight = dx > 0;
  const nearerOnRight = leftCloser === leftOnRight;
  flipped = !nearerOnRight;
  return flipped;
}
