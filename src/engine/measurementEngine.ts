/**
 * MeasurementEngine: every output has an explicit method and basis.
 * Geometry outputs are measured on the illustrative mesh, so they are labelled
 * "Illustrative geometric estimate". Quantities that need mechanical data are reported
 * as "Not calculable from available data".
 */
import type { BifurcationModel } from './bifurcationGeometry';
import { ostiumEllipse } from './bifurcationGeometry';
import { hkCompare } from './huoKassab';
import type { SimResult, SimStent } from './simulation';
import { stentStartS } from './simulation';
import type { Scenario } from './scenario';
import type { OutputBasis } from '../data/evidence';
import { type Vec3, sub, dot, scale, len } from './math';

export interface Metric {
  id: string;
  label: string;
  value: number | null;
  unit: string;
  basis: OutputBasis;
  method: string;
  note?: string;
  group: 'anatomy' | 'geometry' | 'mechanical' | 'procedure';
}

const NC: OutputBasis = 'Not calculable from available data';
const ILL: OutputBasis = 'Illustrative geometric estimate';

/** Dense samples along every strut edge (step ≈ 0.08 mm), tagged by stent index and edge index. */
export function sampleStruts(stents: SimStent[], step = 0.08) {
  const pts: Vec3[] = [];
  const owner: number[] = [];
  const edge: number[] = [];
  stents.forEach((st, si) => {
    const P = st.mesh.positions;
    const E = st.mesh.edges;
    for (let e = 0; e < E.length; e += 2) {
      const a: Vec3 = [P[E[e] * 3], P[E[e] * 3 + 1], P[E[e] * 3 + 2]];
      const b: Vec3 = [P[E[e + 1] * 3], P[E[e + 1] * 3 + 1], P[E[e + 1] * 3 + 2]];
      const n = Math.max(1, Math.ceil(len(sub(b, a)) / step));
      for (let k = 0; k < n; k++) {
        const t = k / n;
        pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
        owner.push(si);
        edge.push(e / 2);
      }
    }
  });
  return { pts, owner, edge };
}

export interface SliceProfile {
  s: number;
  meanDiameter: number;
  minDiameter: number;
  maxDiameter: number;
  ellipticity: number;
  pointCount: number;
}

/** Strut-envelope diameters in a thin MV slice centred at s. */
export function mvSlice(m: BifurcationModel, pts: Vec3[], s: number, half = 0.35, bins = 36): SliceProfile | null {
  const rMax = new Array(bins).fill(-1);
  let count = 0;
  const f = m.mvFrame(s);
  for (const p of pts) {
    const c = m.closestMV(p);
    if (Math.abs(c.s - s) > half) continue;
    if (m.insideSB(p, 0.1) && dot(p, m.d) > m.tOstium * 0.5) continue; // exclude struts that left into the SB
    const v = sub(p, c.q);
    const phi = Math.atan2(dot(v, f.B), dot(v, f.N));
    const k = Math.floor(((phi + Math.PI) / (2 * Math.PI)) * bins) % bins;
    rMax[k] = Math.max(rMax[k], c.dist);
    count++;
  }
  const D: number[] = [];
  for (let k = 0; k < bins / 2; k++) if (rMax[k] > 0 && rMax[k + bins / 2] > 0) D.push(rMax[k] + rMax[k + bins / 2]);
  if (D.length < bins / 4) return null;
  const maxD = Math.max(...D);
  const minD = Math.min(...D);
  return { s, meanDiameter: D.reduce((a, b) => a + b, 0) / D.length, minDiameter: minD, maxDiameter: maxD, ellipticity: maxD / minD, pointCount: count };
}

/** Largest strut-free circle in the ostium, projected along the SB axis. */
export function ostialFreeDiameter(m: BifurcationModel, pts: Vec3[], halfThicknessMm: number[], owner: number[]) {
  const f = m.sbFrame();
  const rS = m.rS;
  const tMax = m.tOstium + rS / Math.tan(m.theta / 2) * 0.5 + 0.3;
  const proj: [number, number, number][] = [];
  pts.forEach((p, i) => {
    const t = dot(p, m.d);
    if (t < 0 || t > tMax) return;
    const v = sub(p, scale(m.d, t));
    const x = dot(v, f.N);
    const y = dot(v, f.B);
    if (Math.hypot(x, y) > rS + 0.2) return;
    if (!m.insideMV(p, 0.25)) return;
    proj.push([x, y, halfThicknessMm[owner[i]]]);
  });
  const step = 0.04;
  let best = 0;
  for (let x = -rS; x <= rS; x += step) {
    for (let y = -rS; y <= rS; y += step) {
      let r = rS - Math.hypot(x, y);
      if (r <= best) continue;
      for (const q of proj) {
        const d = Math.hypot(q[0] - x, q[1] - y) - q[2];
        if (d < r) {
          r = d;
          if (r <= best) break;
        }
      }
      if (r > best) best = r;
    }
  }
  return { diameter: 2 * best, strutSamples: proj.length };
}

