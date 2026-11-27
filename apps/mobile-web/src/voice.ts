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

let pending: ReturnType<typeof setTimeout> | null = null;

/**
 * Text ansagen; eine noch laufende Ansage wird abgebrochen (die neue ist immer die aktuellere).
 * Safari verschluckt eine Ansage, die direkt nach cancel() kommt – deshalb nach dem Abbrechen kurz warten.
 */
export function say(text: string): void {
  const s = synth();
  if (!s || !text) return;
  if (pending) clearTimeout(pending);
  pending = null;
  const go = () => {
    pending = null;
    try {
      s.resume(); // iOS hängt nach dem Wechsel in den Hintergrund manchmal in „pausiert“
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "de-DE";
      const voice = germanVoice(s);
      if (voice) u.voice = voice;
      u.rate = 1.05;
      u.volume = 1;
      s.speak(u);
    } catch {
      // Sprachausgabe nicht verfügbar – Training läuft ohne Ansage weiter
    }
  };
  try {
    if (s.speaking || s.pending) {
      s.cancel();
      pending = setTimeout(go, 120);
    } else go();
  } catch {
    // ignorieren
  }
}

/** Beim Antippen aufrufen: schaltet die Sprachausgabe auf iOS frei (stumme Ansage). */
export function unlockVoice(): void {
  const s = synth();
  if (!s) return;
  try {
    // iOS schaltet nur mit einer echten (nicht leeren) Ansage während des Antippens frei
    const u = new SpeechSynthesisUtterance(".");
    u.lang = "de-DE";
    u.volume = 0;
    s.speak(u);
  } catch {
    // ignorieren
  }
}

export function stopVoice(): void {
  if (pending) clearTimeout(pending);
  pending = null;
  try {
    synth()?.cancel();
  } catch {
    // ignorieren
  }
}
