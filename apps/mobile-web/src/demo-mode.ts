/**
 * Demo-Modus (synthetische Bewegung ohne Kamera) ist für Nutzer ausgeblendet. Er bleibt nur für automatisierte
 * Browser-Tests sichtbar (navigator.webdriver), weil diese ohne echte Kamera laufen.
 */
export const SHOW_DEMO = typeof navigator !== "undefined" && navigator.webdriver === true;
