import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EXAMPLE_ANATOMY, validateAnatomy, type Anatomy } from './engine/anatomy';
import { buildBifurcation } from './engine/bifurcationGeometry';
import { BUILTIN_REGISTRY, loadRegistry } from './data/registry';
import type { DeviceRecord, Source } from './data/deviceSchema';
import { defaultScenario, ensureCoverage, serializeScenarios, type Scenario, type SimulationMode, type SavedScenarioFile } from './engine/scenario';
import { simulate } from './engine/simulation';
import { computeMetrics } from './engine/measurementEngine';
import { buildReportData } from './engine/report';
import { APP_VERSION } from './version';
import { Viewer3D } from './components/Viewer3D';
import { CrossSection } from './components/CrossSection';
import { DEFAULT_DISPLAY, type DisplaySettings, type ViewPreset } from './components/display';
import { AnatomyFields, HuoKassabSection } from './components/AnatomyPanels';
import { SetupRail, Timeline, ResultsRail, MechanicalPanel } from './components/ProcedurePanels';
import { ComparePage, useCompareItems } from './components/ComparePage';
import { RegistryPage } from './components/RegistryPage';
import { ReportPage } from './components/ReportPage';
import { ScenarioManager } from './components/ScenarioManager';
import { SizingPage } from './components/SizingPage';
import type { SizingRule } from './engine/sizing';
import { lengthOptions } from './data/registry';
import { storage, useToast, GLOSSARY, Section } from './components/ui';

type Tab = 'sizing' | 'simulator' | 'compare' | 'registry' | 'report';
const LOCAL_DEV_KEY = 'bifurcation-lab.local-devices.v1';
const PREFS_KEY = 'bifurcation-lab.prefs.v1';

let idCounter = 0;
const newId = () => `s${Date.now().toString(36)}${idCounter++}`;

