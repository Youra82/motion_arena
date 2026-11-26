"""Bereichsmaske (Top/Shorts/Haar) für den Grab3d-Woman-Base-Körper bauen und den Atlas-Füllrand auffüllen.

Aufruf: python scripts/woman-look-mask.py <eingabe.glb> <ausgabe.glb> <maske.png> <grab3d-original.glb>
(Eingabe = per prepare-arena-model.mjs komprimierte GLB mit Originaltexturen; Ausgabe nach public/arena/bodies/.)

Der Fotoscan-Atlas besteht aus vielen Schnipseln auf orangem Füllgrund. Wird die Farbe nur im Shader nach
Helligkeit/Sättigung eingeteilt, sickert der Füllgrund an den Schnipselkanten ein (heller Saum, Sprenkel in
den Shorts). Deshalb:
  1. jeden Texel einer Klasse zuordnen (nächster Farbschwerpunkt in Lab),
  2. die Klassenkarte glätten (Modus 7×7) und in den Füllgrund hinein ausdehnen (nächster gültiger Texel),
  3. den Füllgrund der Farbtextur mit der Farbe des nächsten gültigen Texels füllen (kein Orange an Kanten),
  4. Kopfbereich (Dreiecke des Originalnetzes über dem Hals, in den UV-Raum gezeichnet) darf keine Kleidung sein:
     Iris und Augenweiß sind ebenfalls graue, wenig gesättigte Flecken und würden sonst als Top umgefärbt,
  5. Maske als PNG schreiben: R = Top, G = Shorts, B = Haar, Rest = Haut.
Ersetzt werden nur die Bilder (Farbe, Normalen, Rauheit – Füllgrund überall aufgefüllt, sonst Nahtlinien);
die Meshopt-Geometrie bleibt Byte für Byte erhalten.
"""

import json
import struct
import sys

import cv2
import numpy as np

# Farbschwerpunkte (sRGB) aus einer k-Means-Auswertung des Atlas
CENTRES = {
    "hair": [(61, 36, 23), (87, 56, 41), (42, 21, 10)],
    "skin": [(223, 155, 137), (233, 179, 153)],
    "pad": [(197, 97, 73)],
    "top": [(146, 133, 127)],
    "shorts": [(48, 51, 52)],
}
CLASSES = ["skin", "hair", "top", "shorts", "pad"]
# Saumhöhe der Hose (Bindepose, Meter): Knie 0,50 m, Hüftgelenk 0,86 m
HEM_Y = 0.60


def read_glb(path):
    data = open(path, "rb").read()
    jlen = struct.unpack_from("<I", data, 12)[0]
    gltf = json.loads(data[20 : 20 + jlen])
    off = 20 + jlen
    blen = struct.unpack_from("<I", data, off)[0]
    return gltf, bytearray(data[off + 8 : off + 8 + blen])


def write_glb(path, gltf, binary):
    js = json.dumps(gltf, separators=(",", ":")).encode()
    js += b" " * ((4 - len(js) % 4) % 4)
    binary = bytes(binary) + b"\x00" * ((4 - len(binary) % 4) % 4)
    with open(path, "wb") as f:
        f.write(struct.pack("<4sII", b"glTF", 2, 28 + len(js) + len(binary)))
        f.write(struct.pack("<I4s", len(js), b"JSON") + js)
        f.write(struct.pack("<I4s", len(binary), b"BIN\x00") + binary)


def classify(img):
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2Lab).astype(np.float32)
    best = np.full(img.shape[:2], np.inf, np.float32)
    label = np.zeros(img.shape[:2], np.uint8)
    for ci, name in enumerate(CLASSES):
        for rgb in CENTRES[name]:
            c = cv2.cvtColor(np.uint8([[rgb[::-1]]]), cv2.COLOR_BGR2Lab)[0, 0].astype(np.float32)
            # Helligkeit schwächer gewichten: Schatten/Falten bleiben in ihrer Klasse
            d = 0.35 * (lab[..., 0] - c[0]) ** 2 + (lab[..., 1] - c[1]) ** 2 + (lab[..., 2] - c[2]) ** 2
            closer = d < best
            best[closer] = d[closer]
            label[closer] = ci
    return label


