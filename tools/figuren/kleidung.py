"""Kleidungs-Werkstatt: eng anliegende Sportkleidung direkt aus der Körperoberfläche des MakeHuman-Grundkörpers.

Ein Kleidungsstück = ausgewählte Hautflächen (Zone über Höhe, Knochengewichte, Seite), 2–5 mm nach außen versetzt.
Gespeichert im MakeHuman-Format (.mhclo/.obj/.mhmat + Texturen) – dadurch passt es auf jeden Körper (alle 15 Avatare)
und bekommt automatisch die Skelettgewichte. Haut unter dem Stoff wird ausgeblendet (delete_verts), damit nichts
durchdrückt. Stoff: Strickstruktur, Bund, Säume, Nähte und Akzentstreifen werden als Textur erzeugt (Farben je Avatar).

Reines Python + numpy, keine Blender-Abhängigkeit:
  python tools/figuren/kleidung.py leggings "#1a1b1e" "#ff704b" [zielordner]
"""

import hashlib
import os
import struct
import sys
import uuid
import zlib

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from grundkoerper import DATA, laden  # noqa: E402

TEX = 2048


# ---------------------------------------------------------------- Schnitte als Felder (innen > 0)
# Jedes Stück ist ein Feld über den Körperpunkten: Höhen in Dezimetern, „und“ = min, „oder“ = max, „ohne“ = −.
# Die Kante liegt genau dort, wo das Feld 0 wird (Randpunkte werden auf die Nulllinie gezogen → glatte Säume).

def _zonen(b):
    v, y = b.verts, b.verts[:, 1]
    x, z = v[:, 0], v[:, 2]
    ax = np.abs(x)
    J = b.j
    waist = J("spine-3")[1] + 0.1
    low_waist = J("spine-4")[1]
    knee, hip = J("l-knee")[1], J("l-upper-leg")[1]
    ankle = J("l-ankle")[1]
    chest = J("spine-1")[1]
    under_bust = J("spine-2")[1] + 0.25
    neck = J("neck")[1]
    shoulder_x = J("l-shoulder")[0]
    arm_bones = [k for k in b.weights if "Arm" in k or "Hand" in k]
    armw = b.w(*arm_bones)
    oberarm = b.w("LeftArm", "RightArm")
    kein_arm = 0.3 - armw                      # > 0 außerhalb von Armen, Händen und Fingern
    kein_kopf = (neck - 0.05) - y

    def band(lo, hi):
        return np.minimum(y - lo, hi - y)

    def ohne(*terms):
        return -np.minimum.reduce(terms)

    # Ausschnitt vorn (Ellipse um die Körpermitte) und Armloch (Ellipse um das Schultergelenk)
    def ausschnitt_vorn(depth, width):
        """Runder Ausschnitt vorn: Halbellipse unter dem Hals bis zur Tiefe `depth`, Breite `width`."""
        top = neck + 0.2
        r = np.hypot(ax / width, np.maximum(0, top - y) / max(top - depth, 1e-3))
        return np.where(z > 0.15, (r - 1.0) * width, 1.0)

    def armloch(tiefe):
        d = np.hypot((ax - shoulder_x) / 0.62, (y - (chest + 0.55)) / tiefe)
        return d - 1.0                            # > 0 außerhalb des Armlochs

    # Ärmel: Lage entlang der Oberarmachse (0 = Schulter, 1 = Ellbogen), je Körperseite
    def entlang_arm():
        out = np.zeros(len(v))
        for side, mask in (("l", x >= 0), ("r", x < 0)):
            sh, el = J(f"{side}-shoulder"), J(f"{side}-elbow")
            axis = el - sh
            out[mask] = ((v[mask] - sh) @ axis) / (axis @ axis)
        return out, np.linalg.norm(J("l-elbow") - J("l-shoulder"))
    arm_s, arm_len = entlang_arm()
    aermel = (0.45 - arm_s) * arm_len            # > 0 bis knapp vor die Oberarmmitte

    shorts_bottom = knee + 0.45 * (hip - knee)
    bike_bottom = knee + 0.28 * (hip - knee)
    return {
        "leggings": dict(feld=np.minimum.reduce([band(ankle + 0.75, waist), kein_arm]), top=waist,
                         bottom=ankle + 0.75, dicke=0.05, seitenstreifen=True),
        "radlerhose": dict(feld=np.minimum.reduce([band(bike_bottom, waist), kein_arm]), top=waist,
                           bottom=bike_bottom, dicke=0.055, seitenstreifen=True),
        "shorts": dict(feld=np.minimum.reduce([band(shorts_bottom, low_waist + 0.35), kein_arm]),
                       top=low_waist + 0.35, bottom=shorts_bottom, dicke=0.09, seitenstreifen=True),
        "sport_bh": dict(feld=np.minimum.reduce([
            np.maximum(
                np.minimum(band(under_bust, chest + 0.3), ausschnitt_vorn(chest - 0.3, 0.38)),
                np.minimum.reduce([band(chest, neck - 0.12), ax - 0.6, 1.06 - ax])),
            kein_arm, kein_kopf]), top=neck, bottom=under_bust, dicke=0.06, seitenstreifen=False),
        "tanktop": dict(feld=np.minimum.reduce([
            band(low_waist + 0.1, neck - 0.08), kein_arm, armloch(1.25), ausschnitt_vorn(chest + 0.1, 0.62),
            ohne(0.5 - ax, y - (chest + 0.6), -z)]), top=neck, bottom=low_waist + 0.1, dicke=0.07,
            seitenstreifen=False),
        "shirt": dict(feld=np.minimum.reduce([
            band(low_waist + 0.1, neck - 0.04),
            np.maximum(kein_arm, np.minimum(aermel, oberarm + 0.2 - 0.5)),
            ausschnitt_vorn(chest + 0.8, 0.5)]), top=neck, bottom=low_waist + 0.1, dicke=0.07,
            seitenstreifen=False),
    }


