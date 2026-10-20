import type { Anatomy } from './anatomy';
import type { LoadedRegistry } from '../data/registry';
import { diameterOptions, lengthOptions } from '../data/registry';
import { buildBifurcation, type BifurcationModel } from './bifurcationGeometry';
import { pmvToSbReach } from './paths';
import { APP_VERSION, GEOMETRY_ENGINE_VERSION } from '../version';

export type Technique = 'provisional' | 'dk-crush' | 'culotte' | 'tap' | 't-stenting';

export const TECHNIQUES: { id: Technique; label: string; twoStent: boolean }[] = [
  { id: 'provisional', label: 'Provisional stenting', twoStent: false },
  { id: 'dk-crush', label: 'DK crush', twoStent: true },
  { id: 'culotte', label: 'Culotte', twoStent: true },
  { id: 'tap', label: 'TAP (T and protrusion)', twoStent: true },
  { id: 't-stenting', label: 'T-stenting', twoStent: true },
];

export interface StentChoice {
  deviceId: string;
  diameter: number;
  length: number;
}

export interface ProcParams {
  /** Stent delivery inflation pressure, atm (recorded; not converted to diameter) */
  deployPressure: number;
  /** Post-dilation balloon inflation pressure, atm (recorded; not converted to diameter) */
  postDilPressure: number;
  mvBalloonD: number;
  sbBalloonD: number;
  cellOpenBalloonD: number;
  balloonLength: number;
  potD: number;
  potLength: number;
  /** POT balloon distal end relative to the carina, mm (negative = proximal) */
  potOffset: number;
  /** Proximal side-by-side length of kissing balloons in the PMV, mm */
  kissOverlap: number;
  /** SB stent protrusion into the MV along the SB axis, mm (crush/TAP) */
  protrusion: number;
  includeSBDilation: boolean;
  includeKissing: boolean;
}

export type SimulationMode = 'teaching' | 'research' | 'mechanical';

export interface Scenario {
  id: string;
  name: string;
  technique: Technique;
  mvStent: StentChoice;
  sbStent: StentChoice;
  proc: ProcParams;
  stageIndex: number;
}

export const round025 = (x: number) => Math.round(x * 4) / 4;

const nearest = (vals: number[], x: number) => vals.reduce((b, v) => (Math.abs(v - x) < Math.abs(b - x) ? v : b), vals[0]);
const atLeast = (vals: number[], x: number) => vals.find((v) => v >= x) ?? vals[vals.length - 1];

export function defaultProtrusion(t: Technique) {
  return t === 'dk-crush' ? 2 : t === 'tap' ? 1.5 : 0;
}

/** Teaching default: each stent extends this far (mm) beyond the lesion edges. */
export const EDGE_MARGIN = 2;

/**
 * Minimum stent lengths (mm) that land EDGE_MARGIN beyond each lesion edge for a technique.
 * MV stents (and the culotte second stent) start EDGE_MARGIN proximal to the proximal lesion.
 * The culotte first stent starts at the same MV station and runs into the side branch, so its length is the arc length along that path.
 */
export function coverLengths(m: BifurcationModel, technique: Technique): { mv: number; sb: number } {
  const sStart = m.lesions.prox[0] - EDGE_MARGIN;
  const mv = m.lesions.dist[1] + EDGE_MARGIN - sStart;
  const sb =
    technique === 'culotte' ? pmvToSbReach(m, sStart, m.lesions.sb[1] + EDGE_MARGIN) : m.lesions.sb[1] - m.tOstium + 2 * EDGE_MARGIN + defaultProtrusion(technique);
  return { mv, sb };
}

const fitLength = (reg: LoadedRegistry, c: StentChoice, need: number, keepIfLonger: boolean): StentChoice => {
  const dev = reg.devices.find((d) => d.id === c.deviceId);
  if (!dev || (keepIfLonger && c.length >= need)) return c;
  return { ...c, length: atLeast(lengthOptions(dev, c.diameter).values, need) };
};

