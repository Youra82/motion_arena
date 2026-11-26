/**
 * NUR ENTWICKLUNG (nicht im App-Bundle, wird von nichts importiert): rendert eine Figur der Arena als Standbild
 * für das Hauptmenü – gleiche Materialien, Haare, Schuhe und Core-Studio-Licht wie im Training.
 * Zwei Bilder (vor Schwarz und vor Weiß) ergeben in scripts/render-menu-figures.cjs eine exakte Freistellung.
 * Aufruf über den Vite-Entwicklungsserver: (await import("/src/dev/poster.ts")).poster("lukas", 62, 600, 900)
 */
import * as THREE from "three";
import { ArenaThree } from "../arena/arena-three";
import { poseTrainerContours } from "../arena/trainer-anatomy";
import { roomById } from "../render/rooms";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function poster(id: string, flex: number, width: number, height: number): Promise<{ black: string; white: string }> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true, antialias: true });
  if (!gl) throw new Error("kein WebGL2");
  // Interne Felder der Arena gezielt nutzen (Entwicklungswerkzeug, keine öffentliche Schnittstelle)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const a = new ArenaThree(canvas, gl) as any;
  const frame = { room: "loft", studioRoom: roomById("core-studio") };
  a.loadFigure("trainer", id);
  for (let i = 0; i < 400; i++) {
    a.useRoom(frame);
    if (a.environment.coreLightReady && a.trainer && a.figureId.trainer === id && !a.figureLoading.trainer) break;
    await wait(50);
  }
  if (a.figureId.trainer !== id) throw new Error(`Figur ${id} nicht geladen`);
  a.useRoom(frame);
  for (const o of [a.loft, a.floor, a.ring.group, a.shadow, ...a.footShadows, a.dots]) o.visible = false;
  if (a.player) a.player.root.visible = false;
  for (const g of a.ghosts) g.root.visible = false;
  const rig = a.trainer;
  rig.root.visible = true;
  rig.root.position.set(0, 0, 0);
  rig.root.rotation.y = 0.32;
  rig.pose(flex);
  poseTrainerContours(a.trainerMesh, flex, true);
  rig.root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(rig.root);
  const camera: THREE.PerspectiveCamera = a.camera;
  camera.fov = 24;
  camera.aspect = width / height;
  const centre = box.getCenter(new THREE.Vector3());
  const tall = box.max.y - box.min.y;
  const dist = (tall * 0.6) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  camera.position.set(centre.x, centre.y + tall * 0.12, centre.z + dist);
  camera.lookAt(centre.x, centre.y, centre.z);
  camera.updateProjectionMatrix();
  const renderer: THREE.WebGLRenderer = a.renderer;
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  const shot = (color: string) => {
    a.scene.background = new THREE.Color(color);
    // Spielerfigur und Nachbilder laden parallel – erst hier sicher ausblenden: nur Trainer und Licht bleiben
    for (const child of a.scene.children as THREE.Object3D[]) {
      if (child !== rig.root && !(child instanceof THREE.Light)) child.visible = false;
    }
    renderer.render(a.scene, camera);
    return canvas.toDataURL("image/png");
  };
  // Texturen (auch die Bereichsmaske der Frauenkörper) fertig laden lassen, dann zweimal zeichnen
  shot("#000000");
  await wait(2500);
  shot("#000000");
  return { black: shot("#000000"), white: shot("#ffffff") };
}
