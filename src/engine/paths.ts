/** Centreline paths that stents and balloons are mapped onto. Parameter u is arc length (mm). */
import type { BifurcationModel } from './bifurcationGeometry';
import { type Vec3, type Frame, add, scale, sub, norm, cross, dot, len, cumulativeLengths, catmullRom } from './math';

export interface Path {
  length: number;
  point(u: number): Vec3;
  frame(u: number): Frame;
  /** Dense polyline (for rendering wires/balloons and for contact queries) */
  polyline(step?: number): Vec3[];
}

function polylineOf(p: Path, step = 0.25): Vec3[] {
  const n = Math.max(2, Math.ceil(p.length / step));
  const out: Vec3[] = [];
  for (let i = 0; i <= n; i++) out.push(p.point((p.length * i) / n));
  return out;
}

export function mvPath(m: BifurcationModel, sStart: number, length: number): Path {
  const p: Path = {
    length,
    point: (u) => m.mvPoint(sStart + u),
    frame: (u) => m.mvFrame(sStart + u),
    polyline: (step) => polylineOf(p, step),
  };
  return p;
}

export function sbPath(m: BifurcationModel, tStart: number, length: number): Path {
  const f = m.sbFrame();
  const p: Path = {
    length,
    point: (u) => m.sbPoint(tStart + u),
    frame: () => f,
    polyline: (step) => polylineOf(p, step),
  };
  return p;
}

/** Path through arbitrary control points (Catmull-Rom smoothed) with parallel-transport frames. */
export function smoothPath(ctrl: Vec3[], initialNormal: Vec3 = [0, 1, 0]): Path {
  const pts = catmullRom(ctrl, 16);
  const cum = cumulativeLengths(pts);
  const total = cum[cum.length - 1];
  const tangents: Vec3[] = pts.map((_, i) => norm(sub(pts[Math.min(i + 1, pts.length - 1)], pts[Math.max(i - 1, 0)])));
  const normals: Vec3[] = [];
  let N = norm(sub(initialNormal, scale(tangents[0], dot(initialNormal, tangents[0]))));
  for (let i = 0; i < pts.length; i++) {
    const T = tangents[i];
    N = norm(sub(N, scale(T, dot(N, T))));
    normals.push(N);
  }
  const locate = (u: number) => {
    const uu = Math.min(Math.max(u, 0), total);
    let lo = 0;
    let hi = cum.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] <= uu) lo = mid;
      else hi = mid;
    }
    const seg = cum[hi] - cum[lo];
    return { i: lo, j: hi, t: seg > 0 ? (uu - cum[lo]) / seg : 0 };
  };
  const p: Path = {
    length: total,
    point: (u) => {
      const { i, j, t } = locate(u);
      return add(pts[i], scale(sub(pts[j], pts[i]), t));
    },
    frame: (u) => {
      const { i, j, t } = locate(u);
      const T = norm(add(scale(tangents[i], 1 - t), scale(tangents[j], t)));
      let Nn = norm(add(scale(normals[i], 1 - t), scale(normals[j], t)));
      Nn = norm(sub(Nn, scale(T, dot(Nn, T))));
      return { T, N: Nn, B: cross(T, Nn) };
    },
    polyline: (step) => polylineOf(p, step),
  };
  return p;
}

/** Path from the proximal main vessel, turning into the side branch (culotte first stent). */
export function pmvToSbPath(m: BifurcationModel, sStart: number, length: number): Path {
  const turn = Math.max(1.0, m.rP);
  const ctrl: Vec3[] = [];
  const sCorner = -turn;
  const nStraight = Math.max(2, Math.ceil((sCorner - sStart) / 1.0));
  for (let i = 0; i <= nStraight; i++) ctrl.push(m.mvPoint(sStart + ((sCorner - sStart) * i) / nStraight));
  ctrl.push(m.sbPoint(turn * 0.35));
  const tEnd = turn + Math.max(length, 30);
  for (let t = turn; t <= tEnd; t += 1.5) ctrl.push(m.sbPoint(t));
  const full = smoothPath(ctrl);
  const L = Math.min(length, full.length);
  return {
    length: L,
    point: full.point,
    frame: full.frame,
    polyline: (step) => polylineOf({ ...full, length: L }, step),
  };
}

export const pathLength = (pts: Vec3[]) => pts.slice(1).reduce((acc, p, i) => acc + len(sub(p, pts[i])), 0);

/** Arc length along the culotte first-stent path (starting at MV station sStart) needed to reach SB station tTarget. */
export function pmvToSbReach(m: BifurcationModel, sStart: number, tTarget: number): number {
  const full = pmvToSbPath(m, sStart, tTarget + 60);
  const step = 0.1;
  for (let u = 0; u <= full.length; u += step) {
    const p = full.point(u);
    if (dot(p, m.d) >= tTarget && m.insideSB(p, 0.5)) return u;
  }
  return full.length;
}