def load_mesh(source_glb):
    """Originalnetz in Bindepose (Meter, Y oben): Positionen, UV, Dreiecke und Hautgewicht je Knochenname."""
    gltf, binary = read_glb(source_glb)
    prim = gltf["meshes"][0]["primitives"][0]
    data = bytes(binary)

    def attr(index, dtype, comps):
        acc = gltf["accessors"][index]
        view = gltf["bufferViews"][acc["bufferView"]]
        size = np.dtype(dtype).itemsize * comps
        stride = view.get("byteStride", size)
        start = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
        raw = np.frombuffer(data, np.uint8, count=stride * (acc["count"] - 1) + size, offset=start)
        rows = np.lib.stride_tricks.as_strided(raw, (acc["count"], size), (stride, 1))
        return np.ascontiguousarray(rows).view(dtype).reshape(acc["count"], comps)

    a = prim["attributes"]
    pos = attr(a["POSITION"], np.float32, 3)
    uv = attr(a["TEXCOORD_0"], np.float32, 2)
    joints = attr(a["JOINTS_0"], {5121: np.uint8, 5123: np.uint16}[gltf["accessors"][a["JOINTS_0"]]["componentType"]], 4)
    weights = attr(a["WEIGHTS_0"], np.float32, 4)
    acc = gltf["accessors"][prim["indices"]]
    view = gltf["bufferViews"][acc["bufferView"]]
    dtype = {5123: np.uint16, 5125: np.uint32}[acc["componentType"]]
    tri = np.frombuffer(data, dtype, count=acc["count"], offset=view.get("byteOffset", 0) + acc.get("byteOffset", 0)).reshape(-1, 3)
    names = [gltf["nodes"][j]["name"] for j in gltf["skins"][0]["joints"]]

    def weight(*bones):
        ids = [names.index(b) for b in bones]
        return (weights * np.isin(joints, ids)).sum(1)

    return pos, uv, tri, weight


def head_uv_mask(mesh, size, neck_y=1.40):
    """UV-Pixel aller Dreiecke, deren Ecken alle über dem Hals liegen."""
    pos, uv, tri, _ = mesh
    head = tri[(pos[tri, 1] > neck_y).all(1)]
    mask = np.zeros((size, size), np.uint8)
    cv2.fillPoly(mask, list(np.round(uv[head] * size).astype(np.int32)), 1)
    return cv2.dilate(mask, np.ones((5, 5), np.uint8)).astype(bool)


def legging_uv(mesh, size, hem_y, top_y=0.93):
    """
    Hosenverlängerung: Oberschenkel-Texel zwischen Saum (hem_y) und Hüfte, je Texel aus der Höhe der Oberfläche
    interpoliert (gerader Saum statt Dreieckszacken). Rückgabe: Hosenfläche und Saumband (unterste 8 mm).
    """
    pos, uv, tri, weight = mesh
    thigh = weight("LeftUpLeg", "RightUpLeg")
    seat = thigh + weight("Hips")
    y = pos[:, 1]
    keep = ((thigh[tri] >= 0.5).all(1) | ((seat[tri] >= 0.6).all(1) & (y[tri] < 0.90).all(1)))
    keep &= (y[tri].max(1) > hem_y - 0.01) & (y[tri].min(1) < top_y)
    area = np.zeros((size, size), bool)
    band = np.zeros((size, size), bool)
    for t in tri[keep]:
        p = uv[t] * size
        x0, y0 = np.floor(p.min(0)).astype(int)
        x1, y1 = np.ceil(p.max(0)).astype(int)
        x0, y0 = max(x0, 0), max(y0, 0)
        x1, y1 = min(x1, size - 1), min(y1, size - 1)
        if x1 < x0 or y1 < y0:
            continue
        gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        (ax, ay), (bx, by), (cx, cy) = p
        den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
        if abs(den) < 1e-9:
            continue
        l1 = ((by - cy) * (gx - cx) + (cx - bx) * (gy - cy)) / den
        l2 = ((cy - ay) * (gx - cx) + (ax - cx) * (gy - cy)) / den
        l3 = 1 - l1 - l2
        inside = (l1 >= -0.02) & (l2 >= -0.02) & (l3 >= -0.02)
        h = l1 * y[t[0]] + l2 * y[t[1]] + l3 * y[t[2]]
        sl = (slice(y0, y1 + 1), slice(x0, x1 + 1))
        area[sl] |= inside & (h > hem_y) & (h < top_y)
        band[sl] |= inside & (h > hem_y) & (h < hem_y + 0.008)
    # Randtexel, die kein Originaldreieck bedeckt (das vereinfachte Laufzeitnetz greift dort etwas über), gehören
    # zum nächsten bedeckten Texel – so wächst die Hose genau bis an ihren Schnipselrand, nicht in fremde Schnipsel
    cover = np.zeros((size, size), np.uint8)
    cv2.fillPoly(cover, list(np.round(uv[tri] * size - 0.5).astype(np.int32)), 1)
    ny, nx = nearest_valid(cover.astype(bool))
    return area[ny, nx], band[ny, nx]


