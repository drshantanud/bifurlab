import { EXAMPLE_ANATOMY } from '../engine/anatomy';
import { buildBifurcation } from '../engine/bifurcationGeometry';
import { BUILTIN_REGISTRY, loadRegistry } from '../data/registry';
import { defaultScenario, serializeScenarios, parseScenarioFile } from '../engine/scenario';
import { simulate } from '../engine/simulation';
import { computeMetrics } from '../engine/measurementEngine';
import { buildReportData, reportHTML, reportMarkdown, metricsCSV } from '../engine/report';
import { REPORT_NOTICE } from '../version';

const reg = loadRegistry(BUILTIN_REGISTRY);
const m = buildBifurcation(EXAMPLE_ANATOMY);
const s1 = { ...defaultScenario('a', 'Scenario A', EXAMPLE_ANATOMY, reg, 'provisional', 'abbott-xience-skypoint'), stageIndex: 99 };
const s2 = { ...defaultScenario('b', 'Scenario B', EXAMPLE_ANATOMY, reg, 'culotte', 'biotronik-orsiro-mission'), stageIndex: 99 };
const items = [s1, s2].map((scenario) => {
  const sim = simulate(m, scenario, reg);
  return { scenario, sim, metrics: computeMetrics(m, scenario, sim) };
});
const data = buildReportData(EXAMPLE_ANATOMY, items, reg, new Date('2026-10-19T12:00:00Z'));

describe('report export', () => {
  it('contains the required notice in every format', () => {
    expect(reportHTML(data)).toContain(REPORT_NOTICE.slice(0, 60));
    expect(reportMarkdown(data)).toContain(REPORT_NOTICE);
    expect(data.notice).toBe(REPORT_NOTICE);
  });
  it('reports the same metric values as the simulator (export consistency)', () => {
    const csv = metricsCSV(data);
    for (const it of items)
      for (const mt of it.metrics) {
        if (mt.value != null) expect(csv).toContain(mt.value.toFixed(4));
      }
    expect(data.scenarios[0].metrics).toEqual(items[0].metrics);
  });
  it('includes version, date, anatomy, stents, sequence, sources and limitations', () => {
    const html = reportHTML(data, 'data:image/png;base64,AAAA');
    for (const t of ['Version', '2026-10-19', 'Proximal MV reference diameter', 'XIENCE Skypoint', 'Orsiro Mission', 'Final POT', 'Limitations', 'References', 'cardiovascular.abbott', 'Validation status', 'img'])
      expect(html).toContain(t);
    expect(data.references.length).toBeGreaterThan(2);
  });
  it('never labels the output as validated decision support', () => {
    expect(reportHTML(data)).not.toMatch(/validated clinical decision/i);
    expect(data.validationStatus).toMatch(/Not mechanically validated/);
  });
  it('round-trips scenario files without patient identifiers', () => {
    const f = serializeScenarios(EXAMPLE_ANATOMY, [s1, s2], reg.registryVersion, 'teaching');
    const parsed = parseScenarioFile(JSON.stringify(f));
    expect(parsed.ok && parsed.file.scenarios[1].technique).toBe('culotte');
    expect(JSON.stringify(f)).not.toMatch(/patient|mrn|dob/i);
    expect(parseScenarioFile('{').ok).toBe(false);
    expect(parseScenarioFile('{"format":"x"}').ok).toBe(false);
  });
});
