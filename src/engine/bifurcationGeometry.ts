/**
 * BifurcationGeometry: analytic description of a planar coronary bifurcation (units: mm).
 * Origin = intersection of the main-vessel (MV) and side-branch (SB) centrelines.
 * The MV runs along +x at the origin; the SB leaves in the x–y plane at the bifurcation angle.
 * Optional MV curvature bends the MV out of the bifurcation plane (x–z) so the ostium geometry is preserved.
 */
import type { Anatomy } from './anatomy';
import { type Vec3, type Frame, add, scale, sub, len, dot, norm, cross, deg2rad, smoothstep, clamp } from './math';

export const REFERENCE_MARGIN = 10; // mm of reference vessel modelled beyond each lesion
export const WALL_THICKNESS = 0.4; // illustrative wall thickness for rendering only

export interface BifurcationModel {
  anatomy: Anatomy;
  rP: number;
  rD: number;
  rS: number;
  theta: number;
  /** SB unit direction */
  d: Vec3;
  /** In-plane unit normal to the SB axis pointing toward the carina side */
  nC: Vec3;
  sMin: number;
  sMax: number;
  sbLength: number;
  kappa: number;
  xHeel: number;
  xCarina: number;
  /** Arc-length along SB axis where the SB centreline crosses the MV wall */
  tOstium: number;
  carinaPoint: Vec3;
  carinaSphere: { center: Vec3; radius: number } | null;
  lesions: { prox: [number, number]; dist: [number, number]; sb: [number, number] };
  mvPoint(s: number): Vec3;
  mvFrame(s: number): Frame;
  mvRefRadius(s: number): number;
  mvLumenRadius(s: number, phi: number): number;
  mvPlaqueWeight(s: number): number;
  sbPoint(t: number): Vec3;
  sbFrame(): Frame;
  sbRefRadius(t: number): number;
  sbLumenRadius(t: number, phi: number): number;
  sbPlaqueWeight(t: number): number;
  closestMV(p: Vec3): { s: number; dist: number; q: Vec3 };
  /** Point inside the MV reference lumen (plus margin)? */
  insideMV(p: Vec3, margin?: number): boolean;
  /** Point inside the SB reference lumen beyond the bifurcation origin? */
  insideSB(p: Vec3, margin?: number): boolean;
}

function plateau(x: number, a: number, b: number, ramp = 1): number {
  if (b - a <= 1e-6) return 0;
  const r = Math.min(ramp, (b - a) / 2);
  return smoothstep(a, a + r, x) * (1 - smoothstep(b - r, b, x));
}

/** Distance from an off-centre circle's centre-of-reference to its boundary along a ray at angle alpha. */
export function eccentricRadius(rRef: number, burden: number, ecc: number, alpha: number): number {
  const b = clamp(burden, 0, 0.95);
  if (b <= 0) return rRef;
  const rho = rRef * Math.sqrt(1 - b);
  const delta = clamp(ecc, 0, 1) * (rRef - rho) * 0.98;
  const s = Math.sin(alpha);
  return delta * Math.cos(alpha) + Math.sqrt(Math.max(0, rho * rho - delta * delta * s * s));
}

