/**
 * StentMeshGenerator: builds a generic, illustrative strut network (sinusoidal rings + connectors)
 * mapped onto a centreline path at the nominal deployed diameter.
 * It does NOT reproduce proprietary stent architecture.
 */
import type { Path } from './paths';
import { type Vec3, add, scale } from './math';

export interface StentPatternParams {
  crowns: number;
  connectorsPerRing: number;
  ringHeight: number; // mm (axial)
  ringGap: number; // mm (axial)
  subdivisions: number;
}

/** Generic pattern: ILLUSTRATIVE ASSUMPTION. */
export function genericPattern(diameter: number, connectorsPerRing = 3): StentPatternParams {
  return { crowns: diameter > 3.25 ? 9 : 8, connectorsPerRing, ringHeight: 0.9, ringGap: 0.3, subdivisions: 3 };
}

export interface StentMesh {
  /** xyz per point */
  positions: Float32Array;
  /** pairs of point indices */
  edges: Uint32Array;
  /** unrolled coordinates per point: axial u (mm) and angle phi (rad) */
  u: Float32Array;
  phi: Float32Array;
  ringCount: number;
}

export function generateStentMesh(path: Path, diameter: number, pat: StentPatternParams): StentMesh {
  const L = path.length;
  const r = diameter / 2;
  const h = Math.min(pat.ringHeight, L);
  const pitch0 = pat.ringHeight + pat.ringGap;
  const nRings = Math.max(1, Math.round((L + pat.ringGap) / pitch0));
  const pitch = nRings > 1 ? (L - h) / (nRings - 1) : 0;
  const N = pat.crowns;
  const verts: { u: number; phi: number }[] = [];
  const edges: number[] = [];
  const addPoint = (u: number, phi: number) => {
    verts.push({ u, phi });
    return verts.length - 1;
  };
  const addSegment = (a: { u: number; phi: number }, b: { u: number; phi: number }) => {
    let prev = addPoint(a.u, a.phi);
    for (let s = 1; s <= pat.subdivisions; s++) {
      const t = s / pat.subdivisions;
      const idx = addPoint(a.u + (b.u - a.u) * t, a.phi + (b.phi - a.phi) * t);
      edges.push(prev, idx);
      prev = idx;
    }
  };
  const ringVertex = (ring: number, k: number) => ({
    u: ring * pitch + (k % 2 === 1 ? h : 0),
    phi: (2 * Math.PI * k) / (2 * N),
  });
  for (let i = 0; i < nRings; i++) {
    for (let k = 0; k < 2 * N; k++) addSegment(ringVertex(i, k), ringVertex(i, k + 1));
    if (i < nRings - 1) {
      const C = Math.max(1, Math.min(N, pat.connectorsPerRing));
      const shift = i % 2 === 1 ? Math.floor(N / (2 * C)) : 0;
      for (let m = 0; m < C; m++) {
        const j = (Math.floor((m * N) / C) + shift) % N;
        const k = 2 * j + 1;
        addSegment(ringVertex(i, k), ringVertex(i + 1, k + 1));
      }
    }
  }
  const positions = new Float32Array(verts.length * 3);
  const uArr = new Float32Array(verts.length);
  const phiArr = new Float32Array(verts.length);
  verts.forEach((v, i) => {
    const c = path.point(v.u);
    const f = path.frame(v.u);
    const p: Vec3 = add(c, add(scale(f.N, r * Math.cos(v.phi)), scale(f.B, r * Math.sin(v.phi))));
    positions.set(p, i * 3);
    uArr[i] = v.u;
    phiArr[i] = v.phi;
  });
  return { positions, edges: Uint32Array.from(edges), u: uArr, phi: phiArr, ringCount: nRings };
}
