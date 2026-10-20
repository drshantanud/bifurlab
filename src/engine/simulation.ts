/**
 * Illustrative deployment engine. Folds the procedural stages up to the selected stage and returns
 * the resulting geometry. Geometry mode A: generic mesh; deformation by the illustrative balloon-contact rule.
 */
import type { BifurcationModel } from './bifurcationGeometry';
import type { LoadedRegistry, StrutThicknessForMesh } from '../data/registry';
import { lookupSized, strutThicknessForMesh, connectorsForMesh, lengthOptions, diameterOptions, deviceLabel } from '../data/registry';
import type { DeviceRecord } from '../data/deviceSchema';
import type { Scenario, StentChoice } from './scenario';
import { activeStages, clampStage, type StageDef, type StentKey, type BalloonKey, type WireKind } from './proceduralSequence';
import { mvPath, sbPath, pmvToSbPath, type Path } from './paths';
import { generateStentMesh, genericPattern, type StentMesh } from './stentMeshGenerator';
import { makeBalloon, applyBalloons, type Balloon } from './balloonGeometry';
import { type Vec3, add, scale, dot } from './math';

export interface SimStent {
  key: StentKey;
  label: string;
  device: DeviceRecord;
  choice: StentChoice;
  path: Path;
  mesh: StentMesh;
  thickness: StrutThicknessForMesh;
  connectors: { count: number; status: string };
  deployedAtStage: number;
}

export interface SimWarning {
  level: 'warning' | 'info';
  message: string;
  sourceIds: string[];
}

export interface AppliedBalloon {
  stage: number;
  label: string;
  diameter: number;
  pressure: number | null;
}

export interface SimResult {
  stages: StageDef[];
  stageIndex: number;
  stents: SimStent[];
  activeBalloons: Balloon[];
  wires: Vec3[][];
  warnings: SimWarning[];
  applied: AppliedBalloon[];
  geometryMode: 'A';
  deformationBasis: 'none' | 'illustrative';
}

export function stentStartS(m: BifurcationModel) {
  return m.lesions.prox[0] - 2;
}

export function sbStentStartT(m: BifurcationModel, protrusion: number) {
  return Math.max(0.05, m.tOstium - protrusion);
}

function buildStent(key: StentKey, m: BifurcationModel, sc: Scenario, reg: LoadedRegistry, stage: number): SimStent | null {
  const choice = key === 'mv' || key === 'culotteSecond' ? sc.mvStent : sc.sbStent;
  const device = reg.devices.find((d) => d.id === choice.deviceId);
  if (!device) return null;
  let path: Path;
  if (key === 'mv' || key === 'culotteSecond') path = mvPath(m, stentStartS(m), choice.length);
  else if (key === 'sb') path = sbPath(m, sbStentStartT(m, sc.proc.protrusion), choice.length);
  else path = pmvToSbPath(m, stentStartS(m), choice.length);
  const connectors = connectorsForMesh(device);
  const mesh = generateStentMesh(path, choice.diameter, genericPattern(choice.diameter, connectors.count));
  const label =
    key === 'mv' ? 'Main-vessel stent' : key === 'sb' ? 'Side-branch stent' : key === 'culotteFirst' ? 'First stent (PMV → SB)' : 'Second stent (PMV → DMV)';
  return { key, label, device, choice, path, mesh, thickness: strutThicknessForMesh(device, choice.diameter), connectors, deployedAtStage: stage };
}

function mvBalloon(m: BifurcationModel, id: string, label: string, d: number, s0: number, s1: number) {
  return makeBalloon(id, label, d, mvPath(m, s0, s1 - s0).polyline(0.25));
}

function balloonFor(key: BalloonKey, m: BifurcationModel, sc: Scenario): Balloon {
  const p = sc.proc;
  const mid = (m.xHeel + m.xCarina) / 2;
  switch (key) {
    case 'pot': {
      const end = m.xCarina + p.potOffset;
      return mvBalloon(m, 'pot', `POT balloon ${p.potD.toFixed(2)} mm`, p.potD, end - p.potLength, end);
    }
    case 'mvCrush':
      return mvBalloon(m, 'crush', `Crush balloon ${p.mvBalloonD.toFixed(2)} mm`, p.mvBalloonD, mid - p.balloonLength / 2, mid + p.balloonLength / 2);
    case 'dmvOpen':
      return mvBalloon(m, 'dmv', `DMV balloon ${p.mvBalloonD.toFixed(2)} mm`, p.mvBalloonD, m.xHeel - 1.5, m.xHeel - 1.5 + p.balloonLength);
    case 'cellOpen':
    case 'sbDil': {
      const d = key === 'cellOpen' ? p.cellOpenBalloonD : p.sbBalloonD;
      const t0 = Math.max(0.2, m.tOstium - 1.5);
      return makeBalloon(key, `${key === 'cellOpen' ? 'Cell-opening' : 'Side-branch'} balloon ${d.toFixed(2)} mm`, d, sbPath(m, t0, p.balloonLength).polyline(0.25));
    }
  }
}

