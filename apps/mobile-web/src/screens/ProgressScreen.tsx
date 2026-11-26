import { challenge30, progressStats, weekPlan } from "@motion-arena/motion-scoring";
import { MainLayout } from "../components/common";
import { actions, useApp } from "../store";

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" }) +
  " · " +
  new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

/** Fortschritt: Trainingsplan (Woche), 30-Tage-Challenge, Kennzahlen, Verlauf. */
const DAY_NAMES: Record<string, string> = {
  Mo: "Montag", Di: "Dienstag", Mi: "Mittwoch", Do: "Donnerstag", Fr: "Freitag", Sa: "Samstag", So: "Sonntag",
};

export function ProgressScreen() {
  const history = useApp((s) => s.history);
  const goal = useApp((s) => s.settings.weeklyGoal);
  const now = new Date();
  const stats = progressStats(history, now, 14);
  const plan = weekPlan(history, now, goal);
  const ch = challenge30(history, now);
  const maxReps = Math.max(1, ...stats.recentDays.map((d) => d.reps));

  return (
    <MainLayout className="progress">
      <h1 className="page-title">Fortschritt</h1>

      <section className="card" aria-label="Trainingsplan">
        <div className="row-between">
          <p className="eyebrow">Trainingsplan diese Woche</p>
          <span className="small">
            {plan.done}/{plan.goal} Tage
          </span>
        </div>
        <ul className="week" aria-label="Wochentage">
          {plan.days.map((d) => (
            <li
              key={d.day}
              className={`week-day${d.trained ? " done" : ""}${d.isToday ? " today" : ""}`}
              aria-current={d.isToday ? "date" : undefined}
              aria-label={`${DAY_NAMES[d.label] ?? d.label}${d.isToday ? " (heute)" : ""}: ${d.trained ? "trainiert" : d.isFuture ? "noch offen" : "nicht trainiert"}`}
            >
              <span className="week-dot" aria-hidden="true">{d.trained ? "✓" : ""}</span>
              <span aria-hidden="true">{d.label}</span>
            </li>
          ))}
        </ul>
        <div className="row-between small">
          <span className="muted">Wochenziel</span>
          <div className="segmented mini" role="group" aria-label="Wochenziel">
            {[2, 3, 4, 5].map((g) => (
              <button key={g} aria-pressed={g === goal} onClick={() => actions.updateSettings({ weeklyGoal: g })}>
                {g}×
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="card challenge-card" aria-label="Challenge">
        <p className="eyebrow">Challenge</p>
        <h2>{ch.title}</h2>
        <p className="muted">
          An {ch.goalDays} von {ch.length} Tagen trainieren{ch.completed ? " – geschafft! 🎉" : ""}
        </p>
        <div className="bar">
          <div className="bar-fill" style={{ width: `${ch.progress * 100}%` }} />
        </div>
        <div className="row-between small">
          <span>{ch.day ? `Tag ${ch.day} von ${ch.length}` : "Startet mit deinem ersten Training"}</span>
          <span>
            {ch.trainedDays}/{ch.goalDays} Tage
          </span>
        </div>
      </section>

      <section className="stats" aria-label="Kennzahlen">
        {(
          [
            ["Trainings", stats.totalTrainings],
            ["Wiederholungen", stats.totalReps],
            ["Punkte", stats.totalPoints],
            ["Serie", `${stats.streakDays} ${stats.streakDays === 1 ? "Tag" : "Tage"}`],
          ] as Array<[string, string | number]>
        ).map(([label, value]) => (
          <div className="card" key={label}>
            <div className="stat-value">{value}</div>
            <div className="stat-label">{label}</div>
          </div>
        ))}
      </section>

      <section className="card" aria-label="Letzte 14 Tage">
        <p className="eyebrow">Wiederholungen – letzte 14 Tage</p>
        <div className="chart" aria-hidden="true">
          {stats.recentDays.map((d) => (
            <div key={d.day} className="chart-col" title={`${d.day}: ${d.reps} Wiederholungen`}>
              <div className="chart-bar" style={{ height: `${(d.reps / maxReps) * 100}%` }} />
              <span>{Number(d.day.slice(8))}</span>
            </div>
          ))}
        </div>
        <table className="sr-only">
          <caption>Wiederholungen pro Tag, letzte 14 Tage</caption>
          <thead>
            <tr>
              <th scope="col">Datum</th>
              <th scope="col">Wiederholungen</th>
            </tr>
          </thead>
          <tbody>
            {stats.recentDays.map((d) => (
              <tr key={d.day}>
                <td>{new Date(`${d.day}T12:00:00`).toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "numeric" })}</td>
                <td>{d.reps}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section aria-label="Verlauf">
        <p className="eyebrow">Verlauf</p>
        {history.length === 0 ? (
          <p className="muted">Noch keine Trainings gespeichert. Demo-Durchläufe zählen nicht.</p>
        ) : (
          <ul className="rep-list">
            {[...history]
              .reverse()
              .slice(0, 30)
              .map((e) => (
                <li key={e.id}>
                  <span className="rep-score" style={{ color: (e.averageScore ?? 0) >= 70 ? "var(--motion)" : "var(--warning)" }}>
                    {e.averageScore ?? "–"}
                  </span>
                  <span style={{ flex: 1 }}>
                    {e.reps}/{e.targetReps} Kniebeugen
                    <br />
                    <span className="muted small">{fmtDate(e.date)}</span>
                  </span>
                  <span className="muted">+{e.points}</span>
                </li>
              ))}
          </ul>
        )}
      </section>
    </MainLayout>
  );
}
