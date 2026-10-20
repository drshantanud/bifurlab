import { useState } from 'react';
import type { Anatomy } from '../engine/anatomy';
import type { Scenario, SavedScenarioFile, SimulationMode } from '../engine/scenario';
import { serializeScenarios, parseScenarioFile } from '../engine/scenario';
import { storage } from './ui';

const KEY = 'bifurcation-lab.saved-scenarios.v1';

export function ScenarioManager(props: {
  anatomy: Anatomy;
  scenarios: Scenario[];
  active: Scenario;
  registryVersion: string;
  mode: SimulationMode;
  onRename: (name: string) => void;
  onLoad: (f: SavedScenarioFile) => void;
  notify: (m: string) => void;
}) {
  const [saved, setSaved] = useState<Record<string, SavedScenarioFile>>(() => storage.get(KEY, {}));
  const [pick, setPick] = useState('');
  const [importText, setImportText] = useState('');
  const persist = (s: Record<string, SavedScenarioFile>) => {
    setSaved(s);
    if (!storage.set(KEY, s)) props.notify('This browser blocked local storage; export the JSON instead.');
  };
  return (
    <>
      <div className="muted">Saved in this browser only.</div>
      <div className="field wide">
        <label htmlFor="sc-name">Scenario name</label>
        <input id="sc-name" className="plain" value={props.active.name} onChange={(e) => props.onRename(e.target.value)} />
      </div>
      <div className="muted">Do not enter patient-identifiable information. Scenarios store geometry, devices, technique, sequence, mode and version only.</div>
      <div className="btn-row">
        <button
          className="btn primary"
          onClick={() => {
            const name = props.active.name.trim() || 'Untitled scenario';
            persist({ ...saved, [name]: serializeScenarios(props.anatomy, props.scenarios, props.registryVersion, props.mode) });
            props.notify(`Saved "${name}".`);
          }}
        >
          Save
        </button>
      </div>
      {Object.keys(saved).length > 0 && (
        <div className="field wide">
          <label htmlFor="sc-load">Saved scenarios</label>
          <div className="btn-row">
            <select id="sc-load" className="plain" style={{ flex: 1, width: 'auto' }} value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">Choose…</option>
              {Object.keys(saved).map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            <button className="btn" disabled={!pick} onClick={() => pick && (props.onLoad(saved[pick]), props.notify(`Loaded "${pick}".`))}>
              Load
            </button>
            <button
              className="btn"
              disabled={!pick}
              onClick={() => {
                const s = { ...saved };
                delete s[pick];
                persist(s);
                setPick('');
              }}
            >
              Delete
            </button>
          </div>
        </div>
      )}
      <details>
        <summary>Import scenario JSON</summary>
        <textarea id="sc-import" className="plain" rows={4} value={importText} onChange={(e) => setImportText(e.target.value)} aria-label="Scenario JSON to import" />
        <div className="btn-row" style={{ marginTop: 6 }}>
          <button
            className="btn"
            onClick={() => {
              const r = parseScenarioFile(importText);
              if (r.ok) {
                props.onLoad(r.file);
                props.notify('Scenario imported.');
              } else props.notify(r.error);
            }}
          >
            Import
          </button>
          <label className="btn">
            Choose file…
            <input
              type="file"
              accept="application/json,.json"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) setImportText(await f.text());
              }}
            />
          </label>
        </div>
      </details>
    </>
  );
}
