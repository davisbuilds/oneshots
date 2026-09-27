"""Editorial timeline: one source of truth for shots, frames and mission time.

Film time t (seconds) -> global frame f = round(t * FPS) + 1.
The launch act has exactly one explicit time cut (T-16 s -> T-10 s at the
S13/S14 boundary); from S14 onward film time runs at real mission time.
"""
FPS = 24


def fr(t):
    return int(round(t * FPS)) + 1


def sec(f):
    return (f - 1) / FPS


# (id, name, scene, t0, t1)
SHOTS = [
    # ACT I - components
    ("S01", "RS25_Macro", "SC_Studio", 0.0, 5.5),
    ("S02", "Booster_Segment", "SC_Studio", 5.5, 8.5),
    ("S03", "Tank_Domes", "SC_Studio", 8.5, 11.2),
    ("S04", "ICPS_RL10", "SC_Studio", 11.2, 13.5),
    ("S05", "Orion_Parts", "SC_Studio", 13.5, 16.0),
    # ACT II - subassemblies
    ("S06", "Core_Stack", "SC_Studio", 16.0, 21.0),
    ("S07", "Engines_Seat", "SC_Studio", 21.0, 25.5),
    ("S08", "Booster_Stack", "SC_Studio", 25.5, 31.0),
    ("S09", "Upper_Stack", "SC_Studio", 31.0, 34.0),
    ("S10", "Orion_Stack", "SC_Studio", 34.0, 38.0),
    # ACT III - integration
    ("S11", "Exploded_Converge", "SC_Studio", 38.0, 50.5),
    ("S12", "Hero", "SC_Studio", 50.5, 56.0),
    # ACT IV - launch (pad)
    ("S13", "Pad_Reveal", "SC_Pad", 55.0, 59.0),       # overlaps S12 by 1 s for the match dissolve
    ("S14", "Deck_Water_Igniters", "SC_Pad", 59.0, 62.5),
    ("S15", "Engine_Start", "SC_Pad", 62.5, 65.5),
    ("S16", "Pad_LowAngle", "SC_Pad", 65.5, 68.8),
    ("S17", "Liftoff", "SC_Pad", 68.8, 72.4),
    ("S18", "Tower_Clear", "SC_Pad", 72.4, 77.4),
    ("S19", "Plume_Tracking", "SC_Pad", 77.4, 81.2),
    ("S20", "Ascent_Wide", "SC_Pad", 81.2, 89.0),
]

DISSOLVE = (55.0, 56.0)          # studio hero -> pad (match dissolve)
FILM_END = 89.0
TITLE = (1.2, 5.0)               # opening title over the RS-25 macro
END_TITLE = (84.2, 88.0)
FADE_OUT = (87.6, 89.0)
TIME_CUT = 59.0                  # T-16 -> T-10


def mission_time(t):
    """Film time -> mission time T (seconds, negative before liftoff)."""
    if t < TIME_CUT:
        return t - 75.0
    return t - 69.0


def film_time(T):
    """Mission time -> film time (for events after the time cut use the real-time branch)."""
    if T < -16.0:
        return T + 75.0
    return T + 69.0


# Launch events (mission time, seconds) - see docs/REFERENCE.md
T_WATER = -20.0
T_HBOI = -12.36
T_RS25 = -6.36
RS25_STAGGER = 0.12
T_SRB = 0.0


def shot(sid):
    for s in SHOTS:
        if s[0] == sid:
            return s
    raise KeyError(sid)
