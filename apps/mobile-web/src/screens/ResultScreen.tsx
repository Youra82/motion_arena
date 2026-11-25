import { summarize } from "@motion-arena/motion-scoring";
import { actions, useApp } from "../store";

export function ResultScreen() {
  const session = useApp((s) => s.session);
  const source = useApp((s) => s.source);
  const s = summarize(session);

  const stats: Array<[string, string]> = [
    ["Wiederholungen", `${s.reps} / ${s.targetReps}`],
    ["Punkte", String(s.points)],
    ["Ø Bewertung", s.averageScore === null ? "–" : `${s.averageScore}/100`],
    ["Beste Combo", s.bestCombo ? `×${s.bestCombo}` : "–"],
    ["Aktive Zeit", `${Math.floor(s.activeSeconds / 60)}:${String(s.activeSeconds % 60).padStart(2, "0")}`],
    ["Nicht gezählt", String(s.failedAttempts)],
  ];

  return (
    <main className="result">
      <p className="eyebrow">Ergebnis · Kniebeugen{source === "demo" ? " · DEMO" : ""}</p>
      <h1>{s.reps >= s.targetReps ? "Ziel erreicht" : "Training beendet"}</h1>

      <div className="stats">
        {stats.map(([label, value]) => (
          <div className="card" key={label}>
            <div className="stat-value">{value}</div>
            <div className="stat-label">{label}</div>
          </div>
        ))}
      </div>

      {s.trackingInterruptions > 0 && (
        <p className="muted">
          {s.trackingInterruptions}× war der Körper nicht sicher erkennbar – diese Momente wurden nicht gewertet.
        </p>
      )}

      {session.reps.length > 0 && (
        <section>
          <p className="eyebrow">Wiederholungen</p>
          <ul className="rep-list">
            {session.reps.map((r) => (
              <li key={r.rep.index}>
                <span className="rep-score" style={{ color: r.score.total >= 70 ? "var(--motion)" : "var(--warning)" }}>
                  {r.score.total}
                </span>
                <span style={{ flex: 1 }}>{r.score.feedback.join(" · ")}</span>
                <span className="muted">+{r.points}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="actions">
        <button className="btn btn-primary" onClick={() => actions.openLive(source, session.targetReps)}>
          Nochmal
        </button>
        <button className="btn btn-ghost" onClick={() => actions.home()}>
          Zur Startseite
        </button>
      </div>

      <p className="disclaimer">
        Alle Werte sind Schätzungen aus dem Kamerabild (Tiefe, Tempo, Links/Rechts-Gleichmäßigkeit, Rumpfneigung bei
        seitlicher Ansicht). Die Kamera misst keine Muskelkraft und ersetzt keine medizinische oder trainerische
        Beurteilung.
      </p>
    </main>
  );
}
