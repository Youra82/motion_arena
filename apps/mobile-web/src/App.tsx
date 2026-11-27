import { useApp } from "./store";
import { HomeScreen } from "./screens/HomeScreen";
import { TrainingScreen } from "./screens/TrainingScreen";
import { ProgressScreen } from "./screens/ProgressScreen";
import { ProfileScreen } from "./screens/ProfileScreen";
import { LiveScreen } from "./screens/LiveScreen";
import { ResultScreen } from "./screens/ResultScreen";
import { StudioScreen } from "./screens/StudioScreen";
import { ProgramsScreen } from "./screens/ProgramsScreen";
import { PlannerScreen } from "./screens/PlannerScreen";
import { ProgramScreen } from "./screens/ProgramScreen";
import { BuilderScreen } from "./screens/BuilderScreen";
import { WorkoutScreen } from "./screens/WorkoutScreen";
import { Suspense, lazy, useEffect, useRef } from "react";

// TV-Bildschirm (mit QR-Erzeugung) nur bei Bedarf laden – auf dem Handy meist nie nötig.
const TvScreen = lazy(() => import("./screens/TvScreen").then((m) => ({ default: m.TvScreen })));

export function App() {
  const screen = useApp((s) => s.screen);
  // Nach einem Seitenwechsel die neue Überschrift fokussieren (Tastatur/Screenreader verlieren sonst die Orientierung).
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    window.scrollTo({ top: 0 });
    const id = requestAnimationFrame(() => {
      const h = document.querySelector<HTMLElement>("main h1, .live h1, h1");
      if (!h) return;
      if (!h.hasAttribute("tabindex")) h.setAttribute("tabindex", "-1");
      h.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(id);
  }, [screen]);
  switch (screen) {
    case "live":
      return <LiveScreen />;
    case "result":
      return <ResultScreen />;
    case "training":
      return <TrainingScreen />;
    case "progress":
      return <ProgressScreen />;
    case "profile":
      return <ProfileScreen />;
    case "studio":
      return <StudioScreen />;
    case "programs":
      return <ProgramsScreen />;
    case "planner":
      return <PlannerScreen />;
    case "program":
      return <ProgramScreen />;
    case "builder":
      return <BuilderScreen />;
    case "workout":
      return <WorkoutScreen />;
    case "tv":
      return (
        <Suspense fallback={<div className="tv" />}>
          <TvScreen />
        </Suspense>
      );
    default:
      return <HomeScreen />;
  }
}
