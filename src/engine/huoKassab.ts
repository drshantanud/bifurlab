/**
 * Huo–Kassab bifurcation diameter scaling relationship:
 *   D_PMV^(7/3) = D_DMV^(7/3) + D_SB^(7/3)
 * Anatomical scaling relationship only. It is not a validated method for choosing
 * stent diameter or predicting the post-PCI result.
 *
 * References:
 *  Huo Y, Kassab GS. Intraspecific scaling laws of vascular trees. J R Soc Interface 2012;9:190–200.
 *  Huo Y, Finet G, Lefevre T, Louvard Y, Moussa I, Kassab GS. Which diameter and angle rule provides
 *  optimal flow patterns in a coronary bifurcation? J Biomech 2012;45:1273–1279.
 */
export const HK_EXPONENT = 7 / 3;

export type HKResult = { ok: true; value: number } | { ok: false; error: string };

function checkDiameter(name: string, d: unknown): string | null {
  if (typeof d !== 'number' || !Number.isFinite(d)) return `${name} must be a finite number (mm).`;
  if (d <= 0) return `${name} must be greater than 0 mm.`;
  return null;
}

/** Proximal main-vessel diameter predicted from the two daughter diameters (all mm). */
export function hkParentDiameter(dDMV: number, dSB: number): HKResult {
  const e = checkDiameter('Distal main-vessel diameter', dDMV) ?? checkDiameter('Side-branch diameter', dSB);
  if (e) return { ok: false, error: e };
  return { ok: true, value: Math.pow(Math.pow(dDMV, HK_EXPONENT) + Math.pow(dSB, HK_EXPONENT), 1 / HK_EXPONENT) };
}

/** Unknown daughter diameter given the parent and the other daughter (all mm). */
export function hkDaughterDiameter(dPMV: number, dOtherDaughter: number): HKResult {
  const e = checkDiameter('Proximal main-vessel diameter', dPMV) ?? checkDiameter('Known daughter diameter', dOtherDaughter);
  if (e) return { ok: false, error: e };
  const rest = Math.pow(dPMV, HK_EXPONENT) - Math.pow(dOtherDaughter, HK_EXPONENT);
  if (!(rest > 0))
    return {
      ok: false,
      error: 'The proximal diameter must be larger than the known daughter diameter; otherwise the relationship has no positive solution.',
    };
  return { ok: true, value: Math.pow(rest, 1 / HK_EXPONENT) };
}

export interface HKComparison {
  measuredPMV: number;
  calculatedPMV: number;
  /** measured − calculated, mm */
  absoluteDifference: number;
  /** (measured − calculated) / calculated × 100 */
  relativeDifferencePct: number;
}

export function hkCompare(dPMV: number, dDMV: number, dSB: number): HKComparison | { error: string } {
  const e = checkDiameter('Proximal main-vessel diameter', dPMV);
  if (e) return { error: e };
  const c = hkParentDiameter(dDMV, dSB);
  if (!c.ok) return { error: c.error };
  const absoluteDifference = dPMV - c.value;
  return {
    measuredPMV: dPMV,
    calculatedPMV: c.value,
    absoluteDifference,
    relativeDifferencePct: (absoluteDifference / c.value) * 100,
  };
}
