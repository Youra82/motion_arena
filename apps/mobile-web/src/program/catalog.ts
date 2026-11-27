/**
 * Übungskatalog für Programme und den Baukasten.
 *
 * Nur Übungen mit `tracked: true` zählt und bewertet die Kamera (derzeit die Kniebeuge). Alle anderen laufen als
 * geführter Schritt: Anleitung, Satz- bzw. Zeitvorgabe, Timer – abgehakt wird von Hand. So verspricht die App nichts,
 * was die Erkennung noch nicht kann.
 */

export type Area = "Beine" | "Po" | "Rumpf" | "Oberkörper" | "Schultern" | "Ausdauer" | "Mobilität";

/** Was eine Übung belastet – danach tauscht der Planer bei Beschwerden aus. */
export interface Strain {
  knee?: boolean;
  back?: boolean;
  shoulder?: boolean;
  /** Sprünge (laut, Knie). */
  jump?: boolean;
}

export interface Exercise {
  id: string;
  name: string;
  area: Area;
  /** Wiederholungen oder Haltezeit. */
  measure: "reps" | "time";
  /** Kamera zählt und bewertet (nur Kniebeuge). */
  tracked: boolean;
  /** Drei kurze Hinweise „So geht's“. */
  cues: [string, string, string];
  strain: Strain;
  /** Ohne Geräte und ohne Lärm in der Wohnung machbar. */
  quiet: boolean;
}

const ex = (e: Exercise) => e;

