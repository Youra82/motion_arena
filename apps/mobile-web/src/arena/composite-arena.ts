/** Der Browser legt die WebGL-Fläche unter die Maske. Nur ein freigegebener Stream braucht eine Kopie. */
export function compositeArena(
  target: CanvasRenderingContext2D,
  webgl: HTMLCanvasElement,
  capture: boolean,
): void {
  const canvas = target.canvas;
  target.clearRect(0, 0, canvas.width, canvas.height);
  if (capture) {
    webgl.hidden = true;
    target.drawImage(webgl, 0, 0, canvas.width, canvas.height);
    return;
  }
  if (webgl.parentElement !== canvas.parentElement) {
    webgl.className = "arena-webgl-surface";
    webgl.setAttribute("aria-hidden", "true");
    canvas.before(webgl);
  }
  webgl.hidden = false;
}
