/**
 * ProceduralSequence: conceptual teaching sequences. They are not procedural recommendations.
 */
import type { Technique, ProcParams } from './scenario';

export type WireKind = 'mv' | 'sbNative' | 'sbJailed' | 'sbThroughCell' | 'dmvThroughCell';
export type StentKey = 'mv' | 'sb' | 'culotteFirst' | 'culotteSecond';
export type BalloonKey = 'pot' | 'cellOpen' | 'sbDil' | 'mvCrush' | 'dmvOpen';

export type Action =
  | { kind: 'wires'; wires: WireKind[] }
  | { kind: 'deploy'; stent: StentKey }
  | { kind: 'balloon'; balloon: BalloonKey }
  | { kind: 'kiss' }
  | { kind: 'inspect' };

export interface StageDef {
  id: string;
  title: string;
  teaching: string;
  optional?: 'includeSBDilation' | 'includeKissing';
  actions: Action[];
}

const W = (...wires: WireKind[]): Action => ({ kind: 'wires', wires });

const PROVISIONAL: StageDef[] = [
  { id: 'prep', title: 'Guidewire and main-vessel preparation', teaching: 'Wires are placed in the main vessel and the side branch. Lesion preparation is shown conceptually only; plaque modification is not modelled.', actions: [W('mv', 'sbNative')] },
  { id: 'mv-stent', title: 'Main-vessel stent deployment', teaching: 'The main-vessel stent is deployed across the side-branch origin, jailing the side-branch wire. The stent is drawn at its nominal diameter; the entered pressure is recorded but not converted into a diameter.', actions: [W('mv', 'sbJailed'), { kind: 'deploy', stent: 'mv' }] },
  { id: 'pot', title: 'Proximal optimization technique (POT)', teaching: 'A short balloon sized to the proximal main vessel is inflated with its distal end near the carina, enlarging the proximal stent segment.', actions: [W('mv', 'sbJailed'), { kind: 'balloon', balloon: 'pot' }] },
  { id: 'rewire', title: 'Side-branch rewiring', teaching: 'The side branch is rewired through a stent cell. A distal cell crossing is shown, as is commonly taught.', actions: [W('mv', 'sbThroughCell')] },
  { id: 'cell-open', title: 'Side-branch cell opening', teaching: 'A small balloon dilates the stent cell facing the ostium. Struts inside the balloon are displaced to its surface in this illustrative model.', actions: [W('mv', 'sbThroughCell'), { kind: 'balloon', balloon: 'cellOpen' }] },
  { id: 'sb-dil', title: 'Side-branch balloon dilation (optional)', optional: 'includeSBDilation', teaching: 'A balloon sized to the side branch further opens the ostium and can distort the main-vessel stent opposite the ostium.', actions: [W('mv', 'sbThroughCell'), { kind: 'balloon', balloon: 'sbDil' }] },
  { id: 'kiss', title: 'Kissing balloon inflation (optional)', optional: 'includeKissing', teaching: 'Simultaneous main-vessel and side-branch balloons. The side-by-side balloons make the proximal segment elliptical in this model.', actions: [W('mv', 'sbThroughCell'), { kind: 'kiss' }] },
  { id: 'final-pot', title: 'Final POT', teaching: 'Final POT is taught to re-round the proximal segment after kissing. This illustrative engine only expands struts (no recoil or redistribution), so it shows re-rounding only where the POT balloon exceeds the current minor axis.', actions: [W('mv', 'sbThroughCell'), { kind: 'balloon', balloon: 'pot' }] },
  { id: 'inspect', title: 'Final geometry inspection', teaching: 'Inspect the ostium, the carina and the proximal segment. All outputs are illustrative geometric estimates.', actions: [W('mv', 'sbThroughCell'), { kind: 'inspect' }] },
];

const DK_CRUSH: StageDef[] = [
  { id: 'sb-stent', title: 'Side-branch stent deployment', teaching: 'The side-branch stent is deployed with a short protrusion into the main vessel, with a balloon parked in the main vessel.', actions: [W('mv', 'sbNative'), { kind: 'deploy', stent: 'sb' }] },
  { id: 'withdraw', title: 'Side-branch balloon withdrawal and protrusion assessment', teaching: 'The side-branch balloon and wire are withdrawn. The protrusion length shown is the value you entered.', actions: [W('mv'), { kind: 'inspect' }] },
  { id: 'crush', title: 'Balloon crush of the side-branch stent', teaching: 'A main-vessel balloon crushes the protruding side-branch struts against the main-vessel wall. (Standard DK-crush order: balloon crush and first kiss precede the main-vessel stent.)', actions: [W('mv'), { kind: 'balloon', balloon: 'mvCrush' }] },
  { id: 'rewire-1', title: 'Side-branch rewiring through the crushed stent', teaching: 'The side branch is rewired through the crushed struts.', actions: [W('mv', 'sbThroughCell')] },
  { id: 'kiss-1', title: 'First kissing balloon inflation', teaching: 'First kiss opens the crushed struts at the ostium before the main-vessel stent is placed.', actions: [W('mv', 'sbThroughCell'), { kind: 'kiss' }] },
  { id: 'mv-stent', title: 'Main-vessel stent deployment', teaching: 'The main-vessel stent is deployed across the bifurcation over the crushed segment.', actions: [W('mv'), { kind: 'deploy', stent: 'mv' }] },
  { id: 'pot', title: 'POT', teaching: 'Proximal optimization of the main-vessel stent.', actions: [W('mv'), { kind: 'balloon', balloon: 'pot' }] },
  { id: 'rewire-2', title: 'Side-branch rewiring', teaching: 'Second rewiring of the side branch through the main-vessel stent.', actions: [W('mv', 'sbThroughCell')] },
  { id: 'kiss-2', title: 'Final kissing balloon inflation', teaching: 'Final kissing balloon inflation.', actions: [W('mv', 'sbThroughCell'), { kind: 'kiss' }] },
  { id: 'final-pot', title: 'Final POT and inspection', teaching: 'Final POT. Inspect overlapping struts at the ostium and the proximal segment.', actions: [W('mv', 'sbThroughCell'), { kind: 'balloon', balloon: 'pot' }] },
];