def mode_filter(label, k=7):
    votes = np.stack([cv2.blur((label == ci).astype(np.float32), (k, k)) for ci in range(len(CLASSES))])
    return votes.argmax(0).astype(np.uint8)


def nearest_valid(valid):
    """Für jeden Texel die Koordinaten des nächsten gültigen Texels."""
    _, idx = cv2.distanceTransformWithLabels((~valid).astype(np.uint8), cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
    ys, xs = np.nonzero(valid)
    # Labels zählen die Null-Pixel zeilenweise (wie np.nonzero)
    return ys[idx - 1], xs[idx - 1]


def main():
    src, dst, mask_path, source_glb = sys.argv[1:5]
    gltf, binary = read_glb(src)
    material = gltf["materials"][0]
    image_index = gltf["textures"][material["pbrMetallicRoughness"]["baseColorTexture"]["index"]]["source"]
    view_index = gltf["images"][image_index]["bufferView"]
    view = gltf["bufferViews"][view_index]
    start = view.get("byteOffset", 0)
    img = cv2.imdecode(np.frombuffer(bytes(binary[start : start + view["byteLength"]]), np.uint8), cv2.IMREAD_COLOR)

    label = mode_filter(classify(img))
    pad = CLASSES.index("pad")
    mesh = load_mesh(source_glb)
    head = head_uv_mask(mesh, img.shape[0])
    label[head & np.isin(label, [CLASSES.index("top"), CLASSES.index("shorts")])] = CLASSES.index("skin")
    # Kleinstflecken (Glanzlichter im Haar, Hautfalten) gehören nicht zur Kleidung: wie Füllgrund behandeln,
    # sie bekommen unten die Klasse der Umgebung
    for name in ("top", "shorts", "hair"):
        n, comp, stats, _ = cv2.connectedComponentsWithStats((label == CLASSES.index(name)).astype(np.uint8), connectivity=8)
        small = np.isin(comp, np.nonzero(stats[:, cv2.CC_STAT_AREA] < 900)[0]) & (comp > 0)
        label[small] = pad
    # (vor dem Auffüllen, damit Stofffarbe und Hosen-Klasse auch in die Schnipselränder wachsen)
    # Hose bis eine Handbreit über das Knie (Knie bei 0,50 m): sonst wirken die knappen Shorts wie ein Tanga.
    # Die neue Fläche bekommt Stofffarbe mit der Schattierung der Haut darunter und einen leicht dunkleren Saum.
    area, band = legging_uv(mesh, img.shape[0], HEM_Y)
    area &= ~np.isin(label, [CLASSES.index("hair"), CLASSES.index("pad")])
    skin_px = area & (label == CLASSES.index("skin"))
    lum = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32)
    ref = float(np.median(lum[skin_px])) if skin_px.any() else 180.0
    shorts_ref = np.array(CENTRES["shorts"][0][::-1], np.float32)
    shade = np.clip(lum / ref, 0.55, 1.35)[..., None]
    fabric = shorts_ref * shade * np.where(band, 0.72, 1.0)[..., None]
    img = np.where(skin_px[..., None], np.clip(fabric, 0, 255), img).astype(np.uint8)
    label[area] = CLASSES.index("shorts")

    valid = label != pad
    # Kanten der Schnipsel (2 px) als unsicher behandeln: dort mischt die JPEG-/Mip-Filterung den Füllgrund ein
    valid = cv2.erode(valid.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)
    ny, nx = nearest_valid(valid)
    label = label[ny, nx]
    extension = area[ny, nx]
    clean = img[ny, nx]
    # Augenweiß dämpfen: auf dem Scan fehlt der Schatten der Lider, die hellen Flächen leuchten sonst im Raumlicht
    lab = cv2.cvtColor(clean, cv2.COLOR_BGR2Lab).astype(np.int16)
    chroma = np.abs(lab[..., 1] - 128) + np.abs(lab[..., 2] - 128)
    white = head & (lab[..., 0] > 190) & (chroma < 18) & (label == CLASSES.index("skin"))
    white = cv2.GaussianBlur(cv2.dilate(white.astype(np.uint8) * 255, np.ones((3, 3), np.uint8)), (5, 5), 0) / 255.0
    clean = (clean * (1 - 0.3 * white[..., None])).astype(np.uint8)

    names = {"top": 2, "shorts": 1, "hair": 0}  # BGR-Kanäle: R=Top, G=Shorts, B=Haar
    mask = np.zeros(img.shape, np.uint8)
    for name, channel in names.items():
        mask[..., channel] = np.where(label == CLASSES.index(name), 255, 0)
    # gleiche Auflösung wie die Farbtextur: an Schnipselnähten mischen Farbe und Maske dann gleich stark
    cv2.imwrite(mask_path, mask, [cv2.IMWRITE_PNG_COMPRESSION, 9])

    replace = {}
    for image in gltf["images"]:
        v = gltf["bufferViews"][image["bufferView"]]
        a = v.get("byteOffset", 0)
        pic = cv2.imdecode(np.frombuffer(bytes(binary[a : a + v["byteLength"]]), np.uint8), cv2.IMREAD_COLOR)
        if pic.shape[:2] != img.shape[:2]:
            # andere Auflösung: Nachbarkoordinaten passend skalieren
            sy, sx = pic.shape[0] / img.shape[0], pic.shape[1] / img.shape[1]
            yy = (np.arange(pic.shape[0]) / sy).astype(int)
            xx = (np.arange(pic.shape[1]) / sx).astype(int)
            fy = (ny[yy][:, xx] * sy).astype(int).clip(0, pic.shape[0] - 1)
            fx = (nx[yy][:, xx] * sx).astype(int).clip(0, pic.shape[1] - 1)
            filled = pic[fy, fx]
        else:
            filled = clean if image["bufferView"] == view_index else pic[ny, nx]
            if gltf["textures"][material["normalTexture"]["index"]]["source"] == gltf["images"].index(image):
                # Hosenverlängerung: glatte Stoff-Normalen statt der Haut-Normalen mit ihren Schnipselkanten
                filled = filled.copy()
                filled[extension] = (255, 128, 128)
        ok, jpg = cv2.imencode(".jpg", filled, [cv2.IMWRITE_JPEG_QUALITY, 90])
        assert ok
        replace[image["bufferView"]] = jpg.tobytes()
        image["mimeType"] = "image/jpeg"
    # Alle Abschnitte von Puffer 0 (auch Meshopt-Daten) neu anordnen
    segments = []
    for i, v in enumerate(gltf["bufferViews"]):
        if v.get("buffer", 0) == 0:
            segments.append(("view", i, v))
        ext = v.get("extensions", {}).get("EXT_meshopt_compression")
        if ext and ext.get("buffer", 0) == 0:
            segments.append(("ext", i, ext))
    out = bytearray()
    for kind, i, holder in sorted(segments, key=lambda s: s[2].get("byteOffset", 0)):
        a = holder.get("byteOffset", 0)
        chunk = replace[i] if (kind == "view" and i in replace) else bytes(binary[a : a + holder["byteLength"]])
        out += b"\x00" * ((4 - len(out) % 4) % 4)
        holder["byteOffset"] = len(out)
        holder["byteLength"] = len(chunk)
        out += chunk
    gltf["buffers"][0]["byteLength"] = len(out)
    write_glb(dst, gltf, out)
    share = {n: float((label == CLASSES.index(n)).mean()) for n in ("skin", "hair", "top", "shorts")}
    print(f"{dst}: {len(out) / 1e6:.2f} MB, Maske {mask_path}, Anteile {share}")


if __name__ == "__main__":
    main()
