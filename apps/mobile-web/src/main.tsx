import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { initPwa } from "./pwa";
import { useApp } from "./store";
import { connectToTv } from "./tv/phone-link";
import "./styles.css";
import "./nx.css";

initPwa();

// Adressparameter: ?tv → dieses Gerät ist der Fernseher; ?pair=CODE&k=SCHLÜSSEL → mit einem TV koppeln
// (Schlüssel aus dem QR-Code: sofort; nur Code: Bestätigung am Fernseher). Beides wird aus der Adresse entfernt.
{
  const params = new URLSearchParams(location.search);
  if (params.has("tv")) useApp.setState({ screen: "tv" });
  const pair = params.get("pair");
  if (pair) void connectToTv(pair, params.get("k"));
  if (params.has("pair") || params.has("k")) {
    params.delete("pair");
    params.delete("k");
    const q = params.toString();
    history.replaceState(null, "", `${location.pathname}${q ? `?${q}` : ""}${location.hash}`);
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
