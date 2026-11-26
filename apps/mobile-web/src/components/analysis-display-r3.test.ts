import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BodyLoadAnalyzer } from "@motion-arena/motion-scoring";
import { synthFrame } from "@motion-arena/pose-engine";
import { describe, expect, it } from "vitest";
import { BodyDiagram } from "./BodyDiagram";
import { Ring } from "./common";

describe("Textalternativen der neuen Anzeigen", () => {
  it("gibt bei fehlenden Weltdaten keine Entwarnung für die Beanspruchung", () => {
    // CODEX-BEFUND: Sind alle Zonen unsicher, sagt die Textzusammenfassung trotzdem, keine Zone sei deutlich beansprucht.
    const load = new BodyLoadAnalyzer().update(synthFrame(0, { view: "front", kneeFlexDeg: 90, noWorld: true }));
    const html = renderToStaticMarkup(createElement(BodyDiagram, { load }));
    expect(html).not.toContain("Keine Zone deutlich beansprucht");
  });

  it("macht den sichtbaren Wert des Präzisionsrings im zugänglichen Namen verfügbar", () => {
    // CODEX-BEFUND: Das explizite aria-label des SVG-Bilds enthält nur den Titel.
    const html = renderToStaticMarkup(createElement(Ring, { value: 0.83, label: "Bewegungspräzision" }));
    expect(html).toMatch(/aria-label="[^"]*83[^"]*"/);
  });
});
