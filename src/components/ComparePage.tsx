import { useMemo, useState } from 'react';
import type { Anatomy } from '../engine/anatomy';
import type { BifurcationModel } from '../engine/bifurcationGeometry';
import type { LoadedRegistry } from '../data/registry';
import { lookupSized, deviceLabel } from '../data/registry';
import { TECHNIQUES, withTechnique, type Scenario, type Technique } from '../engine/scenario';
import { simulate, type SimResult } from '../engine/simulation';
import { computeMetrics, type Metric } from '../engine/measurementEngine';
import { fmt } from '../engine/report';
import { Viewer3D } from './Viewer3D';
import type { DisplaySettings } from './display';
import { AnatomyFields } from './AnatomyPanels';
import { StentChooser } from './ProcedurePanels';
import { EvidenceChip, Panel } from './ui';

export interface CompareItem {
  scenario: Scenario;
  sim: SimResult;
  metrics: Metric[];
}

export function useCompareItems(model: BifurcationModel, scenarios: Scenario[], reg: LoadedRegistry, finalStage: boolean): CompareItem[] {
  return useMemo(
    () =>
      scenarios.map((scenario) => {
        const sim = simulate(model, scenario, reg, finalStage ? 999 : undefined);
        return { scenario, sim, metrics: computeMetrics(model, scenario, sim) };
      }),
    [model, scenarios, reg, finalStage],
  );
}