# ---------------------------------------------------------------- Geometrie

def _nachbarn(b):
    """Flächennachbarn (auch über die Diagonale eines Vierecks) – sonst bleiben Ecken als Zacken stehen."""
    nb = [set() for _ in range(len(b.verts))]
    for f in b.faces:
        for a in f:
            nb[a].update(f)
            nb[a].discard(a)
    return nb


def _schnitt(b, art):
    """Flächen mit mindestens einem Innenpunkt; Außenpunkte dieser Flächen wandern auf die Nulllinie des Felds."""
    z = _zonen(b)[art]
    f = z["feld"]
    inside = f > 0
    faces = [(fv, ft) for fv, ft in zip(b.faces, b.face_uvs) if any(inside[i] for i in fv)]
    used = sorted({i for fv, _ in faces for i in fv})
    nb = _nachbarn(b)
    refs = {}
    for v in used:
        if inside[v]:
            refs[v] = ((v, v), (1.0, 0.0), np.zeros(3))
            continue
        # Mittel aller Kreuzungen mit Innen-Nachbarn → glatte Kante auch dort, wo die Linie schräg durch grobe
        # Flächen läuft (eine einzelne Kreuzung ergäbe Sägezähne). Bezug: der Punkt selbst + fester Versatz.
        cross = []
        for n in nb[v]:
            if inside[n]:
                t = f[n] / (f[n] - f[v])
                cross.append(b.verts[n] + (b.verts[v] - b.verts[n]) * float(np.clip(t, 0.0, 1.0)))
        refs[v] = ((v, v), (1.0, 0.0), (np.mean(cross, 0) - b.verts[v]) if cross else np.zeros(3))
    # Haut ausblenden: alles unter dem Stoff außer dem äußersten Ring (dort deckt der Saum)
    hidden = sorted(int(i) for i in used if inside[i])  # bis zur Schnittlinie: sonst sticht der Hautring durch
    return z, faces, used, refs, hidden