function ostialStrutSegments(m: BifurcationModel, pts: Vec3[], owner: number[], edge: number[]) {
  const set = new Set<string>();
  pts.forEach((p, i) => {
    if (m.insideSB(p, -0.05) && m.insideMV(p, 0.1) && dot(p, m.d) > 0) set.add(`${owner[i]}:${edge[i]}`);
  });
  return set.size;
}

function overlapLength(m: BifurcationModel, pts: Vec3[], owner: number[], nStents: number) {
  if (nStents < 2) return 0;
  const bin = 0.25;
  const map = new Map<number, Set<number>>();
  pts.forEach((p, i) => {
    const c = m.closestMV(p);
    if (c.dist > m.mvRefRadius(c.s) + 1.5) return;
    if (m.insideSB(p, 0) && dot(p, m.d) > m.tOstium + 0.5) return;
    const k = Math.floor(c.s / bin);
    if (!map.has(k)) map.set(k, new Set());
    map.get(k)!.add(owner[i]);
  });
  let n = 0;
  map.forEach((s) => s.size >= 2 && n++);
  return n * bin;
}

function malapposition(m: BifurcationModel, pts: Vec3[], owner: number[], halfT: number[]) {
  let total = 0;
  let mal = 0;
  let gapSum = 0;
  pts.forEach((p, i) => {
    const c = m.closestMV(p);
    if (c.s > m.xHeel - 0.5 && c.s < m.xCarina + 0.5) return; // exclude ostium zone
    if (m.insideSB(p, 0.2)) return;
    const gap = m.mvRefRadius(c.s) - c.dist;
    if (c.dist > m.mvRefRadius(c.s) + 1.0) return;
    total++;
    if (gap > 2 * halfT[owner[i]]) {
      mal++;
      gapSum += gap;
    }
  });
  return { fraction: total ? (100 * mal) / total : null, meanGap: mal ? gapSum / mal : 0 };
}

