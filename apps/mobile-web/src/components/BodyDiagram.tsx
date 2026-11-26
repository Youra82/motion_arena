import { ZONE_LABELS, type BodyLoadResult, type LoadLevel, type ZoneId } from "@motion-arena/motion-scoring";
import { LEVEL_COLORS } from "../render/draw";

/**
 * Körperschema (Vorderansicht, wie im Spiegel: deine linke Seite links, L/R = deine Körperseite).
 * Zonen nach geschätzter Beanspruchung eingefärbt; "unsicher" schraffiert.
 */
const PARTS: Array<{ zone: ZoneId; d: string }> = [
  // Rumpf
  { zone: "rumpf", d: "M38 46 Q60 40 82 46 L80 98 Q60 104 40 98 Z" },
  // Schultern / Oberarme
  { zone: "schulterL", d: "M30 44 Q38 40 40 48 L34 84 Q28 86 26 80 Z" },
  { zone: "schulterR", d: "M90 44 Q82 40 80 48 L86 84 Q92 86 94 80 Z" },
  // Unterarme
  { zone: "armL", d: "M26 84 L33 86 L30 120 Q26 123 23 119 Z" },
  { zone: "armR", d: "M94 84 L87 86 L90 120 Q94 123 97 119 Z" },
  // Gesäß/Hüfte
  { zone: "gesaessL", d: "M40 98 Q50 102 60 102 L59 118 Q48 120 39 114 Z" },
  { zone: "gesaessR", d: "M80 98 Q70 102 60 102 L61 118 Q72 120 81 114 Z" },
  // Oberschenkel
  { zone: "oberschenkelL", d: "M39 114 Q48 120 59 118 L56 162 Q48 165 42 162 Z" },
  { zone: "oberschenkelR", d: "M81 114 Q72 120 61 118 L64 162 Q72 165 78 162 Z" },
  // Waden
  { zone: "wadeL", d: "M42 164 L56 164 L54 206 Q48 209 44 206 Z" },
  { zone: "wadeR", d: "M78 164 L64 164 L66 206 Q72 209 76 206 Z" },
];

const LEVEL_TEXT: Record<LoadLevel, string> = { gering: "gering", mittel: "mittel", hoch: "hoch", unsicher: "unsicher" };

export function BodyDiagram({ load, compact = false }: { load: BodyLoadResult | null; compact?: boolean }) {
  const level = (z: ZoneId): LoadLevel => load?.zones[z]?.level ?? "unsicher";
  const zones = PARTS.map((p) => p.zone);
  const high = zones.filter((z) => level(z) === "hoch");
  const judged = zones.filter((z) => level(z) !== "unsicher");
  // Textfassung für Screenreader: jede Zone mit Seite (deine linke/rechte) und Stufe.
  const textAll = zones.map((z) => `${ZONE_LABELS[z]}: ${LEVEL_TEXT[level(z)]}`).join("; ");
  const note =
    judged.length === 0
      ? "Gerade nicht beurteilbar – Körper nicht vollständig erkannt."
      : high.length
        ? `Stärker beansprucht (geschätzt): ${high.map((z) => ZONE_LABELS[z]).join(", ")}.`
        : judged.length < zones.length
          ? `Keine der ${judged.length} beurteilbaren Zonen deutlich beansprucht; ${zones.length - judged.length} unsicher.`
          : "Keine Zone deutlich beansprucht.";
  return (
    <div className={`body-diagram${compact ? " compact" : ""}`}>
      <svg viewBox="0 0 120 215" role="img" aria-label={`Körperschema mit geschätzter Beanspruchung (deine linke Seite links). ${textAll}`}>
        <defs>
          <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="#26383D" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="#5D6B6E" strokeWidth="2" />
          </pattern>
        </defs>
        <circle cx="60" cy="24" r="14" fill="#26383D" stroke="#A9B8BB" strokeWidth="1.5" />
        {PARTS.map((p) => {
          const l = level(p.zone);
          return (
            <path
              key={p.zone}
              d={p.d}
              fill={l === "unsicher" ? "url(#hatch)" : LEVEL_COLORS[l]}
              stroke="#101A1D"
              strokeWidth="1.5"
              opacity={l === "gering" ? 0.75 : 1}
            >
              <title>{`${ZONE_LABELS[p.zone]}: ${LEVEL_TEXT[l]}`}</title>
            </path>
          );
        })}
        <text x="14" y="212" fill="#A9B8BB" fontSize="10" fontWeight="700">
          L
        </text>
        <text x="100" y="212" fill="#A9B8BB" fontSize="10" fontWeight="700">
          R
        </text>
      </svg>
      {!compact && (
        <>
          <div className="legend" aria-label="Legende">
            {(["gering", "mittel", "hoch", "unsicher"] as LoadLevel[]).map((l) => (
              <span key={l}>
                <i style={{ background: l === "unsicher" ? "repeating-linear-gradient(45deg,#26383D 0 3px,#5D6B6E 3px 5px)" : LEVEL_COLORS[l] }} />
                {LEVEL_TEXT[l]}
              </span>
            ))}
          </div>
          <p className="diagram-note">
            {note}
          </p>
        </>
      )}
    </div>
  );
}
