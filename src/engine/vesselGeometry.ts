/**
 * VesselGeometry: converts the analytic bifurcation description into triangle meshes.
 * Overlapping branch tubes are trimmed against each other's lumen so the ostium is open.
 */
import type { BifurcationModel } from './bifurcationGeometry';
import { WALL_THICKNESS } from './bifurcationGeometry';
import { type Vec3, type Frame, add, scale, isFiniteVec } from './math';

export interface MeshData {
  positions: Float32Array;
  indices: Uint32Array;
  /** Per-vertex plaque fraction 0..1 (for colouring plaque only) */
  plaque?: Float32Array;
}

export interface TubeSpec {
  u0: number;
  u1: number;
  axialSteps: number;
  radialSteps: number;
  point(u: number): Vec3;
  frame(u: number): Frame;
  radius(u: number, phi: number): number;
  plaque?(u: number, phi: number): number;
  /** Return true for vertices that should be trimmed away (triangles with all vertices trimmed are dropped). */
  trim?(p: Vec3): boolean;
}

export function buildTube(spec: TubeSpec): MeshData {
  const { axialSteps: na, radialSteps: nr } = spec;
  const positions = new Float32Array((na + 1) * nr * 3);
  const plaque = spec.plaque ? new Float32Array((na + 1) * nr) : undefined;
  const trimmed = new Uint8Array((na + 1) * nr);
  for (let i = 0; i <= na; i++) {
    const u = spec.u0 + ((spec.u1 - spec.u0) * i) / na;
    const c = spec.point(u);
    const f = spec.frame(u);
    for (let j = 0; j < nr; j++) {
      const phi = (2 * Math.PI * j) / nr;
      const r = spec.radius(u, phi);
      const dir = add(scale(f.N, Math.cos(phi)), scale(f.B, Math.sin(phi)));
      const p = add(c, scale(dir, r));
      const k = i * nr + j;
      positions.set(p, k * 3);
      if (plaque) plaque[k] = spec.plaque!(u, phi);
      if (spec.trim && spec.trim(p)) trimmed[k] = 1;
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < na; i++) {
    for (let j = 0; j < nr; j++) {
      const a = i * nr + j;
      const b = i * nr + ((j + 1) % nr);
      const c = (i + 1) * nr + j;
      const d = (i + 1) * nr + ((j + 1) % nr);
      if (!(trimmed[a] && trimmed[b] && trimmed[c])) idx.push(a, c, b);
      if (!(trimmed[b] && trimmed[c] && trimmed[d])) idx.push(b, c, d);
    }
  }
  return { positions, indices: Uint32Array.from(idx), plaque };
}

export function validateMesh(m: MeshData): string[] {
  const errors: string[] = [];
  const nv = m.positions.length / 3;
  if (nv === 0) errors.push('mesh has no vertices');
  for (let i = 0; i < m.positions.length; i += 3) {
    if (!isFiniteVec([m.positions[i], m.positions[i + 1], m.positions[i + 2]])) {
      errors.push(`non-finite vertex at ${i / 3}`);
      break;
    }
  }
  if (m.indices.length % 3 !== 0) errors.push('index count not a multiple of 3');
  if (m.indices.length === 0) errors.push('mesh has no triangles');
  for (let i = 0; i < m.indices.length; i++) {
    if (m.indices[i] >= nv) {
      errors.push(`index out of range at ${i}`);
      break;
    }
  }
  return errors;
}

export interface VesselMeshes {
  mvLumen: MeshData;
  sbLumen: MeshData;
  mvWall: MeshData;
  sbWall: MeshData;
}

export function buildVesselMeshes(m: BifurcationModel, withPlaque: boolean, resolution = 1): VesselMeshes {
  const nr = Math.round(72 * resolution);
  const mvSteps = Math.max(40, Math.round(((m.sMax - m.sMin) / 0.2) * resolution));
  const sbSteps = Math.max(30, Math.round((m.sbLength / 0.2) * resolution));
  const sbF = m.sbFrame();
  const mvRadius = (s: number, phi: number) => (withPlaque ? m.mvLumenRadius(s, phi) : m.mvRefRadius(s));
  const sbRadius = (t: number, phi: number) => (withPlaque ? m.sbLumenRadius(t, phi) : m.sbRefRadius(t));
  const plaqueMV = (s: number, phi: number) => (withPlaque ? Math.max(0, 1 - m.mvLumenRadius(s, phi) / m.mvRefRadius(s)) : 0);
  const plaqueSB = (t: number, phi: number) => (withPlaque ? Math.max(0, 1 - m.sbLumenRadius(t, phi) / m.sbRefRadius(t)) : 0);

  const mvLumen = buildTube({
    u0: m.sMin, u1: m.sMax, axialSteps: mvSteps, radialSteps: nr,
    point: m.mvPoint, frame: m.mvFrame, radius: mvRadius, plaque: plaqueMV,
    trim: (p) => m.insideSB(p, -0.02) && !isNearCarinaDistalWall(m, p),
  });
  const sbLumen = buildTube({
    u0: 0, u1: m.sbLength, axialSteps: sbSteps, radialSteps: nr,
    point: m.sbPoint, frame: () => sbF, radius: sbRadius, plaque: plaqueSB,
    trim: (p) => m.insideMV(p, -0.02),
  });
  const mvWall = buildTube({
    u0: m.sMin, u1: m.sMax, axialSteps: mvSteps, radialSteps: nr,
    point: m.mvPoint, frame: m.mvFrame, radius: (s) => m.mvRefRadius(s) + WALL_THICKNESS,
    trim: (p) => m.insideSB(p, WALL_THICKNESS - 0.02),
  });
  const sbWall = buildTube({
    u0: 0, u1: m.sbLength, axialSteps: sbSteps, radialSteps: nr,
    point: m.sbPoint, frame: () => sbF, radius: (t) => m.sbRefRadius(t) + WALL_THICKNESS,
    trim: (p) => m.insideMV(p, WALL_THICKNESS - 0.02),
  });
  return { mvLumen, sbLumen, mvWall, sbWall };
}

/** Keep the DMV wall surface that lies beyond the carina (it bounds the flow divider). */
function isNearCarinaDistalWall(m: BifurcationModel, p: Vec3): boolean {
  return p[0] > m.xCarina + 0.05;
}
