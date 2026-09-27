"""Keyframe tracks with explicit ease control (Blender 5 slotted actions).

A Track collects {frame: (value, ease_in, ease_out)} for one property index
and writes Bezier keys with horizontal handles. Handle length = ease * gap to
the neighboring key, so every key is a velocity-zero endpoint: moves start
and settle with controlled acceleration and deceleration.
"""
from __future__ import annotations

import bpy
from bpy_extras import anim_utils

from .timeline import fr

_TRACKS: list["Track"] = []


def fcurves(id_data):
    ad = id_data.animation_data
    if ad is None or ad.action is None:
        return []
    cb = anim_utils.action_get_channelbag_for_slot(ad.action, ad.action_slot)
    return cb.fcurves if cb else []


def find_fcurve(id_data, path, index):
    for fc in fcurves(id_data):
        if fc.data_path == path and fc.array_index == index:
            return fc
    return None


class Track:
    def __init__(self, target, path, index=0, rest=None, interp="BEZIER"):
        self.target = target
        self.path = path
        self.index = index
        cur = target.path_resolve(path)
        try:
            cur = cur[index]
        except TypeError:
            pass
        self.rest = cur if rest is None else rest
        self.keys: dict[int, list] = {}
        self.interp = interp
        _TRACKS.append(self)

    def set(self, t, value, ease=0.42, frame=None):
        f = frame if frame is not None else fr(t)
        self.keys[f] = [value, ease, ease]
        return self

    def hold(self, t, value=None):
        return self.set(t, self.value_at_last() if value is None else value)

    def value_at_last(self):
        if not self.keys:
            return self.rest
        return self.keys[max(self.keys)][0]

    def move(self, t0, t1, v1, v0=None, ease_out=0.42, ease_in=0.42):
        """Hold the previous value until t0, arrive at v1 at t1."""
        f0, f1 = fr(t0), fr(t1)
        start = self.value_before(f0) if v0 is None else v0
        k0 = self.keys.get(f0)
        self.keys[f0] = [start, k0[1] if k0 else 0.42, ease_out]
        self.keys[f1] = [v1, ease_in, 0.42]
        return self

    def value_before(self, f):
        prev = [k for k in self.keys if k <= f]
        if not prev:
            return self.rest
        return self.keys[max(prev)][0]


def offset_track(ob, axis, path="location"):
    idx = "xyz".index(axis)
    return Track(ob, path, idx)


def write_all(frame_start=1):
    for tr in _TRACKS:
        if not tr.keys:
            continue
        if frame_start not in tr.keys and min(tr.keys) > frame_start:
            first = tr.keys[min(tr.keys)]
            tr.keys[frame_start] = [first[0], 0.42, 0.42]
        tgt = tr.target
        for f in sorted(tr.keys):
            v = tr.keys[f][0]
            prop = tgt.path_resolve(tr.path)
            try:
                prop[tr.index] = v
            except TypeError:
                setattr_path(tgt, tr.path, v)
            tgt.keyframe_insert(data_path=tr.path, index=tr.index if _is_array(tgt, tr.path) else -1, frame=f)
        owner = tgt.id_data
        fc = find_fcurve(owner, _full_path(tgt, tr.path), tr.index if _is_array(tgt, tr.path) else 0)
        if fc is None:
            continue
        frames = sorted(tr.keys)
        pts = sorted(fc.keyframe_points, key=lambda p: p.co.x)
        for i, p in enumerate(pts):
            f = int(round(p.co.x))
            val, e_in, e_out = tr.keys.get(f, [p.co.y, 0.42, 0.42])
            p.interpolation = tr.interp
            p.handle_left_type = "FREE"
            p.handle_right_type = "FREE"
            gl = (p.co.x - pts[i - 1].co.x) if i > 0 else 4.0
            gr = (pts[i + 1].co.x - p.co.x) if i < len(pts) - 1 else 4.0
            p.handle_left = (p.co.x - e_in * gl, p.co.y)
            p.handle_right = (p.co.x + e_out * gr, p.co.y)
        fc.update()
    _TRACKS.clear()


def _is_array(tgt, path):
    v = tgt.path_resolve(path)
    return hasattr(v, "__len__") and not isinstance(v, str)


def _full_path(tgt, path):
    if tgt == tgt.id_data:
        return path
    return tgt.path_from_id(path)


def setattr_path(tgt, path, v):
    parts = path.split(".")
    obj = tgt
    for p in parts[:-1]:
        obj = getattr(obj, p)
    setattr(obj, parts[-1], v)


def key_constant(target, path, frame_values, index=-1):
    """Stepped keys (lights on/off, visibility)."""
    for f, v in sorted(frame_values):
        setattr_path(target, path, v)
        target.keyframe_insert(data_path=path, index=index, frame=f)
    owner = target.id_data
    full = _full_path(target, path)
    for fc in fcurves(owner):
        if fc.data_path == full:
            for p in fc.keyframe_points:
                p.interpolation = "CONSTANT"