/** Switch technique, re-sizing stent lengths (same device and diameter) so they cover the lesions for the new technique. */
export function withTechnique(sc: Scenario, technique: Technique, anatomy: Anatomy, reg: LoadedRegistry): Scenario {
  const cover = coverLengths(buildBifurcation(anatomy), technique);
  return {
    ...sc,
    technique,
    stageIndex: 0,
    mvStent: fitLength(reg, sc.mvStent, cover.mv, false),
    sbStent: fitLength(reg, sc.sbStent, cover.sb, false),
    proc: { ...sc.proc, protrusion: defaultProtrusion(technique) },
  };
}

/** After an anatomy edit, lengthen any stent that no longer reaches past the lesion edges (never shortens a user's choice). */
export function ensureCoverage(sc: Scenario, anatomy: Anatomy, reg: LoadedRegistry): Scenario {
  const cover = coverLengths(buildBifurcation(anatomy), sc.technique);
  const mvStent = fitLength(reg, sc.mvStent, cover.mv, true);
  const sbStent = fitLength(reg, sc.sbStent, cover.sb, true);
  return mvStent === sc.mvStent && sbStent === sc.sbStent ? sc : { ...sc, mvStent, sbStent };
}

/** Example procedural set-up derived from anatomy. These are teaching defaults, not recommendations. */
export function defaultScenario(id: string, name: string, anatomy: Anatomy, reg: LoadedRegistry, technique: Technique, deviceId: string): Scenario {
  const dev = reg.devices.find((d) => d.id === deviceId) ?? reg.devices[0];
  const m = buildBifurcation(anatomy);
  const dOpts = diameterOptions(dev).values;
  const mvD = nearest(dOpts, anatomy.dDMV);
  const sbD = nearest(dOpts, anatomy.dSB);
  const cover = coverLengths(m, technique);
  const mvL = atLeast(lengthOptions(dev, mvD).values, cover.mv);
  const sbL = atLeast(lengthOptions(dev, sbD).values, cover.sb);
  return {
    id,
    name,
    technique,
    mvStent: { deviceId: dev.id, diameter: mvD, length: mvL },
    sbStent: { deviceId: dev.id, diameter: sbD, length: sbL },
    proc: {
      deployPressure: 12,
      postDilPressure: 14,
      mvBalloonD: round025(anatomy.dDMV),
      sbBalloonD: round025(anatomy.dSB),
      cellOpenBalloonD: 2.0,
      balloonLength: 12,
      potD: round025(anatomy.dPMV),
      potLength: 8,
      potOffset: 0,
      kissOverlap: 4,
      protrusion: defaultProtrusion(technique),
      includeSBDilation: true,
      includeKissing: true,
    },
    stageIndex: 0,
  };
}

export interface SavedScenarioFile {
  format: 'bifurcation-lab-scenario';
  appVersion: string;
  geometryEngine: string;
  registryVersion: string;
  savedAt: string;
  simulationMode: SimulationMode;
  anatomy: Anatomy;
  scenarios: Scenario[];
}

export function serializeScenarios(anatomy: Anatomy, scenarios: Scenario[], registryVersion: string, mode: SimulationMode): SavedScenarioFile {
  return {
    format: 'bifurcation-lab-scenario',
    appVersion: APP_VERSION,
    geometryEngine: GEOMETRY_ENGINE_VERSION,
    registryVersion,
    savedAt: new Date().toISOString(),
    simulationMode: mode,
    anatomy,
    scenarios,
  };
}

export function parseScenarioFile(text: string): { ok: true; file: SavedScenarioFile } | { ok: false; error: string } {
  try {
    const f = JSON.parse(text);
    if (f?.format !== 'bifurcation-lab-scenario') return { ok: false, error: 'This is not a Bifurcation Lab scenario file.' };
    if (!f.anatomy || !Array.isArray(f.scenarios) || f.scenarios.length === 0) return { ok: false, error: 'The file has no anatomy or scenarios.' };
    return { ok: true, file: f };
  } catch {
    return { ok: false, error: 'The text is not valid JSON.' };
  }
}