export function buildBifurcation(a: Anatomy): BifurcationModel {
  const rP = a.dPMV / 2;
  const rD = a.dDMV / 2;
  const rS = a.dSB / 2;
  const theta = deg2rad(a.angleDeg);
  const sinT = Math.sin(theta);
  const cosT = Math.cos(theta);
  const d: Vec3 = [cosT, sinT, 0];
  const nC: Vec3 = [sinT, -cosT, 0];

  // Wall-line intersections in the bifurcation plane.
  const tHeel = (rP - rS * cosT) / sinT;
  let xHeel = tHeel * cosT - rS * sinT;
  const tCar = (rD + rS * cosT) / sinT;
  let xCarina = tCar * cosT + rS * sinT;
  if (xHeel > xCarina) [xHeel, xCarina] = [xCarina, xHeel];
  const carinaPoint: Vec3 = [xCarina, rD, 0];
  const tOstium = (rP + rD) / 2 / sinT;

  const mid = (xHeel + xCarina) / 2;
  const lesions = {
    prox: [mid - a.lesionProx, mid] as [number, number],
    dist: [mid, mid + a.lesionDist] as [number, number],
    sb: [tOstium, tOstium + a.lesionSB] as [number, number],
  };
  const sMin = Math.min(xHeel, mid - a.lesionProx) - REFERENCE_MARGIN;
  const sMax = Math.max(xCarina, mid + a.lesionDist) + REFERENCE_MARGIN;
  const sbLength = tOstium + a.lesionSB + REFERENCE_MARGIN;
  const Lp = -sMin;
  const Ld = sMax;
  const totalLen = sMax - sMin;
  const kappa = a.curvatureDeg > 0 ? deg2rad(a.curvatureDeg) / totalLen : 0;
  const taper = a.taperPct / 100;
  const flare = a.sbFlarePct / 100;
  const burden = a.plaqueEnabled ? a.plaqueBurdenPct / 100 : 0;

  const mvPoint = (s: number): Vec3 =>
    kappa === 0 ? [s, 0, 0] : [Math.sin(kappa * s) / kappa, 0, (1 - Math.cos(kappa * s)) / kappa];
  const mvFrame = (s: number): Frame => {
    const T: Vec3 = kappa === 0 ? [1, 0, 0] : [Math.cos(kappa * s), 0, Math.sin(kappa * s)];
    const N: Vec3 = [0, 1, 0];
    return { T, N, B: cross(T, N) };
  };
  const mvRefRadius = (s: number) => {
    const p = rP * (1 - (taper * s) / Lp);
    const dd = rD * (1 - (taper * s) / Ld);
    const w = smoothstep(xHeel, xCarina, s);
    return (1 - w) * p + w * dd;
  };
  const mvPlaqueWeight = (s: number) => Math.max(plateau(s, lesions.prox[0], lesions.prox[1]), plateau(s, lesions.dist[0], lesions.dist[1]));
  const mvLumenRadius = (s: number, phi: number) => {
    const r = mvRefRadius(s);
    const w = mvPlaqueWeight(s);
    return w > 0 && burden > 0 ? eccentricRadius(r, burden * w, a.eccentricity, phi) : r;
  };
  const sbPoint = (t: number): Vec3 => scale(d, t);
  const sbFrameV: Frame = { T: d, N: nC, B: cross(d, nC) };
  const sbRefRadius = (t: number) => {
    const base = rS * (1 - (taper * Math.max(0, t - tOstium)) / Math.max(1, sbLength - tOstium));
    const f = t <= tOstium ? 1 : clamp(1 - (t - tOstium) / a.dSB, 0, 1);
    return base * (1 + flare * f);
  };
  const sbPlaqueWeight = (t: number) => plateau(t, lesions.sb[0], lesions.sb[1], 0.8);
  const sbLumenRadius = (t: number, phi: number) => {
    const r = sbRefRadius(t);
    const w = sbPlaqueWeight(t);
    return w > 0 && burden > 0 ? eccentricRadius(r, burden * w, a.eccentricity, phi) : r;
  };

  const closestMV = (p: Vec3) => {
    let s = kappa === 0 ? p[0] : Math.atan2(kappa * p[0], 1 - kappa * p[2]) / kappa;
    s = clamp(s, sMin, sMax);
    const q = mvPoint(s);
    return { s, dist: len(sub(p, q)), q };
  };
  const insideMV = (p: Vec3, margin = 0) => {
    const c = closestMV(p);
    return c.dist < mvRefRadius(c.s) + margin;
  };
  const insideSB = (p: Vec3, margin = 0) => {
    const t = dot(p, d);
    if (t <= 0) return false;
    const radial = len(sub(p, scale(d, t)));
    return radial < sbRefRadius(t) + margin;
  };

  // Rounded carina: a sphere tangent to the DMV upper wall line and the SB carina-side wall line.
  let carinaSphere: BifurcationModel['carinaSphere'] = null;
  if (a.carinaRounding > 0) {
    const bis = norm(add([1, 0, 0], d));
    const half = theta / 2;
    const center = add(carinaPoint, scale(bis, a.carinaRounding / Math.sin(half)));
    carinaSphere = { center, radius: a.carinaRounding };
  }

  return {
    anatomy: a,
    rP,
    rD,
    rS,
    theta,
    d,
    nC,
    sMin,
    sMax,
    sbLength,
    kappa,
    xHeel,
    xCarina,
    tOstium,
    carinaPoint,
    carinaSphere,
    lesions,
    mvPoint,
    mvFrame,
    mvRefRadius,
    mvLumenRadius,
    mvPlaqueWeight,
    sbPoint,
    sbFrame: () => sbFrameV,
    sbRefRadius,
    sbLumenRadius,
    sbPlaqueWeight,
    closestMV,
    insideMV,
    insideSB,
  };
}

/** Elliptical ostium approximation: a cylinder of diameter D_SB cut obliquely at the bifurcation angle. */
export function ostiumEllipse(dSB: number, angleDeg: number) {
  const sinT = Math.sin(deg2rad(angleDeg));
  const major = dSB / sinT;
  const minor = dSB;
  return { major, minor, area: (Math.PI / 4) * major * minor };
}
