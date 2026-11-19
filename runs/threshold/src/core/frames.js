// Doorway frames around portals. A frame is built symmetric about the portal
// plane, and both ends of a link use the same style and size, so the half of
// the doorway in front of one portal and the half seen through it (in front of
// the other) join into one continuous doorway. The flat portal surface
// overlaps the jambs slightly; the jambs hide the overlap.
import { xmul, xf, qaxis } from './math.js';

export const FRAME_STYLES = ['monolith', 'gate', 'arch', 'slab', 'collar'];

// Parts are in world coordinates. Each box part may be solid (collider).
export function frameParts(P, style = 'monolith', opts = {}) {
  const { hw, hh } = P;
  const at = (p, he, mat, extra = {}) => ({ kind: 'box', xf: xmul(P.xf, xf(p)), he, mat, solid: true, ...extra });
  const parts = [];
  const mat = opts.mat || 'threshold';
  const trim = opts.trim || 'thresholdGlow';
  if (style === 'collar') {
    // A plain square collar set into a wall: symmetric, no apron, works at any
    // orientation (windows, skylights, doors in thin walls).
    const jw = opts.jw ?? 0.35, fd = opts.fd ?? 0.56;
    for (const s of [-1, 1]) {
      parts.push(at([s * (hw + jw / 2), 0, 0], [jw / 2, hh + jw, fd], mat));
      parts.push(at([0, s * (hh + jw / 2), 0], [hw, jw / 2, fd], mat));
    }
    return parts;
  }
  if (style === 'gate') {
    // A thin, tall frame of dark stone with a luminous inlay.
    const jw = 0.45, fd = 0.35, lh = 0.6;
    for (const s of [-1, 1]) {
      parts.push(at([s * (hw + jw / 2), lh / 2, 0], [jw / 2, hh + lh / 2, fd], mat));
      parts.push(at([s * (hw + 0.03), 0, 0], [0.03, hh, 0.08], trim, { solid: false }));
    }
    parts.push(at([0, hh + lh / 2, 0], [hw + jw, lh / 2, fd], mat));
    parts.push(at([0, hh - 0.03, 0], [hw, 0.03, 0.08], trim, { solid: false }));
    parts.push(at([0, -hh - 0.2, 0], [hw + jw, 0.2, fd + 1.4], mat));
  } else if (style === 'arch') {
    // Pillars with a stepped crown; the crown is decorative (above the opening).
    const jw = 1.0, fd = 0.8;
    for (const s of [-1, 1]) {
      parts.push(at([s * (hw + jw / 2), 0.4, 0], [jw / 2, hh + 0.4, fd], mat));
      parts.push(at([s * (hw + jw / 2 + 0.075), -hh + 0.35, 0], [jw / 2 + 0.075, 0.35, fd + 0.15], mat));
      parts.push(at([s * (hw + jw / 2), hh + 0.95, 0], [jw / 2 + 0.12, 0.15, fd + 0.12], mat));
    }
    for (let i = 0; i < 4; i++) {
      const w = hw + jw + 0.2 - i * (hw * 0.28), h = 0.35;
      parts.push(at([0, hh + 1.1 + h / 2 + i * h, 0], [Math.max(w, 0.4), h / 2, fd - i * 0.06], mat));
    }
    parts.push(at([0, hh + 0.4, 0], [hw + 0.02, 0.4, fd * 0.8], mat));
    parts.push(at([0, -hh - 0.25, 0], [hw + jw + 0.3, 0.25, fd + 1.6], mat));
    parts.push(at([0, hh + 0.82, fd + 0.01], [hw * 0.5, 0.05, 0.02], trim, { solid: false }));
    parts.push(at([0, hh + 0.82, -fd - 0.01], [hw * 0.5, 0.05, 0.02], trim, { solid: false }));
  } else if (style === 'slab') {
    // An opening cut through a single enormous slab (a wall-like monument).
    const jw = Math.max(2.5, hw * 1.2), fd = 1.0, top = hh * 0.9 + 2;
    for (const s of [-1, 1]) parts.push(at([s * (hw + jw / 2), top / 2, 0], [jw / 2, hh + top / 2, fd], mat));
    parts.push(at([0, hh + top / 2, 0], [hw, top / 2, fd], mat));
    parts.push(at([0, -hh - 0.3, 0], [hw + jw, 0.3, fd + 2.0], mat));
    for (const s of [-1, 1]) parts.push(at([s * (hw + 0.04), 0, s * 0], [0.04, hh, fd + 0.01], trim, { solid: false }));
  } else {
    // monolith: massive jambs and lintel, a threshold slab with aprons.
    const jw = Math.max(0.9, hw * 0.35), fd = 0.7, lh = Math.max(1.0, hh * 0.25);
    for (const s of [-1, 1]) {
      parts.push(at([s * (hw + jw / 2), lh / 2, 0], [jw / 2, hh + lh / 2, fd], mat));
      parts.push(at([s * (hw + jw / 2 + 0.1), -hh + 0.3, 0], [jw / 2 + 0.1, 0.3, fd + 0.2], mat));
    }
    parts.push(at([0, hh + lh / 2, 0], [hw + jw + 0.25, lh / 2, fd + 0.1], mat));
    parts.push(at([0, hh + lh + 0.15, 0], [hw + jw + 0.5, 0.15, fd + 0.25], mat));
    parts.push(at([0, -hh - 0.25, 0], [hw + jw + 0.6, 0.25, fd + 1.8], mat));
    parts.push(at([0, hh + lh * 0.5, fd + 0.11], [hw * 0.6, 0.06, 0.02], trim, { solid: false }));
    parts.push(at([0, hh + lh * 0.5, -fd - 0.11], [hw * 0.6, 0.06, 0.02], trim, { solid: false }));
  }
  return parts;
}

// The portal's centre for an opening whose floor is at `floor` (a point on
// the ground) facing yaw (front normal = (sin yaw, 0, cos yaw)).
export function portalPose(floor, yaw, hh) {
  return { p: [floor[0], floor[1] + hh, floor[2]], q: qaxis([0, 1, 0], yaw) };
}
