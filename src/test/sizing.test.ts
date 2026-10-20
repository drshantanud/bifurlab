import { describe, expect, it } from 'vitest';
import { BUILTIN_REGISTRY, loadRegistry } from '../data/registry';
import { assessStent, finetParentDiameter, nearestStentSize, proximalDiameter } from '../engine/sizing';

const reg = loadRegistry(BUILTIN_REGISTRY);
const dev = (id: string) => reg.devices.find((d) => d.id === id)!;

describe('page-1 sizing', () => {
  it("computes Finet's law", () => {
    const r = finetParentDiameter(3, 2.5);
    expect(r.ok && r.value).toBeCloseTo(3.729, 3);
  });
  it('uses Huo–Kassab by default rule', () => {
    const r = proximalDiameter('huo-kassab', 3, 2.5);
    expect(r.ok && r.value).toBeCloseTo(3.7215, 3);
  });
  it('rejects non-positive diameters', () => {
    expect(finetParentDiameter(0, 2).ok).toBe(false);
  });
  it('picks the stent size nearest the distal MV', () => {
    expect(nearestStentSize(dev('abbott-xience-skypoint'), 3.1).diameter).toBe(3.0);
  });
  it('prefers a nearby size with a documented limit on range-only records', () => {
    const f = nearestStentSize(dev('terumo-ultimaster-nagomi'), 3.25);
    expect(f.diameter).toBe(3.0);
  });
  it('XIENCE Skypoint 3.0 mm cannot reach a 4.0 mm proximal vessel (max 3.75)', () => {
    const f = assessStent(dev('abbott-xience-skypoint'), 3.0, true, 4.0);
    expect(f.maxExpansion.value).toBe(3.75);
    expect(f.verdict).toBe('cannot-reach');
    expect(f.margin).toBeCloseTo(-0.25, 6);
  });
  it('XIENCE Skypoint 3.5 mm reaches 4.0 mm (max 5.75)', () => {
    expect(assessStent(dev('abbott-xience-skypoint'), 3.5, true, 4.0).verdict).toBe('reaches');
  });
  it('reports unknown when no limit is documented', () => {
    const noLimit = reg.devices.find((d) => d.maxExpansionDiameter.every((e) => e.value == null));
    if (noLimit) expect(assessStent(noLimit, 3.0, false, 4.0).verdict).toBe('unknown');
  });
});