function kissingBalloons(m: BifurcationModel, sc: Scenario): Balloon[] {
  const p = sc.proc;
  const rm = p.mvBalloonD / 2;
  const rs = p.sbBalloonD / 2;
  const start = m.xHeel - p.kissOverlap;
  const N: Vec3 = [0, 1, 0];
  const off = (s: number, k: number): Vec3 => add(m.mvPoint(s), scale(N, k));
  const mvLenAfter = Math.max(2, p.balloonLength - p.kissOverlap);
  const mvCtrl: Vec3[] = [off(start, -rs), off(start + p.kissOverlap * 0.5, -rs * 0.8), off(m.xHeel, -rs * 0.35), m.mvPoint(m.xCarina), m.mvPoint(m.xCarina + mvLenAfter)];
  const sbCtrl: Vec3[] = [off(start, rm), off(start + p.kissOverlap * 0.5, rm * 0.8), off(m.xHeel, rm * 0.5), m.sbPoint(m.tOstium), m.sbPoint(m.tOstium + mvLenAfter)];
  return [
    makeBalloon('kiss-mv', `Kissing MV balloon ${p.mvBalloonD.toFixed(2)} mm`, p.mvBalloonD, mvCtrl, true),
    makeBalloon('kiss-sb', `Kissing SB balloon ${p.sbBalloonD.toFixed(2)} mm`, p.sbBalloonD, sbCtrl, true),
  ];
}

export const KISSING_CONSTRAINT_TEXT =
  'Kissing overlap constraint (illustrative assumption): in the proximal side-by-side zone, strut distance from the MV axis is capped at the larger of the reference lumen radius and the radius of a circle with the combined cross-sectional area of both balloons. Vessel and balloon compliance are not modelled.';

/**
 * ILLUSTRATIVE ASSUMPTION (see KISSING_CONSTRAINT_TEXT). Without a cap, two rigid cylinders would expand
 * the proximal segment to D_MV + D_SB, which a vessel-constrained stent does not do.
 */
export function constrainKissingOverlap(m: BifurcationModel, pos: Float32Array, rCap: number) {
  for (let i = 0; i < pos.length; i += 3) {
    const p: Vec3 = [pos[i], pos[i + 1], pos[i + 2]];
    const c = m.closestMV(p);
    if (c.s > m.xHeel) continue;
    const lim = Math.max(m.mvRefRadius(c.s), rCap);
    if (c.dist > lim && c.dist > 1e-9) {
      const k = lim / c.dist;
      pos[i] = c.q[0] + (p[0] - c.q[0]) * k;
      pos[i + 1] = c.q[1] + (p[1] - c.q[1]) * k;
      pos[i + 2] = c.q[2] + (p[2] - c.q[2]) * k;
    }
  }
}

function wirePath(kind: WireKind, m: BifurcationModel, mvR: number): Vec3[] {
  const s0 = m.sMin + 0.5;
  const N: Vec3 = [0, 1, 0];
  const sbEnd = m.sbPoint(m.sbLength - 0.5);
  switch (kind) {
    case 'mv':
      return [m.mvPoint(s0), m.mvPoint(m.sMax - 0.5)].map((p) => add(p, [0, -0.15, 0.1]));
    case 'sbNative':
      return [m.mvPoint(s0), m.mvPoint(m.xHeel - 1.5), m.sbPoint(m.tOstium), sbEnd].map((p) => add(p, [0, 0.12, -0.1]));
    case 'sbJailed':
      return [add(m.mvPoint(s0), scale(N, 0.3)), add(m.mvPoint(m.xHeel - 3), scale(N, mvR * 0.97)), add(m.mvPoint(m.xHeel), scale(N, mvR * 1.0)), m.sbPoint(m.tOstium + 1), sbEnd];
    case 'sbThroughCell':
      return [m.mvPoint(s0), m.mvPoint(m.xHeel), add(m.mvPoint(m.xCarina - 0.5), scale(N, m.rD * 0.9)), m.sbPoint(m.tOstium + 1.2), sbEnd].map((p) => add(p, [0, 0, 0.05]));
    case 'dmvThroughCell':
      return [m.mvPoint(s0), add(m.mvPoint(m.xHeel), scale(N, m.rP * 0.4)), add(m.mvPoint(m.xCarina + 0.5), scale(N, -m.rD * 0.6)), m.mvPoint(m.sMax - 0.5)];
  }
}

