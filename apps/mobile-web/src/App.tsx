import { useApp } from "./store";
import { StartScreen } from "./screens/StartScreen";
import { LiveScreen } from "./screens/LiveScreen";
import { ResultScreen } from "./screens/ResultScreen";

export function App() {
  const screen = useApp((s) => s.screen);
  if (screen === "live") return <LiveScreen />;
  if (screen === "result") return <ResultScreen />;
  return <StartScreen />;
}
