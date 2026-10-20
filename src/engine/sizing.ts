/**
 * Page-1 sizing: proximal main-vessel diameter from the two daughter diameters, and a check of
 * each registry stent (sized to the distal main vessel) against its documented maximum expansion.
 * Lists options only; it does not rank devices or recommend one.
 */
import type { DeviceRecord, EvidenceNumber } from '../data/deviceSchema';
import { diameterOptions, lookupSized } from '../data/registry';
import { hkParentDiameter, type HKResult } from './huoKassab';

export type SizingRule = 'huo-kassab' | 'finet';

export const SIZING_RULES: { id: SizingRule; label: string; formula: string; reference: string }[] = [
  {
    id: 'huo-kassab',
    label: 'Huo–Kassab',
    formula: 'PMV^(7/3) = DMV^(7/3) + SB^(7/3)',
    reference: 'Huo Y, Kassab GS. J R Soc Interface 2012;9:190–200.',
  },
  {
    id: 'finet',
    label: "Finet's law",
    formula: 'PMV = 0.678 × (DMV + SB)',
    reference: 'Finet G et al. EuroIntervention 2008; as given in the EBC consensus (Burzotta et al., EuroIntervention 2024;20:e915–e926).',
  },
];

export const FINET_FACTOR = 0.678;

export function finetParentDiameter(dDMV: number, dSB: number): HKResult {
  for (const [n, d] of [['Distal main-vessel diameter', dDMV], ['Side-branch diameter', dSB]] as const)
    if (!Number.isFinite(d) || d <= 0) return { ok: false, error: `${n} must be greater than 0 mm.` };
  return { ok: true, value: FINET_FACTOR * (dDMV + dSB) };
}

export function proximalDiameter(rule: SizingRule, dDMV: number, dSB: number): HKResult {
  return rule === 'finet' ? finetParentDiameter(dDMV, dSB) : hkParentDiameter(dDMV, dSB);
}

/**
 * Stent diameter for the distal main vessel: the nearest offered size, ties to the smaller. When one
 * of the sizes within 0.25 mm has a documented expansion limit, the nearest such size is preferred,
 * so a size grid point without data (e.g. 3.25 mm on a range-only record) is not chosen by default.
 */
export function nearestStentSize(dev: DeviceRecord, dDMV: number): { diameter: number; documented: boolean } {
  const { values, documented } = diameterOptions(dev);
  const nearest = (vs: number[]) => vs.reduce((best, v) => (Math.abs(v - dDMV) < Math.abs(best - dDMV) - 1e-9 ? v : best), vs[0]);
  const withLimit = values.filter((v) => Math.abs(v - dDMV) <= 0.25 + 1e-9 && lookupSized(dev.maxExpansionDiameter, v).value != null);
  return { diameter: withLimit.length ? nearest(withLimit) : nearest(values), documented };
}

export type FitVerdict = 'reaches' | 'cannot-reach' | 'unknown';

export interface StentFit {
  device: DeviceRecord;
  diameter: number;
  sizeDocumented: boolean;
  maxExpansion: EvidenceNumber;
  minimalExpansion: EvidenceNumber | null;
  verdict: FitVerdict;
  /** documented max expansion minus target proximal diameter (mm) */
  margin: number | null;
}

export function assessStent(dev: DeviceRecord, diameter: number, sizeDocumented: boolean, targetPMV: number): StentFit {
  const maxExpansion = lookupSized(dev.maxExpansionDiameter, diameter);
  const minimal = dev.minimalExpansion ? lookupSized(dev.minimalExpansion, diameter) : null;
  const max = maxExpansion.value;
  const verdict: FitVerdict = max == null ? 'unknown' : max + 1e-9 >= targetPMV ? 'reaches' : 'cannot-reach';
  return {
    device: dev,
    diameter,
    sizeDocumented,
    maxExpansion,
    minimalExpansion: minimal && minimal.value != null ? minimal : null,
    verdict,
    margin: max == null ? null : max - targetPMV,
  };
}
