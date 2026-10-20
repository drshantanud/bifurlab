/** Report export: one data object rendered to HTML, Markdown, JSON and CSV so all formats agree. */
import type { Anatomy } from './anatomy';
import type { Scenario } from './scenario';
import { TECHNIQUES } from './scenario';
import type { SimResult } from './simulation';
import { KISSING_CONSTRAINT_TEXT } from './simulation';
import type { Metric } from './measurementEngine';
import type { LoadedRegistry } from '../data/registry';
import { lookupSized } from '../data/registry';
import { APP_NAME, APP_VERSION, GEOMETRY_ENGINE_VERSION, REPORT_NOTICE } from '../version';

export const MODEL_LIMITATIONS = [
  'Stent meshes use a generic illustrative pattern; proprietary ring and connector architecture is not reproduced.',
  'Device-specific differences in this build come only from documented strut thickness, documented connector count (where available) and the selected size.',
  'Balloons are rigid cylinders at their labelled diameter. Pressure–diameter compliance, recoil, foreshortening and vessel–stent contact mechanics are not modelled.',
  'Struts inside an inflated balloon are moved to its surface; struts are never pulled inward, so re-rounding appears only where a balloon exceeds the current minor axis.',
  KISSING_CONSTRAINT_TEXT,
  'Plaque is drawn from the entered burden and eccentricity; it does not influence stent geometry.',
  'Visual side-branch opening is not equivalent to side-branch flow, FFR, perfusion or clinical outcome.',
  'Mechanical simulation (finite-element) is not available in this build; no output is mechanically validated.',
];

export interface ScenarioReport {
  name: string;
  technique: string;
  stents: {
    role: string;
    model: string;
    manufacturer: string;
    generation: string;
    diameter: number;
    length: number;
    strutThickness: string;
    strutEvidence: string;
    maxExpansion: string;
    sources: string[];
  }[];
  sequence: { stage: number; title: string; reached: boolean }[];
  balloons: { stage: number; label: string; diameter: number; pressure: number | null }[];
  procedure: Scenario['proc'];
  metrics: Metric[];
  warnings: { level: string; message: string }[];
}

export interface ReportData {
  application: string;
  version: string;
  geometryEngine: string;
  registryVersion: string;
  generatedAt: string;
  validationStatus: string;
  geometryMode: string;
  notice: string;
  anatomy: Anatomy;
  scenarios: ScenarioReport[];
  references: { id: string; title: string; publisher: string; url: string; revision: string | null; accessed: string }[];
  limitations: string[];
}