export function ComparePage(props: {
  anatomy: Anatomy;
  setAnatomy: (a: Anatomy) => void;
  model: BifurcationModel;
  scenarios: Scenario[];
  setScenarios: (s: Scenario[]) => void;
  reg: LoadedRegistry;
  display: DisplaySettings;
  teaching: boolean;
  research: boolean;
  onAdd: () => void;
}) {
  const { model, scenarios, setScenarios, reg, display } = props;
  const [finalStage, setFinalStage] = useState(true);
  const items = useCompareItems(model, scenarios, reg, finalStage);
  const update = (i: number, s: Scenario) => setScenarios(scenarios.map((x, k) => (k === i ? s : x)));
  const remove = (i: number) => setScenarios(scenarios.filter((_, k) => k !== i));
  const metricIds = items[0]?.metrics.map((m) => m.id) ?? [];
  const metricOf = (it: CompareItem, id: string) => it.metrics.find((m) => m.id === id);
  const base = items[0];

  return (
    <div className="col">
      <details className="panel" style={{ padding: '8px 14px' }}>
        <summary>Shared anatomy — identical for every scenario ({props.anatomy.dPMV}/{props.anatomy.dDMV}/{props.anatomy.dSB} mm, {props.anatomy.angleDeg}°). Edit here to change all scenarios together.</summary>
        <div style={{ marginTop: 10 }}>
          <AnatomyFields anatomy={props.anatomy} onChange={props.setAnatomy} idPrefix="cmp-an" />
        </div>
      </details>
      <div className="btn-row" style={{ alignItems: 'center' }}>
        <button className="btn primary" onClick={props.onAdd} disabled={scenarios.length >= 4}>
          Add scenario
        </button>
        <label className="check">
          <input type="checkbox" checked={finalStage} onChange={(e) => setFinalStage(e.target.checked)} /> Compare final geometry (otherwise each scenario's current stage)
        </label>
        <span className="muted">Up to four scenarios. No overall winner or ranking is produced.</span>
      </div>
      <div className="compare-grid">
        {items.map((it, i) => {
          const sc = it.scenario;
          const tech = TECHNIQUES.find((t) => t.id === sc.technique)!;
          return (
            <section className="panel" key={sc.id} aria-label={sc.name}>
              <header>
                <input className="plain" style={{ maxWidth: 200, fontWeight: 600 }} value={sc.name} aria-label="Scenario name" onChange={(e) => update(i, { ...sc, name: e.target.value })} />
                <button className="btn" onClick={() => remove(i)} disabled={scenarios.length <= 1}>
                  Remove
                </button>
              </header>
              <div className="stage-panel" style={{ borderRadius: 0 }}>
                <Viewer3D model={model} sim={it.sim} metrics={it.metrics} display={display} preset="overview" presetNonce={0} compact />
              </div>
              <div className="body">
                <div className="muted">
                  Stage {it.sim.stageIndex + 1}/{it.sim.stages.length}: {it.sim.stages[it.sim.stageIndex].title}
                </div>
                <div className="field wide">
                  <label htmlFor={`c-tech-${sc.id}`}>Technique</label>
                  <select
                    id={`c-tech-${sc.id}`}
                    className="plain"
                    value={sc.technique}
                    onChange={(e) => {
                      const t = e.target.value as Technique;
                      update(i, withTechnique(sc, t, props.anatomy, reg));
                    }}
                  >
                    {TECHNIQUES.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <StentChooser title={sc.technique === 'culotte' ? 'Second stent' : 'Main-vessel stent'} choice={sc.mvStent} reg={reg} onChange={(c) => update(i, { ...sc, mvStent: c })} idPrefix={`c-mv-${sc.id}`} research={false} />
                {tech.twoStent && <StentChooser title={sc.technique === 'culotte' ? 'First stent' : 'Side-branch stent'} choice={sc.sbStent} reg={reg} onChange={(c) => update(i, { ...sc, sbStent: c })} idPrefix={`c-sb-${sc.id}`} research={false} />}
                <div className="field">
                  <label htmlFor={`c-pot-${sc.id}`}>POT balloon</label>
                  <div className="input-unit">
                    <input id={`c-pot-${sc.id}`} type="number" step={0.25} min={2} max={6.5} value={sc.proc.potD} onChange={(e) => Number(e.target.value) > 0 && update(i, { ...sc, proc: { ...sc.proc, potD: Number(e.target.value) } })} />
                    <span className="unit">mm</span>
                  </div>
                </div>
                <div className="field">
                  <label htmlFor={`c-sbb-${sc.id}`}>SB balloon</label>
                  <div className="input-unit">
                    <input id={`c-sbb-${sc.id}`} type="number" step={0.25} min={1} max={5} value={sc.proc.sbBalloonD} onChange={(e) => Number(e.target.value) > 0 && update(i, { ...sc, proc: { ...sc.proc, sbBalloonD: Number(e.target.value) } })} />
                    <span className="unit">mm</span>
                  </div>
                </div>
              </div>
            </section>
          );
        })}
      </div>
      <Panel title="Comparison table" sub={`Differences are relative to ${base?.scenario.name ?? 'the first scenario'}`}>
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th>Item</th>
                {items.map((it, i) => (
                  <th key={it.scenario.id}>{it.scenario.name}{i > 0 ? ' (Δ vs first)' : ''}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Technique and sequence</td>
                {items.map((it) => (
                  <td key={it.scenario.id}>
                    {TECHNIQUES.find((t) => t.id === it.scenario.technique)!.label}
                    <div className="basis">{it.sim.stages.slice(0, it.sim.stageIndex + 1).map((s) => s.title).join(' → ')}</div>
                  </td>
                ))}
              </tr>
              <tr>
                <td>Stents</td>
                {items.map((it) => (
                  <td key={it.scenario.id}>
                    {it.sim.stents.map((s) => (
                      <div key={s.key}>
                        {s.label}: {deviceLabel(s.device)} {s.choice.diameter} × {s.choice.length} mm
                      </div>
                    ))}
                  </td>
                ))}
              </tr>
              <tr>
                <td>Strut thickness evidence</td>
                {items.map((it) => (
                  <td key={it.scenario.id}>
                    {it.sim.stents.map((s) => (
                      <div key={s.key}>
                        {s.thickness.micrometres} µm <EvidenceChip status={s.thickness.status} />
                      </div>
                    ))}
                  </td>
                ))}
              </tr>
              <tr>
                <td>Documented expansion limit</td>
                {items.map((it) => (
                  <td key={it.scenario.id}>
                    {it.sim.stents.map((s) => {
                      const l = lookupSized(s.device.maxExpansionDiameter, s.choice.diameter);
                      return (
                        <div key={s.key}>
                          {l.value != null ? `${l.value} mm` : 'Data unavailable'} <EvidenceChip status={l.status} />
                        </div>
                      );
                    })}
                  </td>
                ))}
              </tr>
              <tr>
                <td>Measured mechanical data (radial strength, recoil, SB cell opening)</td>
                {items.map((it) => (
                  <td key={it.scenario.id} className="nc">
                    {it.sim.stents.every((s) => s.device.radialStrength.value == null && s.device.recoil.value == null && s.device.sideBranchCellOpening.value == null) ? 'Not calculable from available data' : 'See registry'}
                  </td>
                ))}
              </tr>
              {metricIds.map((id) => {
                const m0 = base && metricOf(base, id);
                if (!m0) return null;
                return (
                  <tr key={id}>
                    <td>
                      {m0.label}
                      <div className="basis">{m0.basis}</div>
                    </td>
                    {items.map((it, i) => {
                      const m = metricOf(it, id);
                      const v = m?.value ?? null;
                      const b = m0.value;
                      const delta = i > 0 && v != null && b != null ? v - b : null;
                      return (
                        <td key={it.scenario.id} className={`num${v == null ? ' nc' : ''}`}>
                          {m ? fmt(v, m.unit) : 'Not calculable from available data'}
                          {delta != null && <div className="basis">Δ {delta >= 0 ? '+' : ''}{delta.toFixed(m!.unit === 'count' ? 0 : 2)}</div>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              <tr>
                <td>Warnings</td>
                {items.map((it) => (
                  <td key={it.scenario.id}>
                    {it.sim.warnings.filter((w) => w.level === 'warning').map((w, k) => (
                      <div key={k} className="warning-item" style={{ marginBottom: 4 }}>
                        {w.message}
                      </div>
                    ))}
                    {it.sim.warnings.every((w) => w.level !== 'warning') && <span className="muted">None</span>}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <div className="note">
          Differences between commercial platforms here arise only from documented strut thickness, documented connector count and the selected sizes, applied to a generic illustrative mesh. They are not evidence that one stent expands better, opens a larger side-branch cell or causes less malapposition than another.
        </div>
      </Panel>
    </div>
  );
}