export function computeMetrics(m: BifurcationModel, sc: Scenario, sim: SimResult): Metric[] {
  const a = m.anatomy;
  const out: Metric[] = [];
  const hk = hkCompare(a.dPMV, a.dDMV, a.dSB);
  if (!('error' in hk)) {
    const B: OutputBasis = 'Anatomical calculation (published scaling relationship)';
    const meth = 'Huo–Kassab: D_PMV = (D_DMV^(7/3) + D_SB^(7/3))^(3/7)';
    out.push({ id: 'hk-calc', label: 'Huo–Kassab calculated PMV diameter', value: hk.calculatedPMV, unit: 'mm', basis: B, method: meth, group: 'anatomy' });
    out.push({ id: 'hk-diff', label: 'Measured − calculated PMV diameter', value: hk.absoluteDifference, unit: 'mm', basis: B, method: meth, group: 'anatomy' });
    out.push({ id: 'hk-rel', label: 'Relative difference', value: hk.relativeDifferencePct, unit: '%', basis: B, method: '(measured − calculated) / calculated × 100', group: 'anatomy' });
  }
  const ost = ostiumEllipse(a.dSB, a.angleDeg);
  out.push({ id: 'ostium-area', label: 'Reference SB ostial area (elliptical approximation)', value: ost.area, unit: 'mm²', basis: 'Geometric calculation from user inputs', method: 'π/4 × D_SB × (D_SB / sin θ): oblique section of a cylinder; ignores MV wall curvature and flare', group: 'anatomy' });
  out.push({ id: 'ostium-major', label: 'Reference ostial long axis', value: ost.major, unit: 'mm', basis: 'Geometric calculation from user inputs', method: 'D_SB / sin θ', group: 'anatomy' });

  const { pts, owner, edge } = sampleStruts(sim.stents);
  const halfT = sim.stents.map((s) => s.thickness.micrometres / 2000);
  const hasMV = sim.stents.some((s) => s.key !== 'sb');
  const sStart = stentStartS(m);
  const mvStent = sim.stents.find((s) => s.key === 'mv' || s.key === 'culotteSecond' || s.key === 'culotteFirst');
  const sProx = (sStart + (m.xHeel - 0.75)) / 2;
  const sDist = mvStent ? (m.xCarina + 0.75 + Math.min(m.sMax, sStart + sc.mvStent.length)) / 2 : m.xCarina + 3;
  const proxSlice = hasMV && sProx < m.xHeel - 0.5 ? mvSlice(m, pts, sProx) : null;
  const distSlice = sim.stents.some((s) => s.key === 'mv' || s.key === 'culotteSecond') ? mvSlice(m, pts, sDist) : null;
  const sliceNote = (s: number) => `Strut envelope in a 0.7 mm slice at ${s.toFixed(1)} mm from the bifurcation origin; mean of opposite-bin diameters (36 angular bins).`;
  out.push({ id: 'prox-d', label: 'Proximal MV stent diameter (mean)', value: proxSlice?.meanDiameter ?? null, unit: 'mm', basis: proxSlice ? ILL : NC, method: sliceNote(sProx), group: 'geometry', note: proxSlice ? undefined : 'No stent in this segment at this stage.' });
  out.push({ id: 'prox-ell', label: 'Proximal MV ellipticity (max/min diameter)', value: proxSlice?.ellipticity ?? null, unit: 'ratio', basis: proxSlice ? ILL : NC, method: 'Dmax / Dmin of the same slice', group: 'geometry' });
  out.push({ id: 'dist-d', label: 'Distal MV stent diameter (mean)', value: distSlice?.meanDiameter ?? null, unit: 'mm', basis: distSlice ? ILL : NC, method: sliceNote(sDist), group: 'geometry', note: distSlice ? undefined : 'No stent in this segment at this stage.' });

  const sbSt = sim.stents.find((s) => s.key === 'sb' || s.key === 'culotteFirst');
  if (sbSt) {
    const t = m.tOstium + 2.5;
    const sel: number[] = [];
    pts.forEach((p) => {
      const tt = dot(p, m.d);
      if (Math.abs(tt - t) < 0.35 && !m.insideMV(p, 0.2)) sel.push(len(sub(p, scale(m.d, tt))));
    });
    const val = sel.length > 8 ? 2 * (sel.reduce((x, y) => x + y, 0) / sel.length) : null;
    out.push({ id: 'sb-d', label: 'SB stent diameter 2.5 mm beyond the ostium (mean)', value: val, unit: 'mm', basis: val != null ? ILL : NC, method: 'Mean strut radial distance from the SB axis in a 0.7 mm slice, × 2', group: 'geometry' });
  }

  if (sim.stents.length) {
    const free = ostialFreeDiameter(m, pts, halfT, owner);
    out.push({ id: 'ostial-free', label: 'Ostial free-lumen diameter (largest strut-free circle)', value: free.diameter, unit: 'mm', basis: ILL, method: 'Strut samples near the ostium projected along the SB axis (inflated by half strut thickness); largest empty circle inside the SB reference circle, 0.04 mm grid', group: 'geometry' });
    out.push({ id: 'ostial-struts', label: 'Strut segments crossing the ostium', value: ostialStrutSegments(m, pts, owner, edge), unit: 'count', basis: ILL, method: 'Mesh segments with a sample inside both the SB and MV reference lumens', group: 'geometry' });
    const mal = malapposition(m, pts, owner, halfT);
    out.push({ id: 'malapp', label: 'Struts separated from the reference wall by more than strut thickness', value: mal.fraction, unit: '% of samples', basis: mal.fraction == null ? NC : ILL, method: 'Rigid reference-lumen wall, no plaque or vessel compliance; ostium zone excluded', group: 'geometry' });
    out.push({ id: 'malapp-gap', label: 'Mean strut-to-wall gap of separated struts', value: mal.fraction == null ? null : mal.meanGap, unit: 'mm', basis: mal.fraction == null ? NC : ILL, method: 'Reference lumen radius minus strut radial distance', group: 'geometry' });
    out.push({ id: 'overlap', label: 'Stent overlap length along the MV', value: overlapLength(m, pts, owner, sim.stents.length), unit: 'mm', basis: ILL, method: '0.25 mm MV-axis bins containing struts of ≥2 stents', group: 'geometry' });
  }
  if (sc.technique === 'dk-crush' || sc.technique === 'tap') {
    out.push({ id: 'protrusion', label: 'SB stent protrusion into MV (entered)', value: sc.proc.protrusion, unit: 'mm', basis: 'Geometric calculation from user inputs', method: 'Along the SB axis from where it crosses the MV wall', group: 'procedure' });
  }
  out.push({ id: 'pot-ratio', label: 'POT balloon / PMV reference diameter', value: sc.proc.potD / a.dPMV, unit: 'ratio', basis: 'Geometric calculation from user inputs', method: 'Ratio of entered values', group: 'procedure' });

  const nc = (id: string, label: string, unit: string, why: string): Metric => ({ id, label, value: null, unit, basis: NC, method: why, group: 'mechanical' });
  out.push(nc('sb-cell-area', 'Side-branch cell area', 'mm²', 'Needs device-specific cell geometry and bench data, which are unavailable'));
  out.push(nc('recoil', 'Recoil', '%', 'No device recoil data in the registry; the illustrative engine has no recoil'));
  out.push(nc('foreshortening', 'Foreshortening', '%', 'No device foreshortening data in the registry'));
  out.push(nc('cell-aspect', 'Cell aspect ratio', 'ratio', 'Needs device-specific cell geometry'));
  out.push(nc('stress', 'Stress / strain', '—', 'Mechanical simulation not available in this build'));
  return out;
}
