"""MakeHuman-Grundkörper (hm08) für die Werkstätten laden: Punkte, Haut-UV, Flächen, Gelenke, Knochengewichte.

Reines Python + numpy (läuft in Blender und außerhalb). Einheiten wie die .obj-Datei (Dezimeter, Y oben, Z nach vorn,
X = linke Körperseite positiv). Nur die Gruppe „body“ zählt als Haut; „joint-*“-Gruppen liefern Gelenkpunkte.
"""

import json
import os
from functools import lru_cache

import numpy as np

MPFB = os.environ.get("MPFB_DIR") or os.path.join(
    os.environ.get("APPDATA", ""), "Blender Foundation", "Blender", "4.5", "extensions", "user_default", "mpfb")
DATA = os.path.join(MPFB, "data")


class Grundkoerper:
    def __init__(self, verts, uvs, faces, face_uvs, joints, weights):
        self.verts = verts          # (N,3) float
        self.uvs = uvs              # (M,2) float
        self.faces = faces          # Liste von Index-Tupeln (Haut)
        self.face_uvs = face_uvs    # passende UV-Indizes
        self.joints = joints        # Name → (3,) Mittelpunkt der Gelenkgruppe
        self.weights = weights      # Knochenname (ohne „mixamorig:“) → (N,) Gewicht
        self.normals = self._normals()

    def _normals(self):
        n = np.zeros_like(self.verts)
        for f in self.faces:
            p = self.verts[list(f)]
            # Flächennormale (Vielecke: über Fächer von Punkt 0)
            for i in range(1, len(f) - 1):
                c = np.cross(p[i] - p[0], p[i + 1] - p[0])
                n[list(f)] += c
        length = np.linalg.norm(n, axis=1, keepdims=True)
        return n / np.maximum(length, 1e-9)

    def w(self, *bones):
        """Summe der Gewichte mehrerer Knochen je Punkt."""
        out = np.zeros(len(self.verts))
        for b in bones:
            out += self.weights.get(b, 0)
        return out

    def j(self, name):
        return self.joints[name]


@lru_cache(maxsize=1)
def laden() -> Grundkoerper:
    verts, uvs, faces, face_uvs, groups = [], [], [], [], {}
    group = None
    for line in open(os.path.join(DATA, "3dobjs", "base.obj"), encoding="utf-8"):
        if line.startswith("v "):
            verts.append([float(x) for x in line.split()[1:4]])
        elif line.startswith("vt "):
            uvs.append([float(x) for x in line.split()[1:3]])
        elif line.startswith("g "):
            group = line.split()[1]
        elif line.startswith("f "):
            idx = [p.split("/") for p in line.split()[1:]]
            vi = tuple(int(p[0]) - 1 for p in idx)
            ti = tuple(int(p[1]) - 1 for p in idx) if len(idx[0]) > 1 and idx[0][1] else vi
            groups.setdefault(group, []).append(vi)
            if group == "body":
                faces.append(vi)
                face_uvs.append(ti)
    verts = np.array(verts, float)
    joints = {g[6:]: verts[sorted({i for f in fs for i in f})].mean(0) for g, fs in groups.items() if g.startswith("joint-")}
    raw = json.load(open(os.path.join(DATA, "rigs", "standard", "weights.mixamo.json"), encoding="utf-8"))["weights"]
    weights = {}
    for bone, pairs in raw.items():
        arr = np.zeros(len(verts))
        for i, wv in pairs:
            arr[i] = wv
        weights[bone.replace("mixamorig:", "")] = arr
    # Gewichte je Punkt normieren (die Datei speichert sie nicht auf Summe 1 – z. B. Hand nur 0,2)
    total = sum(weights.values())
    for k in weights:
        weights[k] = np.where(total > 0, weights[k] / np.maximum(total, 1e-9), 0.0)
    return Grundkoerper(verts, np.array(uvs, float), faces, face_uvs, joints, weights)


if __name__ == "__main__":
    b = laden()
    body = sorted({i for f in b.faces for i in f})
    print("Punkte", len(b.verts), "Haut-Flächen", len(b.faces), "Haut-Punkte", len(body))
    print("Ausdehnung", b.verts[body].min(0).round(2), b.verts[body].max(0).round(2))
    for name in ("ground", "l-ankle", "l-knee", "l-upper-leg", "pelvis", "spine-1", "spine-2", "spine-3", "spine-4",
                 "neck", "head", "l-clavicle", "l-shoulder", "l-elbow"):
        print(f"  {name:12s}", b.j(name).round(3))
    print("Knochen", sorted(b.weights)[:12], "…")
