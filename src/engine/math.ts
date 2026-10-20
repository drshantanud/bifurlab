export type Vec3 = [number, number, number];

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const len = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
export const norm = (a: Vec3): Vec3 => {
  const l = len(a);
  return l > 1e-12 ? scale(a, 1 / l) : [0, 0, 0];
};
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
export const smoothstep = (e0: number, e1: number, x: number) => {
  if (e1 === e0) return x < e0 ? 0 : 1;
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
export const deg2rad = (d: number) => (d * Math.PI) / 180;
export const isFiniteVec = (v: Vec3) => Number.isFinite(v[0]) && Number.isFinite(v[1]) && Number.isFinite(v[2]);

export interface Frame {
  T: Vec3;
  N: Vec3;
  B: Vec3;
}

/** Closest point on a polyline. Returns arc-length parameter, the point and distance. */
export function closestOnPolyline(pts: Vec3[], cum: number[], p: Vec3) {
  let best = { u: 0, q: pts[0], d: Infinity, seg: 0, t: 0 };
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const ab = sub(pts[i + 1], a);
    const l2 = dot(ab, ab);
    const t = l2 > 0 ? clamp(dot(sub(p, a), ab) / l2, 0, 1) : 0;
    const q = add(a, scale(ab, t));
    const d = len(sub(p, q));
    if (d < best.d) best = { u: cum[i] + t * (cum[i + 1] - cum[i]), q, d, seg: i, t };
  }
  return best;
}

export function cumulativeLengths(pts: Vec3[]): number[] {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + len(sub(pts[i], pts[i - 1])));
  return cum;
}

/** Uniform Catmull-Rom resampling of a control polyline into a dense polyline. */
export function catmullRom(ctrl: Vec3[], perSegment = 12): Vec3[] {
  if (ctrl.length < 3) {
    const out: Vec3[] = [];
    for (let i = 0; i <= perSegment; i++) {
      const t = i / perSegment;
      out.push(add(ctrl[0], scale(sub(ctrl[ctrl.length - 1], ctrl[0]), t)));
    }
    return out;
  }
  const P = [sub(scale(ctrl[0], 2), ctrl[1]), ...ctrl, sub(scale(ctrl[ctrl.length - 1], 2), ctrl[ctrl.length - 2])];
  const out: Vec3[] = [];
  for (let i = 1; i < P.length - 2; i++) {
    for (let j = 0; j < perSegment; j++) {
      const t = j / perSegment;
      const t2 = t * t;
      const t3 = t2 * t;
      const c = (k: number) =>
        0.5 *
        (2 * P[i][k] +
          (-P[i - 1][k] + P[i + 1][k]) * t +
          (2 * P[i - 1][k] - 5 * P[i][k] + 4 * P[i + 1][k] - P[i + 2][k]) * t2 +
          (-P[i - 1][k] + 3 * P[i][k] - 3 * P[i + 1][k] + P[i + 2][k]) * t3);
      out.push([c(0), c(1), c(2)]);
    }
  }
  out.push(ctrl[ctrl.length - 1]);
  return out;
}
