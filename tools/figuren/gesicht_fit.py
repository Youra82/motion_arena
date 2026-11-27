"""Gesichts-Werkstatt, Schritt 4: Gesichtsformen (MakeHuman-Targets) an die Konzeptporträts anpassen.

Aufruf: python tools/figuren/gesicht_fit.py <vorlage.json> <zuordnung.json> <basis-ordner> <figuren.json> [ids]
Je Avatar: Kopfmodell M(w) = Basis + Σ w_k · Δ_k (rund 300 Gesichts-Targets, 0 ≤ w ≤ 1) an die 478 Porträtpunkte
angleichen – abwechselnd Ähnlichkeitstransformation (Umeyama) und beschränkte Ausgleichsrechnung mit Dämpfung.
Ergebnis landet als "gesicht": {target: gewicht} in figuren.json; das Bau-Skript lädt diese Targets.
"""

import glob
import gzip
import json
import os
import sys

import numpy as np
from scipy.optimize import lsq_linear

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from grundkoerper import DATA, laden  # noqa: E402

FOLDERS = ["eyes", "nose", "mouth", "chin", "cheek", "forehead", "head", "eyebrows"]
LAMBDA = 0.04       # Dämpfung: Formen nur einsetzen, wenn sie die Punkte deutlich besser treffen
Z_WEIGHT = 0.35     # Tiefe der Porträtpunkte ist unsicherer als x/y
MOUTH_WEIGHT = 0.3  # Lächeln im Porträt nicht als neutrale Mundform übernehmen


def load_targets(vertex_ids):
    names, deltas = [], []
    index = {v: i for i, v in enumerate(vertex_ids)}
    for folder in FOLDERS:
        for path in sorted(glob.glob(os.path.join(DATA, "targets", folder, "*.target.gz"))):
            d = np.zeros((len(vertex_ids), 3))
            hit = False
            for line in gzip.open(path, "rt"):
                parts = line.split()
                if len(parts) != 4 or not parts[0].isdigit():
                    continue
                v = int(parts[0])
                if v in index:
                    d[index[v]] = [float(p) for p in parts[1:]]
                    hit = True
            if hit and np.abs(d).max() > 1e-4:
                names.append(os.path.basename(path)[: -len(".target.gz")])
                deltas.append(d)
    return names, np.array(deltas)


def umeyama(src, dst, w):
    """Ähnlichkeitstransformation s·R·src + t ≈ dst (gewichtet)."""
    w = w / w.sum()
    mu_s, mu_d = (w[:, None] * src).sum(0), (w[:, None] * dst).sum(0)
    a, b = src - mu_s, dst - mu_d
    cov = (w[:, None] * b).T @ a
    u, sig, vt = np.linalg.svd(cov)
    d = np.sign(np.linalg.det(u @ vt))
    S = np.diag([1, 1, d])
    R = u @ S @ vt
    var = (w * (a ** 2).sum(1)).sum()
    s = (sig * np.diag(S)).sum() / var
    t = mu_d - s * R @ mu_s
    return s, R, t


def main():
    vorlage = json.load(open(sys.argv[1], encoding="utf-8"))
    zuordnung = json.load(open(sys.argv[2]))
    mapping = np.array(zuordnung["punkte"])
    ref = np.array(zuordnung["standard_messung"])
    REF = np.stack([ref[:, 0], -ref[:, 1], -ref[:, 2]], 1)  # MediaPipe-Messung des Standardkopfs
    basis_dir, figs_path = sys.argv[3], sys.argv[4]
    ids = sys.argv[5].split(",") if len(sys.argv) > 5 else list(vorlage)
    names, D = load_targets(sorted(set(mapping.tolist())))
    uniq = {v: i for i, v in enumerate(sorted(set(mapping.tolist())))}
    D = D[:, [uniq[v] for v in mapping], :]            # (K, 478, 3)
    K = len(names)
    print("Gesichtsformen:", K)
    b = laden()
    figs = json.load(open(figs_path, encoding="utf-8"))
    for avatar in ids:
        base = np.load(os.path.join(basis_dir, f"{avatar}.npy"))[mapping]
        pts = np.array(vorlage[avatar]["punkte"])
        L = np.stack([pts[:, 0], -pts[:, 1], -pts[:, 2]], 1)
        mouth_c = b.verts[mapping][[13, 14]].mean(0)
        wpt = np.where(np.linalg.norm(b.verts[mapping] - mouth_c, axis=1) < 0.5, MOUTH_WEIGHT, 1.0)
        rows_w = np.repeat(wpt, 3) * np.tile([1.0, 1.0, Z_WEIGHT], len(wpt))
        # Nur den Unterschied Porträt − Standardkopf (beide von MediaPipe gemessen) übernehmen: die Eigenheiten der
        # Messung (Tiefe, Gesichtsbreite) heben sich auf, übrig bleibt, was dieses Gesicht vom Standard unterscheidet.
        std = np.load(os.path.join(basis_dir, "..", "standard.npy"))[mapping]
        s0, R0, t0 = umeyama(std, REF, wpt)
        ref_model = ((REF - t0) @ R0) / s0
        w = np.zeros(K)
        for it in range(6):
            M = base + np.tensordot(w, D, 1)
            s, R, t = umeyama(M, L, wpt)
            portrait_model = ((L - t) @ R) / s
            # Messabweichung des Standardkopfs (in seinem Raum) abziehen; Gesichtsgröße ans Avatar-Gesicht anpassen
            Lm = portrait_model - (ref_model - std) * (np.ptp(base[:, 1]) / np.ptp(std[:, 1]))
            A = D.reshape(K, -1).T * rows_w[:, None]
            rhs = (Lm - base).ravel() * rows_w
            A_aug = np.vstack([A, np.sqrt(LAMBDA) * np.eye(K)])
            rhs_aug = np.concatenate([rhs, np.zeros(K)])
            w = lsq_linear(A_aug, rhs_aug, bounds=(0, 1), method="bvls").x
        err0 = np.sqrt((((base - Lm) ** 2).sum(1) * wpt).mean())
        err1 = np.sqrt((((base + np.tensordot(w, D, 1) - Lm) ** 2).sum(1) * wpt).mean())
        # symmetrisch (Einseitigkeit stammt von halb gedrehten Porträts), ohne Kopfneigung (Haltung, keine Form)
        vals = dict(zip(names, w))
        for n in list(vals):
            for a, c in (("l-", "r-"),):
                if n.startswith(a) and c + n[2:] in vals:
                    m = (vals[n] + vals[c + n[2:]]) / 2
                    vals[n] = vals[c + n[2:]] = m
        used = {n: round(float(x), 3) for n, x in vals.items() if x >= 0.03 and not n.startswith("head-angle")}
        figs["figuren"][avatar]["gesicht"] = used
        top = sorted(used.items(), key=lambda kv: -kv[1])[:6]
        print(f"{avatar:7s} Abweichung {err0:.3f} → {err1:.3f} dm, Formen {len(used)}: {top}")
    json.dump(figs, open(figs_path, "w", encoding="utf-8", newline="\n"), ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
