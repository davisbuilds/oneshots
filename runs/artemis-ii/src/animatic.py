"""Low-resolution Workbench animatic of one scene (fast staging review).

python src/animatic.py -- --blend output/artemis_ii.blend --scene SC_Studio --out output/animatic/studio [--step 1] [--res 640]
"""
import argparse
import os
import sys

import bpy

COLORS = [  # material-name prefix -> viewport color (sRGB-ish)
    ("SOFI", (0.78, 0.36, 0.13)), ("Paint_White", (0.86, 0.86, 0.84)), ("Booster_FieldJoint", (0.62, 0.62, 0.6)),
    ("Paint_Grey", (0.35, 0.35, 0.35)), ("Paint_Dark", (0.08, 0.08, 0.08)), ("Black", (0.02, 0.02, 0.02)),
    ("Metal_Gold", (0.8, 0.6, 0.3)), ("Metal", (0.62, 0.62, 0.62)), ("RS25_Nozzle_Tubes_Exterior", (0.28, 0.22, 0.18)),
    ("RS25_Nozzle_Tubes_Interior", (0.7, 0.55, 0.42)), ("Carbon", (0.1, 0.1, 0.1)), ("RL10", (0.12, 0.12, 0.12)),
    ("Orion_Avcoat", (0.55, 0.45, 0.33)), ("Orion_Backshell", (0.7, 0.7, 0.72)), ("MLI_Silver", (0.75, 0.75, 0.78)),
    ("MLI_Gold", (0.8, 0.6, 0.25)), ("Blanket_White", (0.85, 0.84, 0.8)), ("Solar", (0.08, 0.1, 0.2)),
    ("Window", (0.02, 0.02, 0.03)), ("Fiducial", (0.4, 0.4, 0.4)), ("Cork", (0.35, 0.26, 0.18)),
    ("Decal_NASA", (0.85, 0.2, 0.15)), ("Decal_US", (0.6, 0.3, 0.35)), ("Decal_ESA", (0.8, 0.8, 0.8)),
    ("Studio_Floor", (0.03, 0.03, 0.035)),
]


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    ap = argparse.ArgumentParser()
    ap.add_argument("--blend", required=True)
    ap.add_argument("--scene", default="SC_Studio")
    ap.add_argument("--out", required=True)
    ap.add_argument("--step", type=int, default=1)
    ap.add_argument("--res", type=int, default=640)
    ap.add_argument("--start", type=int, default=None)
    ap.add_argument("--end", type=int, default=None)
    a = ap.parse_args(argv)
    bpy.ops.wm.open_mainfile(filepath=os.path.abspath(a.blend))
    sc = bpy.data.scenes[a.scene]
    bpy.context.window_manager  # noqa
    for m in bpy.data.materials:
        for pre, col in COLORS:
            if m.name.startswith(pre):
                m.diffuse_color = (*col, 1.0)
                break
    sc.render.engine = "BLENDER_WORKBENCH"
    sh = sc.display.shading
    sh.light = "STUDIO"
    sh.color_type = "MATERIAL"
    sh.show_shadows = True
    sh.shadow_intensity = 0.6
    sh.show_cavity = False
    sh.cavity_type = "WORLD"
    sh.background_type = "VIEWPORT" if hasattr(sh, "background_type") else None
    sc.display.shading.show_object_outline = False
    sc.render.resolution_x = a.res
    sc.render.resolution_y = a.res * 9 // 16
    sc.render.resolution_percentage = 100
    sc.render.use_motion_blur = False
    sc.render.image_settings.file_format = "JPEG"
    sc.render.image_settings.quality = 88
    sc.render.use_overwrite = True
    sc.render.film_transparent = False
    sc.frame_step = a.step
    if a.start:
        sc.frame_start = a.start
    if a.end:
        sc.frame_end = a.end
    os.makedirs(a.out, exist_ok=True)
    sc.render.filepath = os.path.join(os.path.abspath(a.out), "f_")
    bpy.context.window.scene = sc if bpy.context.window else None
    bpy.ops.render.render(animation=True, scene=sc.name)
    print("ANIMATIC_OK", a.out)


if __name__ == "__main__":
    main()