const CULOTTE: StageDef[] = [
  { id: 'first-stent', title: 'First stent deployment (proximal main vessel into side branch)', teaching: 'The first stent runs from the proximal main vessel into the side branch, jailing the distal main vessel.', actions: [W('sbNative', 'mv'), { kind: 'deploy', stent: 'culotteFirst' }] },
  { id: 'rewire-other', title: 'Rewiring of the other branch and strut dilation', teaching: 'The distal main vessel is rewired through the first stent and its struts are dilated with a balloon.', actions: [W('sbNative', 'dmvThroughCell'), { kind: 'balloon', balloon: 'dmvOpen' }] },
  { id: 'second-stent', title: 'Second stent deployment (proximal main vessel into distal main vessel)', teaching: 'The second stent overlaps the first in the proximal main vessel.', actions: [W('mv'), { kind: 'deploy', stent: 'culotteSecond' }] },
  { id: 'pot', title: 'POT', teaching: 'Proximal optimization of the overlap segment.', actions: [W('mv'), { kind: 'balloon', balloon: 'pot' }] },
  { id: 'kiss', title: 'Side-branch rewiring and kissing balloon inflation', teaching: 'The side branch is rewired through the second stent and kissing balloons are inflated.', actions: [W('mv', 'sbThroughCell'), { kind: 'kiss' }] },
  { id: 'final-pot', title: 'Final POT and inspection', teaching: 'Final POT and inspection of the double-layer proximal segment.', actions: [W('mv', 'sbThroughCell'), { kind: 'balloon', balloon: 'pot' }] },
];

const tapLike = (tStent: boolean): StageDef[] => [
  { id: 'mv-stent', title: 'Main-vessel stenting', teaching: 'Provisional-style main-vessel stent across the side-branch origin.', actions: [W('mv', 'sbJailed'), { kind: 'deploy', stent: 'mv' }] },
  { id: 'pot', title: 'POT', teaching: 'Proximal optimization before rewiring.', actions: [W('mv', 'sbJailed'), { kind: 'balloon', balloon: 'pot' }] },
  { id: 'rewire', title: 'Side-branch rewiring and cell dilation', teaching: 'The side branch is rewired through a distal cell and the cell is dilated.', actions: [W('mv', 'sbThroughCell'), { kind: 'balloon', balloon: 'sbDil' }] },
  {
    id: 'sb-stent',
    title: 'Side-branch stent positioning and deployment',
    teaching: tStent
      ? 'T-stenting: the side-branch stent is positioned at the ostium with no protrusion. Part of the ostium may stay uncovered on the heel side.'
      : 'TAP: the side-branch stent protrudes slightly into the main vessel, creating a short neo-carina.',
    actions: [W('mv', 'sbThroughCell'), { kind: 'deploy', stent: 'sb' }],
  },
  { id: 'kiss', title: 'Kissing balloon inflation', optional: tStent ? 'includeKissing' : undefined, teaching: 'Simultaneous main-vessel and side-branch balloon inflation.', actions: [W('mv', 'sbThroughCell'), { kind: 'kiss' }] },
  { id: 'final-pot', title: 'Final POT', teaching: 'Final proximal optimization.', actions: [W('mv', 'sbThroughCell'), { kind: 'balloon', balloon: 'pot' }] },
  { id: 'inspect', title: 'Final inspection', teaching: 'Inspect the neo-carina, ostial coverage and proximal segment.', actions: [W('mv', 'sbThroughCell'), { kind: 'inspect' }] },
];

export const SEQUENCES: Record<Technique, StageDef[]> = {
  provisional: PROVISIONAL,
  'dk-crush': DK_CRUSH,
  culotte: CULOTTE,
  tap: tapLike(false),
  't-stenting': tapLike(true),
};

/** All stages for a technique, flagged by whether the scenario includes them. */
export function allStages(t: Technique, p: ProcParams) {
  return SEQUENCES[t].map((s) => ({ ...s, included: !s.optional || p[s.optional] }));
}

/** The active sequence (optional stages the user switched off are removed). */
export function activeStages(t: Technique, p: ProcParams): StageDef[] {
  return allStages(t, p).filter((s) => s.included);
}

export const clampStage = (i: number, n: number) => Math.max(0, Math.min(n - 1, Math.round(Number.isFinite(i) ? i : 0)));
