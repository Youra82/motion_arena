import { create } from "zustand";

/** Chrome/Edge/Samsung: Ereignis, mit dem die Seite den Installationsdialog selbst auslösen darf. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export type InstallKind =
  | "installed" // läuft bereits als installierte App
  | "prompt" // Browser erlaubt Installation per Knopf
  | "ios" // iPhone/iPad: nur über Teilen → Zum Home-Bildschirm
  | "manual" // anderes Handy ohne Installationsereignis: über das Browsermenü
  | "none"; // Desktop ohne Installationsangebot: nichts anzeigen

interface PwaState {
  prompt: BeforeInstallPromptEvent | null;
  installed: boolean;
  /** Seite wurde über den QR-Code mit ?install=1 geöffnet. */
  fromQr: boolean;
}

export const usePwa = create<PwaState>(() => ({
  prompt: null,
  installed: false,
  fromQr: false,
}));

const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

const isIos = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

const isMobile = () => isIos() || /Android|Mobile/i.test(navigator.userAgent);

export function installKind(s: PwaState): InstallKind {
  if (s.installed) return "installed";
  if (s.prompt) return "prompt";
  if (isIos()) return "ios";
  if (isMobile()) return "manual";
  return "none";
}

/** Früh aufrufen (vor dem ersten Render): Installationsereignis kommt oft sofort nach dem Laden. */
export function initPwa(): void {
  usePwa.setState({
    installed: isStandalone(),
    fromQr: new URLSearchParams(location.search).has("install"),
  });
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // eigenen Knopf zeigen statt der Mini-Leiste
    usePwa.setState({ prompt: e as BeforeInstallPromptEvent });
  });
  window.addEventListener("appinstalled", () => usePwa.setState({ installed: true, prompt: null }));

  // Service Worker nur im Build: ermöglicht Installation und Offline-Betrieb.
  // Mit selbstsigniertem Zertifikat lehnt der Browser ihn ab – die App läuft dann trotzdem.
  if (import.meta.env.PROD && "serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
    });
  }
}

/** Installationsdialog des Browsers öffnen (nur nach Nutzeraktion erlaubt). */
export async function promptInstall(): Promise<boolean> {
  const p = usePwa.getState().prompt;
  if (!p) return false;
  await p.prompt();
  const { outcome } = await p.userChoice;
  usePwa.setState({ prompt: null, installed: outcome === "accepted" });
  return outcome === "accepted";
}
