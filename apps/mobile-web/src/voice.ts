/**
 * Sprachansagen im Training (eingebaute Sprachausgabe des Geräts – läuft ohne Internet, nichts verlässt das Gerät).
 * iOS spricht erst, nachdem einmal während eines Antippens gesprochen wurde: dafür `unlockVoice()` beim Start aufrufen.
 */

let cached: SpeechSynthesisVoice | null = null;

function synth(): SpeechSynthesis | null {
  return typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null;
}

function germanVoice(s: SpeechSynthesis): SpeechSynthesisVoice | null {
  if (cached) return cached;
  const voices = s.getVoices();
  cached =
    voices.find((v) => v.lang === "de-DE" && v.localService) ??
    voices.find((v) => v.lang.toLowerCase().startsWith("de")) ??
    null;
  return cached;
}

/** Text ansagen; eine noch laufende Ansage wird abgebrochen (die neue ist immer die aktuellere). */
export function say(text: string): void {
  const s = synth();
  if (!s || !text) return;
  try {
    s.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "de-DE";
    const v = germanVoice(s);
    if (v) u.voice = v;
    u.rate = 1.05;
    s.speak(u);
  } catch {
    // Sprachausgabe nicht verfügbar – Training läuft ohne Ansage weiter
  }
}

/** Beim Antippen aufrufen: schaltet die Sprachausgabe auf iOS frei (stumme, leere Ansage). */
export function unlockVoice(): void {
  const s = synth();
  if (!s) return;
  try {
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    s.speak(u);
  } catch {
    // ignorieren
  }
}

export function stopVoice(): void {
  try {
    synth()?.cancel();
  } catch {
    // ignorieren
  }
}