export const EXERCISES: Exercise[] = [
  ex({ id: "squat", name: "Kniebeugen", area: "Beine", measure: "reps", tracked: true, quiet: true, strain: { knee: true },
    cues: ["Füße schulterbreit, Zehen leicht nach außen", "Hüfte nach hinten, Brust bleibt oben", "Bis die Oberschenkel waagrecht sind, über die Fersen hoch"] }),
  ex({ id: "half-squat", name: "Halbe Kniebeuge", area: "Beine", measure: "reps", tracked: false, quiet: true, strain: {},
    cues: ["Wie eine Kniebeuge, aber nur halb so tief", "Knie zeigen in Richtung der Zehen", "Langsam runter, zügig hoch"] }),
  ex({ id: "lunge", name: "Ausfallschritt", area: "Beine", measure: "reps", tracked: false, quiet: true, strain: { knee: true },
    cues: ["Großer Schritt nach vorn", "Hinteres Knie fast bis zum Boden", "Vorderes Knie bleibt über dem Fuß"] }),
  ex({ id: "side-leg-raise", name: "Beinheben seitlich", area: "Po", measure: "reps", tracked: false, quiet: true, strain: {},
    cues: ["Seitlich an eine Wand oder Stuhllehne stellen", "Gestrecktes Bein langsam zur Seite heben", "Oberkörper bleibt aufrecht"] }),
  ex({ id: "glute-bridge", name: "Glute-Brücke", area: "Po", measure: "reps", tracked: false, quiet: true, strain: {},
    cues: ["Rücken auf der Matte, Füße aufgestellt", "Becken anheben, bis Knie, Hüfte und Schultern eine Linie bilden", "Oben kurz den Po anspannen"] }),
  ex({ id: "plank", name: "Unterarmstütz", area: "Rumpf", measure: "time", tracked: false, quiet: true, strain: { back: true, shoulder: true },
    cues: ["Ellbogen unter den Schultern", "Körper bildet eine gerade Linie", "Bauch fest, ruhig weiteratmen"] }),
  ex({ id: "dead-bug", name: "Toter Käfer", area: "Rumpf", measure: "reps", tracked: false, quiet: true, strain: {},
    cues: ["Rückenlage, Arme und Knie nach oben", "Gegenüberliegenden Arm und Bein langsam strecken", "Unterer Rücken bleibt am Boden"] }),
  ex({ id: "side-plank", name: "Seitstütz", area: "Rumpf", measure: "time", tracked: false, quiet: true, strain: { shoulder: true, back: true },
    cues: ["Auf einen Unterarm stützen, Ellbogen unter der Schulter", "Becken anheben, Körper gerade", "Halbe Zeit je Seite"] }),
  ex({ id: "bird-dog", name: "Vierfüßlerstand diagonal", area: "Rumpf", measure: "reps", tracked: false, quiet: true, strain: {},
    cues: ["Hände unter den Schultern, Knie unter der Hüfte", "Arm und Gegenbein lang nach vorn und hinten strecken", "Becken bleibt waagrecht"] }),
  ex({ id: "knee-pushup", name: "Liegestütz auf den Knien", area: "Oberkörper", measure: "reps", tracked: false, quiet: true, strain: { shoulder: true, knee: true },
    cues: ["Hände etwas breiter als die Schultern", "Körper von Knie bis Kopf gerade", "Brust kontrolliert Richtung Boden"] }),
  ex({ id: "wall-pushup", name: "Liegestütz an der Wand", area: "Oberkörper", measure: "reps", tracked: false, quiet: true, strain: {},
    cues: ["Eine Armlänge vor der Wand stehen", "Hände auf Schulterhöhe an die Wand", "Brust zur Wand, kräftig wegdrücken"] }),
  ex({ id: "lateral-raise", name: "Seitheben", area: "Schultern", measure: "reps", tracked: false, quiet: true, strain: { shoulder: true },
    cues: ["Aufrecht stehen, Arme seitlich hängen", "Arme bis Schulterhöhe heben", "Langsam wieder senken"] }),
  ex({ id: "scap-squeeze", name: "Schulterblätter zusammenziehen", area: "Schultern", measure: "reps", tracked: false, quiet: true, strain: {},
    cues: ["Arme angewinkelt vor dem Körper", "Ellbogen nach hinten ziehen", "Schulterblätter 2 Sekunden zusammendrücken"] }),
  ex({ id: "jumping-jack", name: "Hampelmann", area: "Ausdauer", measure: "time", tracked: false, quiet: false, strain: { knee: true, jump: true },
    cues: ["Beine auseinander springen, Arme über den Kopf", "Zurück in die Ausgangsstellung", "Locker auf den Fußballen landen"] }),
  ex({ id: "step-jack", name: "Hampelmann ohne Sprung", area: "Ausdauer", measure: "time", tracked: false, quiet: true, strain: {},
    cues: ["Abwechselnd ein Bein zur Seite setzen", "Arme dabei über den Kopf führen", "Zügiges Tempo, kein Sprung"] }),
  ex({ id: "high-knees", name: "Knieheben im Stand", area: "Ausdauer", measure: "time", tracked: false, quiet: true, strain: {},
    cues: ["Aufrecht stehen", "Knie abwechselnd bis Hüfthöhe", "Arme schwingen mit"] }),
  ex({ id: "burpee-light", name: "Burpee ohne Sprung", area: "Ausdauer", measure: "time", tracked: false, quiet: true, strain: { knee: true, back: true, shoulder: true },
    cues: ["In die Hocke, Hände auf den Boden", "Beine nach hinten in den Stütz setzen", "Zurück und aufrichten"] }),
  ex({ id: "cat-cow", name: "Katze-Kuh", area: "Mobilität", measure: "reps", tracked: false, quiet: true, strain: {},
    cues: ["Vierfüßlerstand", "Rücken rund machen, Kinn zur Brust", "Rücken sanft durchhängen lassen, Blick nach vorn"] }),
  ex({ id: "hip-circles", name: "Hüftkreisen", area: "Mobilität", measure: "time", tracked: false, quiet: true, strain: {},
    cues: ["Hände in die Hüfte", "Große, langsame Kreise", "Nach der Hälfte die Richtung wechseln"] }),
  ex({ id: "shoulder-circles", name: "Schulterkreisen", area: "Mobilität", measure: "time", tracked: false, quiet: true, strain: {},
    cues: ["Arme locker hängen lassen", "Schultern groß nach hinten kreisen", "Nach der Hälfte nach vorn"] }),
];

const BY_ID = new Map(EXERCISES.map((e) => [e.id, e]));

export function exerciseById(id: string): Exercise | undefined {
  return BY_ID.get(id);
}

export function isExerciseId(id: unknown): id is string {
  return typeof id === "string" && BY_ID.has(id);
}