export function buildReportData(anatomy: Anatomy, items: { scenario: Scenario; sim: SimResult; metrics: Metric[] }[], reg: LoadedRegistry, now = new Date()): ReportData {
  const usedSources = new Set<string>();
  const scenarios: ScenarioReport[] = items.map(({ scenario, sim, metrics }) => ({
    name: scenario.name,
    technique: TECHNIQUES.find((t) => t.id === scenario.technique)!.label,
    stents: sim.stents.map((st) => {
      const lim = lookupSized(st.device.maxExpansionDiameter, st.choice.diameter);
      const srcs = [...st.thickness.evidence.sourceIds, ...lim.sourceIds, ...st.device.material.sourceIds];
      srcs.forEach((s) => usedSources.add(s));
      return {
        role: st.label,
        model: st.device.model,
        manufacturer: st.device.manufacturer,
        generation: st.device.generation,
        diameter: st.choice.diameter,
        length: st.choice.length,
        strutThickness: `${st.thickness.micrometres} µm`,
        strutEvidence: st.thickness.status,
        maxExpansion: lim.value != null ? `${lim.value} mm (${lim.status})` : 'Data unavailable',
        sources: [...new Set(srcs)],
      };
    }),
    sequence: sim.stages.map((s, i) => ({ stage: i + 1, title: s.title, reached: i <= sim.stageIndex })),
    balloons: sim.applied.map((a) => ({ stage: a.stage + 1, label: a.label, diameter: a.diameter, pressure: a.pressure })),
    procedure: scenario.proc,
    metrics,
    warnings: sim.warnings.map((w) => {
      w.sourceIds.forEach((s) => usedSources.add(s));
      return { level: w.level, message: w.message };
    }),
  }));
  return {
    application: APP_NAME,
    version: APP_VERSION,
    geometryEngine: GEOMETRY_ENGINE_VERSION,
    registryVersion: reg.registryVersion,
    generatedAt: now.toISOString(),
    validationStatus: 'Not mechanically validated. Illustrative geometry (mode A) with illustrative deformation.',
    geometryMode: 'A — visually generated generic mesh; deformation by an illustrative balloon-contact rule',
    notice: REPORT_NOTICE,
    anatomy,
    scenarios,
    references: [
      { id: 'huo-kassab-2012', title: 'Huo Y, Finet G, Lefevre T, Louvard Y, Moussa I, Kassab GS. Which diameter and angle rule provides optimal flow patterns in a coronary bifurcation? J Biomech 2012;45:1273–1279.', publisher: 'Journal of Biomechanics', url: 'https://scholarworks.indianapolis.iu.edu/items/470d0c8c-aec4-4946-807e-57d66b6b6eb5', revision: null, accessed: '2026-10-19' },
      ...[...usedSources].map((id) => reg.sourceMap.get(id)).filter(Boolean).map((s) => ({ id: s!.id, title: s!.title, publisher: s!.publisher, url: s!.url, revision: s!.revision, accessed: s!.accessed })),
    ],
    limitations: MODEL_LIMITATIONS,
  };
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
export const fmt = (v: number | null, unit: string) => (v == null ? 'Not calculable from available data' : `${Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(unit === 'count' ? 0 : 2)} ${unit === 'ratio' || unit === 'count' ? '' : unit}`.trim());

const ANAT_ROWS: [keyof Anatomy, string, string][] = [
  ['dPMV', 'Proximal MV reference diameter', 'mm'],
  ['dDMV', 'Distal MV reference diameter', 'mm'],
  ['dSB', 'Side-branch reference diameter', 'mm'],
  ['angleDeg', 'MV–SB angle', '°'],
  ['lesionProx', 'Proximal lesion length', 'mm'],
  ['lesionDist', 'Distal MV lesion length', 'mm'],
  ['lesionSB', 'Side-branch lesion length', 'mm'],
  ['carinaRounding', 'Carina rounding radius', 'mm'],
  ['taperPct', 'Taper', '%'],
  ['sbFlarePct', 'SB ostial flare', '%'],
  ['curvatureDeg', 'MV curvature', '°'],
  ['plaqueBurdenPct', 'Plaque burden', '%'],
  ['eccentricity', 'Plaque eccentricity', ''],
  ['diameterSource', 'Reference diameter source', ''],
];

export function reportHTML(r: ReportData, imageDataUrl?: string | null): string {
  const scen = r.scenarios
    .map(
      (s) => `
<h2>${esc(s.name)} — ${esc(s.technique)}</h2>
<table><tr><th>Stent</th><th>Model / generation</th><th>Size</th><th>Strut thickness</th><th>Documented max expansion</th></tr>
${s.stents.map((st) => `<tr><td>${esc(st.role)}</td><td>${esc(st.model)}<br><small>${esc(st.manufacturer)} · ${esc(st.generation)}</small></td><td>${st.diameter} × ${st.length} mm</td><td>${esc(st.strutThickness)}<br><small>${esc(st.strutEvidence)}</small></td><td>${esc(st.maxExpansion)}</td></tr>`).join('') || '<tr><td colspan="5">No stent deployed at the selected stage.</td></tr>'}
</table>
<h3>Procedural sequence</h3>
<ol>${s.sequence.map((q) => `<li${q.reached ? '' : ' class="dim"'}>${esc(q.title)}${q.reached ? '' : ' (not reached)'}</li>`).join('')}</ol>
<h3>Balloon inflations</h3>
<table><tr><th>Stage</th><th>Balloon</th><th>Diameter</th><th>Recorded pressure</th></tr>${s.balloons.map((b) => `<tr><td>${b.stage}</td><td>${esc(b.label)}</td><td>${b.diameter.toFixed(2)} mm</td><td>${b.pressure ?? '—'} atm</td></tr>`).join('') || '<tr><td colspan="4">None</td></tr>'}</table>
<h3>Numerical outputs</h3>
<table><tr><th>Output</th><th>Value</th><th>Basis</th><th>Method</th></tr>${s.metrics.map((m) => `<tr><td>${esc(m.label)}</td><td class="num">${esc(fmt(m.value, m.unit))}</td><td>${esc(m.basis)}</td><td><small>${esc(m.method)}</small></td></tr>`).join('')}</table>
${s.warnings.length ? `<h3>Warnings and data notes</h3><ul>${s.warnings.map((w) => `<li><b>${w.level === 'warning' ? 'Warning' : 'Note'}:</b> ${esc(w.message)}</li>`).join('')}</ul><p><small>Warnings are not a substitute for the manufacturer's instructions for use.</small></p>` : ''}`,
    )
    .join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Bifurcation Lab report</title>
<style>body{font-family:"IBM Plex Sans",system-ui,sans-serif;color:#13233f;max-width:900px;margin:24px auto;padding:0 16px;line-height:1.45}h1{font-size:22px;margin:0}h2{font-size:18px;margin-top:28px;border-bottom:1px solid #cdd6e0;padding-bottom:4px}h3{font-size:14px;margin:18px 0 6px}table{border-collapse:collapse;width:100%;font-size:12.5px}th,td{border:1px solid #d6dde5;padding:4px 6px;text-align:left;vertical-align:top}th{background:#eef2f6}.num{font-variant-numeric:tabular-nums;white-space:nowrap}.notice{border:1px solid #0e7c86;background:#e9f6f6;padding:10px 12px;font-size:13px}.dim{color:#8592a3}small{color:#56657a}img{max-width:100%;border:1px solid #d6dde5}@media print{body{margin:0}}</style></head><body>
<h1>${esc(r.application)}</h1>
<p>Version ${esc(r.version)} · geometry engine ${esc(r.geometryEngine)} · device registry ${esc(r.registryVersion)}<br>Simulation date: ${esc(r.generatedAt)}</p>
<p class="notice">${esc(r.notice)}</p>
<p><b>Validation status:</b> ${esc(r.validationStatus)}<br><b>Geometry mode:</b> ${esc(r.geometryMode)}</p>
${imageDataUrl ? `<h2>Final visualization</h2><img alt="3D view of the simulated bifurcation" src="${imageDataUrl}">` : ''}
<h2>Anatomy (shared by all scenarios)</h2>
<table>${ANAT_ROWS.map(([k, l, u]) => `<tr><td>${l}</td><td class="num">${esc(r.anatomy[k])} ${u}</td></tr>`).join('')}</table>
${scen}
<h2>Data quality labels</h2>
<p>VERIFIED MANUFACTURER SPECIFICATION · PUBLISHED BENCH MEASUREMENT · DERIVED FROM VERIFIED DATA · ILLUSTRATIVE ASSUMPTION · DATA UNAVAILABLE. Simulator outputs are labelled as an anatomical calculation, a geometric calculation from inputs, an illustrative geometric estimate, or not calculable from available data.</p>
<h2>Limitations</h2><ul>${r.limitations.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
<h2>References</h2><ol>${r.references.map((s) => `<li>${esc(s.title)} — ${esc(s.publisher)}${s.revision ? `, ${esc(s.revision)}` : ''}. <a href="${esc(s.url)}">${esc(s.url)}</a> (accessed ${esc(s.accessed)})</li>`).join('')}</ol>
<p class="notice">${esc(r.notice)}</p>
</body></html>`;
}

export function reportMarkdown(r: ReportData): string {
  const L: string[] = [];
  L.push(`# ${r.application}`, '', `Version ${r.version} · registry ${r.registryVersion} · ${r.generatedAt}`, '', `> ${r.notice}`, '', `**Validation status:** ${r.validationStatus}`, '');
  L.push('## Anatomy', ...ANAT_ROWS.map(([k, l, u]) => `- ${l}: ${r.anatomy[k]} ${u}`), '');
  for (const s of r.scenarios) {
    L.push(`## ${s.name} — ${s.technique}`, '');
    for (const st of s.stents) L.push(`- ${st.role}: ${st.model} ${st.diameter} × ${st.length} mm; strut ${st.strutThickness} (${st.strutEvidence}); max expansion ${st.maxExpansion}`);
    L.push('', '### Sequence', ...s.sequence.map((q) => `${q.stage}. ${q.title}${q.reached ? '' : ' (not reached)'}`), '', '### Outputs');
    for (const m of s.metrics) L.push(`- ${m.label}: ${fmt(m.value, m.unit)} — ${m.basis}. Method: ${m.method}`);
    if (s.warnings.length) L.push('', '### Warnings', ...s.warnings.map((w) => `- ${w.message}`));
    L.push('');
  }
  L.push('## Limitations', ...r.limitations.map((l) => `- ${l}`), '', '## References', ...r.references.map((s, i) => `${i + 1}. ${s.title} — ${s.url}`), '', `> ${r.notice}`);
  return L.join('\n');
}

export function metricsCSV(r: ReportData): string {
  const q = (s: unknown) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const rows = [['scenario', 'technique', 'metric_id', 'label', 'value', 'unit', 'basis', 'method'].join(',')];
  for (const s of r.scenarios) for (const m of s.metrics) rows.push([q(s.name), q(s.technique), q(m.id), q(m.label), m.value == null ? '' : m.value.toFixed(4), q(m.unit), q(m.basis), q(m.method)].join(','));
  return rows.join('\n');
}