function inRangeList(vals: number[], x: number) {
  return vals.some((v) => Math.abs(v - x) < 1e-6);
}

export function simulate(m: BifurcationModel, sc: Scenario, reg: LoadedRegistry, stageIndexOverride?: number): SimResult {
  const stages = activeStages(sc.technique, sc.proc);
  const stageIndex = clampStage(stageIndexOverride ?? sc.stageIndex, stages.length);
  const stents: SimStent[] = [];
  const warnings: SimWarning[] = [];
  const applied: AppliedBalloon[] = [];
  const warned = new Set<string>();
  const warnOnce = (key: string, w: SimWarning) => {
    if (!warned.has(key)) {
      warned.add(key);
      warnings.push(w);
    }
  };
  let activeBalloons: Balloon[] = [];
  let wires: Vec3[][] = [];
  let deformed = false;

  // Size checks against the registry.
  const checkChoice = (role: string, c: StentChoice) => {
    const dev = reg.devices.find((d) => d.id === c.deviceId);
    if (!dev) return warnOnce(`missing-${role}`, { level: 'warning', message: `${role}: device not found in the registry.`, sourceIds: [] });
    const dOpt = diameterOptions(dev);
    const lOpt = lengthOptions(dev, c.diameter);
    if (!dOpt.documented)
      warnOnce(`dsize-${role}`, { level: 'info', message: `${role}: ${deviceLabel(dev)} has no verified list of individual diameters in the registry. Confirm the size exists.`, sourceIds: dev.diameters.sourceIds });
    else if (!inRangeList(dOpt.values, c.diameter))
      warnOnce(`dsize2-${role}`, { level: 'warning', message: `${role}: ${c.diameter} mm is not a documented diameter for ${deviceLabel(dev)}.`, sourceIds: dev.diameters.sourceIds });
    if (lOpt.documented && !inRangeList(lOpt.values, c.length))
      warnOnce(`lsize-${role}`, { level: 'warning', message: `${role}: ${c.length} mm is not a documented length for a ${c.diameter} mm ${deviceLabel(dev)}.`, sourceIds: dev.lengths.sourceIds });
  };
  const usesSB = stages.some((s) => s.actions.some((a) => a.kind === 'deploy' && a.stent !== 'mv' && a.stent !== 'culotteSecond'));
  const usesMV = stages.some((s) => s.actions.some((a) => a.kind === 'deploy' && (a.stent === 'mv' || a.stent === 'culotteSecond')));
  if (usesMV) checkChoice(sc.technique === 'culotte' ? 'Second stent' : 'Main-vessel stent', sc.mvStent);
  if (usesSB) checkChoice(sc.technique === 'culotte' ? 'First stent' : 'Side-branch stent', sc.sbStent);

  // Lesion coverage: each deployed stent should land beyond the lesion edges it is meant to cover.
  const checkCoverage = (key: StentKey) => {
    const st = buildStent(key, m, sc, reg, 0);
    if (!st) return;
    const end = st.path.point(st.path.length);
    const intoSB = key === 'sb' || key === 'culotteFirst';
    const short = intoSB
      ? m.anatomy.lesionSB > 0 && (dot(end, m.d) < m.lesions.sb[1] || !m.insideSB(end, 0.5))
      : m.anatomy.lesionDist > 0 && st.path.length + stentStartS(m) < m.lesions.dist[1];
    if (short)
      warnOnce(`cover-${key}`, {
        level: 'warning',
        message: `${st.label}: ${st.choice.length} mm does not reach beyond the distal edge of the ${intoSB ? 'side-branch' : 'distal main-vessel'} lesion. Choose a longer stent.`,
        sourceIds: [],
      });
  };
  for (const k of new Set(stages.flatMap((s) => s.actions.flatMap((a) => (a.kind === 'deploy' ? [a.stent] : []))))) checkCoverage(k);

  const contact = (balloons: Balloon[], stage: number, pressure: number | null, exclude?: SimStent, constrain?: (pos: Float32Array) => void) => {
    for (const st of stents) {
      if (st === exclude) continue;
      const moved = applyBalloons(st.mesh.positions, balloons);
      constrain?.(st.mesh.positions);
      if (!moved.some((x) => x === 1)) continue;
      deformed = true;
      const lim = lookupSized(st.device.maxExpansionDiameter, st.choice.diameter);
      for (const b of balloons) {
        if (lim.value != null && b.diameter > lim.value + 1e-9)
          warnings.push({
            level: 'warning',
            message: `Stage ${stage + 1}: ${b.label} exceeds the documented expansion limit of ${lim.value} mm for a ${st.choice.diameter} mm ${st.device.model} (${st.label.toLowerCase()}).`,
            sourceIds: lim.sourceIds,
          });
      }
      if (balloons.length === 2 && lim.value != null) {
        const env = balloons[0].diameter + balloons[1].diameter;
        if (env > lim.value)
          warnOnce(`env-${st.key}-${stage}`, {
            level: 'warning',
            message: `Stage ${stage + 1}: in the proximal overlap zone the side-by-side balloon envelope (${env.toFixed(2)} mm, rigid-cylinder geometry) exceeds the documented ${lim.value} mm limit of the ${st.label.toLowerCase()}.`,
            sourceIds: lim.sourceIds,
          });
      }
      if (lim.value == null)
        warnOnce(`nolim-${st.key}`, {
          level: 'info',
          message: `No documented expansion limit for a ${st.choice.diameter} mm ${st.device.model} in this registry version. Consult the IFU.`,
          sourceIds: [],
        });
    }
    void pressure;
  };

  for (let i = 0; i <= stageIndex; i++) {
    const stage = stages[i];
    const isCurrent = i === stageIndex;
    const stageBalloons: Balloon[] = [];
    for (const a of stage.actions) {
      if (a.kind === 'wires') wires = a.wires.map((w) => wirePath(w, m, m.mvRefRadius(m.xHeel - 2)));
      else if (a.kind === 'deploy') {
        const st = buildStent(a.stent, m, sc, reg, i);
        if (!st) continue;
        const delivery = makeBalloon(`deliver-${a.stent}`, `${st.label} delivery balloon ${st.choice.diameter.toFixed(2)} mm`, st.choice.diameter, st.path.polyline(0.25));
        contact([delivery], i, sc.proc.deployPressure, st);
        stents.push(st);
        stageBalloons.push(delivery);
        applied.push({ stage: i, label: delivery.label, diameter: delivery.diameter, pressure: sc.proc.deployPressure });
        const rbp = lookupSized(st.device.ratedBurstPressure, st.choice.diameter);
        if (rbp.value != null && sc.proc.deployPressure > rbp.value)
          warnings.push({ level: 'warning', message: `Stage ${i + 1}: deployment pressure ${sc.proc.deployPressure} atm exceeds the documented rated burst pressure of ${rbp.value} atm for a ${st.choice.diameter} mm ${st.device.model}.`, sourceIds: rbp.sourceIds });
        if (rbp.value == null)
          warnOnce(`norbp-${st.device.id}-${st.choice.diameter}`, { level: 'info', message: `No documented rated burst pressure for a ${st.choice.diameter} mm ${st.device.model} in this registry version.`, sourceIds: [] });
      } else if (a.kind === 'balloon') {
        const b = balloonFor(a.balloon, m, sc);
        contact([b], i, sc.proc.postDilPressure);
        stageBalloons.push(b);
        applied.push({ stage: i, label: b.label, diameter: b.diameter, pressure: sc.proc.postDilPressure });
      } else if (a.kind === 'kiss') {
        const bs = kissingBalloons(m, sc);
        contact(bs, i, sc.proc.postDilPressure, undefined, (pos) => constrainKissingOverlap(m, pos, Math.hypot(bs[0].diameter, bs[1].diameter) / 2));
        stageBalloons.push(...bs);
        bs.forEach((b) => applied.push({ stage: i, label: b.label, diameter: b.diameter, pressure: sc.proc.postDilPressure }));
      }
    }
    if (isCurrent) activeBalloons = stageBalloons;
  }
  if (applied.some((a) => !a.label.includes('delivery')))
    warnings.push({ level: 'info', message: 'Post-dilation balloon specifications are not part of the registry. Check the balloon IFU for its pressure limits.', sourceIds: [] });
  for (const st of stents)
    if (st.thickness.usedFallback)
      warnOnce(`thick-${st.key}`, { level: 'info', message: `${st.label}: strut thickness for this size is unavailable; the mesh uses an illustrative ${st.thickness.micrometres} µm.`, sourceIds: [] });

  return { stages, stageIndex, stents, activeBalloons, wires, warnings, applied, geometryMode: 'A', deformationBasis: deformed ? 'illustrative' : 'none' };
}
