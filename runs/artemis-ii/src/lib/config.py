"""Dimensions and stations (meters). See docs/REFERENCE.md for provenance.

Vehicle frame: z = 0 at the Mobile Launcher deck, +X east (toward the ML
tower), +Y north. Boosters sit north and south of the core stage.
"""
import math

FT = 0.3048

# --- core stage -------------------------------------------------------------
CORE_R = 8.4 / 2
Z_EXIT = 0.77                       # RS-25 and booster nozzle exit plane
Z_HEATSHIELD = Z_EXIT + 3.20        # core base heat shield
ES_H = 7.80                         # engine section incl. boattail
BOATTAIL_H = 1.40
BOATTAIL_R0 = 3.95
Z_ES_TOP = Z_HEATSHIELD + ES_H      # 11.77
LH2_BARREL = 33.60
DOME_H = CORE_R * 0.707             # elliptical dome height
Z_LH2_TOP = Z_ES_TOP + LH2_BARREL   # 45.37
IT_H = 6.60
Z_IT_TOP = Z_LH2_TOP + IT_H         # 51.97
LOX_BARREL = 9.60
Z_LOX_TOP = Z_IT_TOP + LOX_BARREL   # 61.57
FS_H = 3.80
Z_CORE_TOP = Z_LOX_TOP + FS_H       # 65.37

# RS-25
RS25_LEN = 4.27
RS25_NOZ_LEN = 3.07
RS25_EXIT_R = 2.304 / 2
RS25_JOINT_R = 0.293
RS25_GIMBAL_Z = Z_EXIT + RS25_LEN   # 5.04
RS25_POS = {  # engine number -> (x, y); ignition order 3, 1, 4, 2 (diagonal pairs)
    1: (-1.45, -1.45),
    2: (-1.45, 1.45),
    3: (1.45, 1.45),
    4: (1.45, -1.45),
}
RS25_ORDER = [3, 1, 4, 2]

# LOX feedlines, raceway (azimuth in radians, 0 = +X east, pi = west/front)
FEED_AZ = [math.pi - math.radians(11), math.pi + math.radians(11)]
FEED_R = 0.216
FEED_OFFSET = 0.42
RACEWAY_AZ = math.radians(215)
PRESS_AZ = math.radians(145)

# --- boosters -----------------------------------------------------------------
SRB_R = 12 * FT / 2                  # 1.829
SRB_Y = 6.85
SRB_BASE_Z = 1.52                    # aft skirt base on 1.52 m support posts
SRB_NOZ_BELOW = 0.75
SRB_AFTSKIRT_H = 3.60
SRB_AFTSKIRT_R0 = 2.65
SRB_SEG_H = 7.90
SRB_NSEG = 5
SRB_FWDSKIRT_H = 3.20
SRB_FRUSTUM_H = 3.18
SRB_FRUSTUM_R1 = 1.05
SRB_NOSE_H = 3.72
SRB_NOZ_EXIT_R = 1.90
SRB_SEG_NAMES = ["Seg_Aft", "Seg_CenterAft", "Seg_Center", "Seg_CenterFwd", "Seg_Fwd"]

# --- upper stack ----------------------------------------------------------------
LVSA_H = 9.10
LVSA_R1 = 16.8 * FT / 2              # 2.56
Z_LVSA_TOP = Z_CORE_TOP + LVSA_H     # 74.47
ICPS_R = 16.7 * FT / 2               # 2.545
ICPS_EXPOSED = 2.70
Z_ICPS_TOP = Z_LVSA_TOP + ICPS_EXPOSED   # 77.17
ICPS_LEN_STOWED = 11.60
Z_ICPS_BOTTOM = Z_ICPS_TOP - ICPS_LEN_STOWED
OSA_H = 5 * FT
OSA_R = 18 * FT / 2                  # 2.743
Z_OSA_TOP = Z_ICPS_TOP + OSA_H       # 78.69

# --- Orion ------------------------------------------------------------------------
SA_H = 1.90
SA_R1 = 2.62
Z_ESM = Z_OSA_TOP + SA_H             # 80.59
ESM_H = 4.00
ESM_R = 2.05
Z_CMA = Z_ESM + ESM_H                # 84.59
CMA_H = 1.10
Z_CM = Z_CMA + 0.55                  # heat shield apex 85.14
CM_R = 5.03 / 2
CM_H = 3.35
HS_DEPTH = 0.55
Z_CM_TOP = Z_CM + CM_H               # 88.49
Z_LAS_TIP = Z_OSA_TOP + 20.4         # 99.09
SAJ_TOP = Z_CM + HS_DEPTH + 0.10     # panels end just above heat shield rim

VEHICLE_HEIGHT = Z_LAS_TIP - Z_EXIT  # 98.32 m (322.6 ft)