# ---------------------------------------------------------------- Stoff-Textur (im UV-Raum der Haut)

def _hex(h):
    return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], float) / 255


def _noise(p, scale, seed):
    """Wertrauschen aus 3D-Position (glatt, ohne Bibliotheken)."""
    q = p * scale
    i = np.floor(q)
    f = q - i
    f = f * f * (3 - 2 * f)

    def h(a):
        n = np.sin(a @ np.array([12.9898, 78.233, 37.719]) + seed) * 43758.5453
        return n - np.floor(n)
    out = 0
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                wgt = (f[:, 0] if dx else 1 - f[:, 0]) * (f[:, 1] if dy else 1 - f[:, 1]) * (f[:, 2] if dz else 1 - f[:, 2])
                out = out + wgt * h(i + np.array([dx, dy, dz]))
    return out


def _textur(b, art, z, faces, farbe, akzent, lagen):
    """Farb- und Normalen-Textur rastern: je Texel 3D-Position und Normale aus dem Dreieck interpolieren."""
    pos = np.zeros((TEX, TEX, 3), np.float32)
    nrm = np.zeros((TEX, TEX, 3), np.float32)
    filled = np.zeros((TEX, TEX), bool)
    for f, t in faces:
        for k in range(1, len(f) - 1):
            tri, tuv = (f[0], f[k], f[k + 1]), (t[0], t[k], t[k + 1])
            p = np.array([[b.uvs[u][0] * TEX, (1 - b.uvs[u][1]) * TEX] for u in tuv])
            x0, y0 = np.floor(p.min(0)).astype(int)
            x1, y1 = np.ceil(p.max(0)).astype(int)
            x0, y0, x1, y1 = max(x0, 0), max(y0, 0), min(x1, TEX - 1), min(y1, TEX - 1)
            if x1 < x0 or y1 < y0:
                continue
            gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
            (ax, ay), (bx, by), (cx, cy) = p
            den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
            if abs(den) < 1e-12:
                continue
            l1 = ((by - cy) * (gx - cx) + (cx - bx) * (gy - cy)) / den
            l2 = ((cy - ay) * (gx - cx) + (ax - cx) * (gy - cy)) / den
            l3 = 1 - l1 - l2
            inside = (l1 >= -0.01) & (l2 >= -0.01) & (l3 >= -0.01)
            if not inside.any():
                continue
            P = np.array([lagen[i][0] for i in tri])
            N = np.array([lagen[i][1] for i in tri])
            sl = (slice(y0, y1 + 1), slice(x0, x1 + 1))
            L = np.stack([l1, l2, l3], -1)
            pos[sl][inside] = (L @ P)[inside]
            nrm[sl][inside] = (L @ N)[inside]
            filled[sl] |= inside
    pts = pos[filled]
    nn = nrm[filled]
    nn /= np.maximum(np.linalg.norm(nn, axis=1, keepdims=True), 1e-9)
    y = pts[:, 1]
    base, acc = _hex(farbe), _hex(akzent)
    # Strickstruktur: feine Maschen (hochfrequent) + leichte Wolken (Stoffbahnen)
    knit = _noise(pts, 34.0, 1.7)
    cloud = _noise(pts, 3.0, 4.2)
    shade = 0.92 + 0.10 * cloud + 0.05 * (knit - 0.5)
    col = base[None, :] * shade[:, None]
    # Bund (oben) und Saum (unten): etwas dunkler/dichter gestrickt, mit Nahtlinie
    band = np.clip((y - (z["top"] - 0.38)) / 0.02, 0, 1) if art not in ("sport_bh", "tanktop", "shirt") else 0
    hem = np.clip(((z["bottom"] + 0.12) - y) / 0.02, 0, 1)
    col *= (1 - 0.18 * np.maximum(band, hem))[:, None]
    seam = np.exp(-(((y - (z["top"] - 0.38)) / 0.012) ** 2)) * (art not in ("sport_bh", "tanktop", "shirt"))
    seam = seam + np.exp(-(((y - (z["bottom"] + 0.12)) / 0.012) ** 2))
    col *= (1 - 0.35 * seam)[:, None]
    # Akzent: Seitenstreifen (Beine außen) bzw. Unterbrustband/Träger-Kante
    if z["seitenstreifen"]:
        side = nn[:, 0] * np.sign(pts[:, 0])   # nur die Außenseite (Normale zeigt von der Körpermitte weg)
        stripe = np.clip((side - 0.86) / 0.04, 0, 1) * (y < z["top"] - 0.4)
        col = col * (1 - stripe[:, None]) + acc[None, :] * (0.9 + 0.1 * cloud)[:, None] * stripe[:, None]
    else:
        under = np.exp(-(((y - (z["bottom"] + 0.22)) / 0.06) ** 2))
        col = col * (1 - under[:, None] * 0.85) + acc[None, :] * (under * 0.85)[:, None]
    # Normalen-Textur (Tangentenraum flach + Strick-Relief + Nahtrillen)
    eps = 0.002
    dk = (_noise(pts + [eps, 0, 0], 34.0, 1.7) - knit, _noise(pts + [0, eps, 0], 34.0, 1.7) - knit)
    bump_x = dk[0] / eps * 0.0025
    bump_y = dk[1] / eps * 0.0025 - (seam * 0.35)
    nmap = np.stack([0.5 - bump_x, 0.5 + bump_y, np.ones_like(y)], 1)
    rgb = np.zeros((TEX, TEX, 3), np.float32)
    nor = np.zeros((TEX, TEX, 3), np.float32)
    rgb[filled] = np.clip(col, 0, 1)
    nor[filled] = np.clip(nmap, 0, 1)
    # in die Ränder ausdehnen (Mip-Stufen mischen keinen leeren Hintergrund ein)
    for _ in range(12):
        grown = filled.copy()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            src = np.roll(filled, (dy, dx), (0, 1)) & ~filled
            rgb[src] = np.roll(rgb, (dy, dx), (0, 1))[src]
            nor[src] = np.roll(nor, (dy, dx), (0, 1))[src]
            grown |= src
        filled = grown
    nor[~filled] = (0.5, 0.5, 1.0)
    return rgb, nor