export default function App() {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>(() => {
    const h = typeof location !== 'undefined' ? location.hash.replace('#', '') : '';
    return (['sizing', 'simulator', 'compare', 'registry', 'report'] as Tab[]).includes(h as Tab) ? (h as Tab) : 'sizing';
  });
  const [mode, setMode] = useState<SimulationMode>(() => storage.get(PREFS_KEY, { mode: 'teaching' as SimulationMode }).mode);
  const [local, setLocal] = useState<{ devices: DeviceRecord[]; sources: Source[] }>(() => storage.get(LOCAL_DEV_KEY, { devices: [], sources: [] }));
  const reg = useMemo(() => loadRegistry(BUILTIN_REGISTRY, local.devices, local.sources), [local]);
  const [anatomy, setAnatomyRaw] = useState<Anatomy>(EXAMPLE_ANATOMY);
  const setAnatomy = (a: Anatomy) => {
    if (!validateAnatomy(a).valid) return;
    setAnatomyRaw(a);
    setScenarios((all) => all.map((sc) => ensureCoverage(sc, a, reg)));
  };
  const model = useMemo(() => buildBifurcation(anatomy), [anatomy]);
  const [scenarios, setScenarios] = useState<Scenario[]>(() => [
    defaultScenario(newId(), 'Scenario A', EXAMPLE_ANATOMY, reg, 'provisional', 'abbott-xience-skypoint'),
    defaultScenario(newId(), 'Scenario B', EXAMPLE_ANATOMY, reg, 'provisional', 'biotronik-orsiro-mission'),
  ]);
  const [activeId, setActiveId] = useState(scenarios[0].id);
  const active = scenarios.find((s) => s.id === activeId) ?? scenarios[0];
  const setActive = useCallback((s: Scenario) => setScenarios((all) => all.map((x) => (x.id === s.id ? s : x))), []);
  const [display, setDisplay] = useState<DisplaySettings>(DEFAULT_DISPLAY);
  const [view, setView] = useState<'3d' | 'section'>('3d');
  const [preset, setPreset] = useState<ViewPreset>('overview');
  const [presetNonce, setPresetNonce] = useState(0);
  const capture = useRef<(() => string | null) | null>(null);
  const [image, setImage] = useState<string | null>(null);

  useEffect(() => {
    storage.set(PREFS_KEY, { mode });
  }, [mode]);

  // Close toolbar dropdowns when clicking elsewhere
  useEffect(() => {
    const close = (e: MouseEvent) =>
      document.querySelectorAll<HTMLDetailsElement>('details.menu[open]').forEach((d) => {
        if (!d.contains(e.target as Node)) d.open = false;
      });
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  const sim = useMemo(() => simulate(model, active, reg), [model, active, reg]);
  const prevSim = useMemo(() => (sim.stageIndex > 0 ? simulate(model, active, reg, sim.stageIndex - 1) : sim), [model, active, reg, sim]);
  const [replay, setReplay] = useState(0);
  const [rightTab, setRightTab] = useState<'setup' | 'results'>('setup');
  const metrics = useMemo(() => computeMetrics(model, active, sim), [model, active, sim]);
  const compareItems = useCompareItems(model, scenarios, reg, true);
  const onStage = useCallback((i: number) => setActive({ ...active, stageIndex: Math.max(0, Math.min(sim.stages.length - 1, i)) }), [active, sim.stages.length, setActive]);

  const goTab = (t: Tab) => {
    if (tab === 'simulator' && view === '3d' && capture.current) {
      const img = capture.current();
      if (img) setImage(img);
    }
    setTab(t);
  };

  const buildReport = useCallback(
    (all: boolean) => buildReportData(anatomy, all ? compareItems : [{ scenario: active, sim, metrics }], reg),
    [anatomy, compareItems, active, sim, metrics, reg],
  );

  const loadFile = (f: SavedScenarioFile) => {
    if (!validateAnatomy(f.anatomy).valid) return toast.show('The file contains invalid anatomy values.');
    setAnatomyRaw(f.anatomy);
    setScenarios(f.scenarios);
    setActiveId(f.scenarios[0].id);
    setMode(f.simulationMode ?? 'teaching');
  };

  const [sizing, setSizing] = useState<{ dDMV: number; dSB: number; rule: SizingRule }>({ dDMV: EXAMPLE_ANATOMY.dDMV, dSB: EXAMPLE_ANATOMY.dSB, rule: 'huo-kassab' });
  const simulateWith = (dev: DeviceRecord, diameter: number, dPMV: number) => {
    const a: Anatomy = { ...anatomy, dDMV: sizing.dDMV, dSB: sizing.dSB, dPMV };
    if (!validateAnatomy(a).valid) return toast.show('These diameters cannot be simulated. Check the values.');
    setAnatomyRaw(a);
    setScenarios((all) =>
      all.map((sc) => {
        const isActive = sc.id === active.id;
        const next = { ...defaultScenario(sc.id, sc.name, a, reg, sc.technique, isActive ? dev.id : sc.mvStent.deviceId), stageIndex: 0 };
        if (isActive && next.mvStent.diameter !== diameter) {
          const ls = lengthOptions(dev, diameter).values;
          const length = ls.includes(next.mvStent.length) ? next.mvStent.length : ls.find((l) => l >= next.mvStent.length) ?? ls[ls.length - 1];
          next.mvStent = { deviceId: dev.id, diameter, length };
        }
        return next;
      }),
    );
    setTab('simulator');
    toast.show(`${dev.model} ${diameter.toFixed(2)} mm loaded into ${active.name}.`);
  };

  const addScenario = () => {
    const s = { ...defaultScenario(newId(), `Scenario ${String.fromCharCode(65 + scenarios.length)}`, anatomy, reg, active.technique, active.mvStent.deviceId) };
    setScenarios([...scenarios, s]);
  };

  const teaching = mode === 'teaching';
  const research = mode === 'research';
  const tgl = (k: keyof DisplaySettings, label: string) => (
    <label className="tgl">
      <input type="checkbox" checked={display[k] as boolean} onChange={(e) => setDisplay({ ...display, [k]: e.target.checked })} /> {label}
    </label>
  );
  const warnCount = sim.warnings.filter((w) => w.level === 'warning').length;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <b>Bifurcation Lab</b>
          <span>Coronary Stent Simulator · v{APP_VERSION}</span>
        </div>
        <nav className="tabs" role="tablist" aria-label="Sections">
          {(
            [
              ['sizing', '1 · Sizing'],
              ['simulator', '2 · Techniques'],
              ['compare', 'Compare'],
              ['registry', 'Device registry'],
              ['report', 'Report'],
            ] as [Tab, string][]
          ).map(([t, l]) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => goTab(t)}>
              {l}
            </button>
          ))}
        </nav>
        <div className="spacer" />
        <div className="segmented" role="group" aria-label="Visualization mode">
          {(
            [
              ['teaching', 'Teaching'],
              ['research', 'Research comparison'],
              ['mechanical', 'Mechanical simulation'],
            ] as [SimulationMode, string][]
          ).map(([m, l]) => (
            <button key={m} aria-pressed={mode === m} onClick={() => setMode(m)}>
              {l}
            </button>
          ))}
        </div>
        <span className="validation-chip" title="Illustrative geometry. No output in this build is a validated mechanical prediction.">
          Not mechanically validated
        </span>
      </header>

      <main className="page">
        {tab === 'sizing' && <SizingPage reg={reg} dDMV={sizing.dDMV} dSB={sizing.dSB} rule={sizing.rule} onChange={setSizing} onSimulate={simulateWith} />}
        {tab === 'simulator' && (
          <div className="sim-grid">
            <aside className="rail" aria-label="Anatomy">
              <div className="rail-head">
                <h2>Anatomy</h2>
                <span className="muted">shared by all scenarios</span>
              </div>
              <AnatomyFields anatomy={anatomy} onChange={setAnatomy} />
              <HuoKassabSection anatomy={anatomy} />
              <Section title="Save and load" meta={active.name}>
                <ScenarioManager
                  anatomy={anatomy}
                  scenarios={scenarios}
                  active={active}
                  registryVersion={reg.registryVersion}
                  mode={mode}
                  onRename={(name) => setActive({ ...active, name })}
                  onLoad={loadFile}
                  notify={toast.show}
                />
              </Section>
              {teaching && (
                <Section title="Glossary">
                  <dl className="kv">
                    {Object.entries(GLOSSARY).map(([k, v]) => (
                      <div key={k} style={{ display: 'contents' }}>
                        <dt>{k}</dt>
                        <dd>{v}</dd>
                      </div>
                    ))}
                  </dl>
                </Section>
              )}
            </aside>
            <div className="col col-center">
              <section className="stage-panel" aria-label="Visualization">
                <div className="stage-toolbar">
                  <span role="group" aria-label="Scenario" className="seg-dark">
                    {scenarios.map((s) => (
                      <button key={s.id} className="sbtn" aria-pressed={s.id === active.id} onClick={() => setActiveId(s.id)}>
                        {s.name}
                      </button>
                    ))}
                  </span>
                  <span role="group" aria-label="View type" className="seg-dark">
                    <button className="sbtn" aria-pressed={view === '3d'} onClick={() => setView('3d')}>
                      3D
                    </button>
                    <button
                      className="sbtn"
                      aria-pressed={view === 'section'}
                      onClick={() => {
                        if (capture.current) setImage(capture.current());
                        setView('section');
                      }}
                    >
                      Slice
                    </button>
                  </span>
                  {view === '3d' && (
                    <select
                      value={preset}
                      onChange={(e) => {
                        setPreset(e.target.value as ViewPreset);
                        setPresetNonce((n) => n + 1);
                      }}
                      aria-label="Camera view"
                    >
                      <option value="overview">Overview</option>
                      <option value="proximal">Proximal MV</option>
                      <option value="distal">Distal MV</option>
                      <option value="sb">Side branch</option>
                      <option value="carina">Carina</option>
                      <option value="ostium">SB ostium (en face)</option>
                    </select>
                  )}
                  <div className="spacer" />
                  {view === '3d' && (
                    <button className="sbtn" onClick={() => setReplay((n) => n + 1)} title="Replay this stage's balloon inflation">
                      ↻ Replay
                    </button>
                  )}
                  <details className="menu">
                    <summary className="sbtn">Layers ▾</summary>
                    <div className="menu-pop right">
                      {tgl('showWall', 'Vessel wall')}
                      {tgl('showLumen', 'Lumen')}
                      {tgl('showPlaque', 'Plaque')}
                      {tgl('showStent', 'Stent')}
                      {tgl('showBalloons', 'Balloons')}
                      {tgl('showWires', 'Wires')}
                      {tgl('showMeasurements', 'Measurement labels')}
                    </div>
                  </details>
                  <details className="menu">
                    <summary className="sbtn">Display ▾</summary>
                    <div className="menu-pop right">
                      {(Object.keys(display.colors) as (keyof DisplaySettings['colors'])[]).map((k) => (
                        <label key={k} className="tgl" style={{ justifyContent: 'space-between' }}>
                          {k === 'stent2' ? 'Second stent' : k[0].toUpperCase() + k.slice(1)}
                          <input type="color" value={display.colors[k]} onChange={(e) => setDisplay({ ...display, colors: { ...display.colors, [k]: e.target.value } })} />
                        </label>
                      ))}
                      <label className="tgl" style={{ justifyContent: 'space-between' }}>
                        Strut size
                        <select value={display.strutScale} onChange={(e) => setDisplay({ ...display, strutScale: Number(e.target.value) })}>
                          <option value={1}>True scale</option>
                          <option value={2}>2× (visual only)</option>
                          <option value={3}>3× (visual only)</option>
                        </select>
                      </label>
                      <button className="sbtn" onClick={() => setPresetNonce((n) => n + 1)}>
                        Reset camera
                      </button>
                      <button className="sbtn" onClick={() => setDisplay(DEFAULT_DISPLAY)}>
                        Restore defaults
                      </button>
                    </div>
                  </details>
                </div>
                {view === '3d' ? (
                  <Viewer3D
                    model={model}
                    sim={sim}
                    prevSim={prevSim}
                    animToken={`${active.id}:${active.technique}:${sim.stageIndex}:${replay}`}
                    metrics={metrics}
                    display={display}
                    preset={preset}
                    presetNonce={presetNonce}
                    onCaptureReady={(c) => (capture.current = c)}
                  />
                ) : (
                  <CrossSection model={model} sim={sim} display={display} />
                )}
              </section>
              <Timeline sim={sim} onStage={onStage} teaching={teaching} />
              {mode === 'mechanical' && <MechanicalPanel />}
              <p className="foot-note">Conceptual teaching sequence with illustrative geometry. Not a procedural recommendation or a mechanical prediction.</p>
            </div>
            <aside className="rail" aria-label="Procedure and results">
              <div className="rail-tabs" role="tablist">
                <button role="tab" aria-selected={rightTab === 'setup'} onClick={() => setRightTab('setup')}>
                  Procedure
                </button>
                <button role="tab" aria-selected={rightTab === 'results'} onClick={() => setRightTab('results')}>
                  Results{warnCount > 0 && <span className="badge" aria-label={`${warnCount} warnings`}>{warnCount}</span>}
                </button>
              </div>
              {rightTab === 'setup' ? (
                <SetupRail sc={active} anatomy={anatomy} reg={reg} onChange={setActive} research={research} teaching={teaching} />
              ) : (
                <ResultsRail metrics={metrics} warnings={sim.warnings} reg={reg} research={research} />
              )}
            </aside>
          </div>
        )}
        {tab === 'compare' && (
          <ComparePage anatomy={anatomy} setAnatomy={setAnatomy} model={model} scenarios={scenarios} setScenarios={(s) => { setScenarios(s); if (!s.some((x) => x.id === activeId)) setActiveId(s[0].id); }} reg={reg} display={display} teaching={teaching} research={research} onAdd={addScenario} />
        )}
        {tab === 'registry' && (
          <RegistryPage
            reg={reg}
            localDevices={local.devices}
            localSources={local.sources}
            notify={toast.show}
            onSaveLocal={(devices, sources) => {
              const v = { devices, sources };
              setLocal(v);
              storage.set(LOCAL_DEV_KEY, v);
            }}
          />
        )}
        {tab === 'report' && (
          <ReportPage
            build={buildReport}
            image={image}
            scenarioJSON={JSON.stringify(serializeScenarios(anatomy, scenarios, reg.registryVersion, mode), null, 2)}
            notify={toast.show}
            notFinal={sim.stageIndex < sim.stages.length - 1}
          />
        )}
      </main>
      {toast.node}
    </div>
  );
}
