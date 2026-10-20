import { hkParentDiameter, hkDaughterDiameter, hkCompare, HK_EXPONENT } from '../engine/huoKassab';

describe('Huo–Kassab relationship', () => {
  it('uses the 7/3 exponent', () => expect(HK_EXPONENT).toBeCloseTo(2.333333, 6));

  it('computes the parent diameter (hand-checked example)', () => {
    const r = hkParentDiameter(3.0, 2.5);
    expect(r.ok).toBe(true);
    // (3^(7/3) + 2.5^(7/3))^(3/7)
    const expected = Math.pow(Math.pow(3, 7 / 3) + Math.pow(2.5, 7 / 3), 3 / 7);
    if (r.ok) {
      expect(r.value).toBeCloseTo(expected, 12);
      expect(r.value).toBeCloseTo(3.7215, 3);
    }
  });

  it('satisfies the defining equation', () => {
    const r = hkParentDiameter(2.8, 2.1);
    if (!r.ok) throw new Error();
    expect(Math.pow(r.value, 7 / 3)).toBeCloseTo(Math.pow(2.8, 7 / 3) + Math.pow(2.1, 7 / 3), 9);
  });

  it('symmetric daughters give 2^(-3/7) scaling', () => {
    const r = hkParentDiameter(2, 2);
    if (!r.ok) throw new Error();
    expect(r.value).toBeCloseTo(2 * Math.pow(2, 3 / 7), 12);
  });

  it('inverts to the unknown daughter (round trip)', () => {
    const p = hkParentDiameter(3.2, 2.4);
    if (!p.ok) throw new Error();
    const d = hkDaughterDiameter(p.value, 2.4);
    expect(d.ok && d.value).toBeCloseTo(3.2, 10);
    const s = hkDaughterDiameter(p.value, 3.2);
    expect(s.ok && s.value).toBeCloseTo(2.4, 10);
  });

  it('is dimensionally homogeneous (scaling all diameters scales the result)', () => {
    const a = hkParentDiameter(3, 2.5);
    const b = hkParentDiameter(3000, 2500); // mm → µm
    if (!a.ok || !b.ok) throw new Error();
    expect(b.value / 1000).toBeCloseTo(a.value, 9);
  });

  it.each([
    [0, 2],
    [-1, 2],
    [NaN, 2],
    [Infinity, 2],
    [3, 0],
  ])('rejects invalid inputs (%s, %s)', (x, y) => {
    expect(hkParentDiameter(x, y).ok).toBe(false);
  });

  it('rejects a daughter solve with no positive solution', () => {
    expect(hkDaughterDiameter(2.5, 3).ok).toBe(false);
    expect(hkDaughterDiameter(3, 3).ok).toBe(false);
  });

  it('reports absolute and relative difference', () => {
    const c = hkCompare(3.5, 3.0, 2.5);
    if ('error' in c) throw new Error();
    expect(c.absoluteDifference).toBeCloseTo(3.5 - c.calculatedPMV, 12);
    expect(c.relativeDifferencePct).toBeCloseTo(((3.5 - c.calculatedPMV) / c.calculatedPMV) * 100, 12);
    expect('error' in hkCompare(0, 3, 2.5)).toBe(true);
  });
});