def _png(path, rgb):
    """Minimaler PNG-Schreiber (8 bit RGB) – ohne Bildbibliothek, damit es auch in Blender läuft."""
    data = (np.clip(rgb, 0, 1) * 255 + 0.5).astype(np.uint8)
    h, w, _ = data.shape
    raw = b"".join(b"\x00" + data[r].tobytes() for r in range(h))

    def chunk(kind, payload):
        return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)
    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
                + chunk(b"IDAT", zlib.compress(raw, 6)) + chunk(b"IEND", b""))


# ---------------------------------------------------------------- Ausgabe im MakeHuman-Format

def erzeugen(art, farbe, akzent, ziel=None):
    """Kleidungsstück erzeugen; gibt den Asset-Namen zurück (Ordner in MPFB-Kleidung)."""
    key = hashlib.sha1(f"{art}{farbe}{akzent}v8".encode()).hexdigest()[:8]
    name = f"ma_{art}_{key}"
    ziel = ziel or os.path.join(os.environ.get("APPDATA", ""), "Blender Foundation", "Blender", "4.5", "extensions",
                                ".user", "user_default", "mpfb", "data", "clothes")
    out = os.path.join(ziel, name)
    if os.path.isfile(os.path.join(out, f"{name}.mhclo")):
        return name
    os.makedirs(out, exist_ok=True)
    b = laden()
    z, faces, used, refs, hidden = _schnitt(b, art)
    index = {v: i for i, v in enumerate(used)}
    uv_used = sorted({u for _, t in faces for u in t})
    uv_index = {u: i for i, u in enumerate(uv_used)}
    def lage(v):
        (r0, r1), (w0, w1), shift = refs[v]
        p = b.verts[r0] * w0 + b.verts[r1] * w1 + shift
        n = b.normals[r0] * w0 + b.normals[r1] * w1
        return p, n / max(np.linalg.norm(n), 1e-9)
    pos = np.array([lage(v)[0] + lage(v)[1] * z["dicke"] for v in used])
    with open(os.path.join(out, f"{name}.obj"), "w", encoding="utf-8") as f:
        f.write(f"# Motion Arena Kleidungs-Werkstatt: {art}\n")
        for p in pos:
            f.write(f"v {p[0]:.5f} {p[1]:.5f} {p[2]:.5f}\n")
        for u in uv_used:
            f.write(f"vt {b.uvs[u][0]:.6f} {b.uvs[u][1]:.6f}\n")
        f.write(f"usemtl {name}\ng {name}\n")
        for fv, ft in faces:
            f.write("f " + " ".join(f"{index[v] + 1}/{uv_index[t] + 1}" for v, t in zip(fv, ft)) + "\n")
    # Maßstabsbezüge wie MakeClothes (Abstände zweier Körperpunkte je Achse im Grundkörper)
    def scale(axis, a, c):
        return f"{a} {c} {abs(b.verts[a][axis] - b.verts[c][axis]):.4f}"
    lines = [
        "# Motion Arena Kleidungs-Werkstatt (aus der Körperoberfläche erzeugt)",
        "# author Motion Arena", "# license CC0", f"uuid {uuid.uuid5(uuid.NAMESPACE_URL, name)}", "basemesh hm08", "",
        f"name {name}", f"obj_file {name}.obj",
        f"x_scale {scale(0, 5399, 11998)}", f"z_scale {scale(2, 962, 5320)}", f"y_scale {scale(1, 791, 881)}",
        "z_depth 50", f"material {name}.mhmat", "verts 0",
    ]
    for v in used:
        (r0, r1), (w0, w1), shift = refs[v]
        d = lage(v)[1] * z["dicke"] + shift
        lines.append(f"{r0} {r1} {r1} {w0:.5f} {w1:.5f} 0.0 {d[0]:.5f} {d[1]:.5f} {d[2]:.5f}")
    lines.append("")
    lines.append("delete_verts")
    for i in range(0, len(hidden), 16):
        lines.append(" ".join(str(h) for h in hidden[i:i + 16]))
    open(os.path.join(out, f"{name}.mhclo"), "w", encoding="utf-8").write("\n".join(lines) + "\n")
    lagen = {v: lage(v) for v in used}
    rgb, nor = _textur(b, art, z, faces, farbe, akzent, lagen)
    _png(os.path.join(out, f"{name}_diffuse.png"), rgb)
    _png(os.path.join(out, f"{name}_normal.png"), nor)
    open(os.path.join(out, f"{name}.mhmat"), "w", encoding="utf-8").write(
        f"name {name}\ndiffuseColor 1.0 1.0 1.0\nspecularColor 0.25 0.25 0.25\nshininess 0.15\nopacity 1.0\n"
        f"diffuseTexture {name}_diffuse.png\nnormalmapTexture {name}_normal.png\n"
        "shaderConfig diffuse true\nshaderConfig normal true\n")
    print("KLEIDUNG", name, "Flächen", len(faces), "Punkte", len(used), "verdeckte Haut", len(hidden))
    return name


if __name__ == "__main__":
    art, farbe, akzent = sys.argv[1], sys.argv[2], sys.argv[3]
    print(erzeugen(art, farbe, akzent, sys.argv[4] if len(sys.argv) > 4 else None))
