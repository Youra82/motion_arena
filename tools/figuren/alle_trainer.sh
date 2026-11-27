#!/usr/bin/env bash
# Alle Trainer der Reihe nach: Cycles-Kniebeuge → Porträt hochrechnen → neuronal rendern → in die App übernehmen.
# Aufruf: bash tools/figuren/alle_trainer.sh [ids…]   (ohne Angabe: alle 15). Protokoll: assets-src/figuren/stapel.log
# Fertige Schritte werden übersprungen (Ordner/Dateien vorhanden) – der Lauf lässt sich jederzeit fortsetzen.
set -u
cd "$(dirname "$0")/../.."
export HF_HOME=D:/tools/hf HF_HUB_DISABLE_TELEMETRY=1 PYTHONIOENCODING=utf-8
BL=/d/tools/blender/blender.exe
PY=/d/tools/venv-figuren/Scripts/python.exe
HDR="D:/botprojekte/motion_arena/apps/mobile-web/public/arena/concepts/core-studio-light.hdr"
LOG=assets-src/figuren/stapel.log
IDS=("$@")
[ ${#IDS[@]} -eq 0 ] && IDS=(lukas elena ken mia david aiko viktor nova matteo raven finn sara leo zara echo)

declare -A KLEIDUNG=(
  [lukas]="a black fitted athletic t-shirt and black shorts"
  [elena]="a black sports bra and black leggings with orange side stripes"
  [ken]="a black sleeveless training top and black shorts"
  [mia]="a berry pink sports bra and dark leggings"
  [david]="a grey athletic tank top and black shorts"
  [aiko]="a sage green tank top and sage green leggings"
  [viktor]="a black fitted athletic t-shirt and dark shorts"
  [nova]="an olive green tank top and navy leggings"
  [matteo]="a grey fitted athletic t-shirt and grey shorts"
  [raven]="a black sports bra and black leggings"
  [finn]="a light grey tank top and navy shorts"
  [sara]="a teal tank top and dark grey leggings"
  [leo]="a black sleeveless training top and black shorts"
  [zara]="a lime green sports bra and black leggings"
  [echo]="a black compression shirt with teal accents and black compression tights"
)

for id in "${IDS[@]}"; do
  echo "$(date +%H:%M:%S) === $id" | tee -a "$LOG"
  desc=$($PY -c "import sys; sys.path.insert(0,'tools/figuren'); import gesicht_hochrechnen as g; print(g.BESCHREIBUNG['$id'])")
  blend=assets-src/figuren/blend/$id-sss.blend
  if [ ! -f "$blend" ]; then
    FIGUR_HAUT_TYP=ENHANCED_SSS $BL -b --python tools/figuren/build_figure.py -- tools/figuren/figuren.json "$id" \
      "assets-src/figuren/blend/$id-sss.glb" "$blend" >> "$LOG" 2>&1 || { echo "FEHLER Bau $id" | tee -a "$LOG"; continue; }
  fi
  frames=assets-src/figuren/squat/$id
  if [ "$(ls "$frames"/squat_*.png 2>/dev/null | wc -l)" -lt 21 ]; then
    $BL -b "$blend" --python tools/figuren/render_squat.py -- "$HDR" "D:/botprojekte/motion_arena/$frames" 21 128 720 1080 \
      >> "$LOG" 2>&1 || { echo "FEHLER Cycles $id" | tee -a "$LOG"; continue; }
  fi
  echo "$(date +%H:%M:%S) Cycles fertig $id" | tee -a "$LOG"
  if [ ! -f "assets-src/gesichter/hoch/$id.png" ]; then
    $PY tools/figuren/gesicht_hochrechnen.py docs/references/avatars_15.png assets-src/gesichter/hoch "$id" 0.38 >> "$LOG" 2>&1
  fi
  neural=assets-src/figuren/neural/$id
  if [ "$(ls "$neural"/squat_*.png 2>/dev/null | wc -l)" -lt 21 ]; then
    $PY tools/figuren/neural_trainer.py "$frames" "assets-src/gesichter/hoch/$id.png" "$neural" \
      "$desc, wearing ${KLEIDUNG[$id]} and black running sneakers with orange soles" 0.40 >> "$LOG" 2>&1 \
      || { echo "FEHLER Neural $id" | tee -a "$LOG"; continue; }
  fi
  mkdir -p "assets-src/figuren/neural-png/$id" && cp "$neural"/squat_*.png "assets-src/figuren/neural-png/$id/"
  python -I tools/figuren/pack_frames.py "assets-src/figuren/neural-png/$id" "apps/mobile-web/public/arena/renders/$id" 900 >> "$LOG" 2>&1
  python -I -c "
import cv2, numpy as np
im = cv2.imread('assets-src/figuren/neural-png/$id/squat_060.png', cv2.IMREAD_UNCHANGED)
ys, xs = np.nonzero(im[..., 3] > 5)
c = im[max(0, ys.min() - 12):ys.max() + 12, max(0, xs.min() - 12):xs.max() + 12]
c = cv2.resize(c, (round(c.shape[1] * 720 / c.shape[0]), 720), interpolation=cv2.INTER_AREA)
cv2.imwrite('apps/mobile-web/public/menu/figures/$id.webp', c, [cv2.IMWRITE_WEBP_QUALITY, 90])"
  echo "$(date +%H:%M:%S) FERTIG $id" | tee -a "$LOG"
done
echo "$(date +%H:%M:%S) STAPEL ENDE" | tee -a "$LOG"
