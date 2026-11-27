"""MakeHuman-Asset-Pakete (Zip) in MPFB installieren. Aufruf:
blender -b --python tools/figuren/install_packs.py -- <ordner-mit-zips>
"""
import glob
import os
import sys

import bpy

folder = sys.argv[sys.argv.index("--") + 1]
for path in sorted(glob.glob(os.path.join(folder, "*.zip"))):
    try:
        result = bpy.ops.mpfb.load_pack(filepath=path)
        print("PAKET", os.path.basename(path), result)
    except Exception as exc:  # noqa: BLE001 – weitermachen, am Ende zusammenfassen
        print("PAKET-FEHLER", os.path.basename(path), exc)
