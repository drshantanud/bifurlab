import { useMemo, useRef, useState } from 'react';
import type { ReportData } from '../engine/report';
import { reportHTML, reportMarkdown, metricsCSV } from '../engine/report';
import { Panel, copyText, downloadText } from './ui';

export function ReportPage({ build, image, scenarioJSON, notify, notFinal }: { build: (all: boolean) => ReportData; image: string | null; scenarioJSON: string; notify: (m: string) => void; notFinal: boolean }) {
  const [all, setAll] = useState(false);
  const data = useMemo(() => build(all), [build, all]);
  const html = useMemo(() => reportHTML(data, image), [data, image]);
  const frame = useRef<HTMLIFrameElement>(null);
  const stamp = data.generatedAt.slice(0, 10);
  return (
    <div className="col">
      <Panel title="Educational report" sub={`${data.application} · ${data.version}`}>
        <div className="btn-row" style={{ alignItems: 'center' }}>
          <label className="check">
            <input type="radio" name="scope" checked={!all} onChange={() => setAll(false)} /> Active scenario
          </label>
          <label className="check">
            <input type="radio" name="scope" checked={all} onChange={() => setAll(true)} /> All comparison scenarios (final stage)
          </label>
        </div>
        {notFinal && !all && <div className="note warn">The active scenario is not at its final stage. The report shows the stage you selected; move the timeline to the last stage for the final geometry.</div>}
        {!image && <div className="note">Open the Simulator tab once to include a snapshot of the 3D view.</div>}
        <div className="btn-row">
          <button className="btn primary" onClick={async () => notify((await downloadText(`bifurcation-lab-report-${stamp}.html`, html, 'text/html')) ? 'Report saved.' : 'The download did not complete. Use Copy instead.')}>
            Download report (HTML)
          </button>
          <button
            className="btn"
            onClick={() => {
              try {
                frame.current?.contentWindow?.focus();
                frame.current?.contentWindow?.print();
              } catch {
                notify('Printing is blocked in this viewer. Download the HTML report and print it from your browser.');
              }
            }}
          >
            Print / save as PDF
          </button>
          <button className="btn" onClick={() => downloadText(`bifurcation-lab-scenario-${stamp}.json`, scenarioJSON, 'application/json')}>
            Download scenario summary (JSON)
          </button>
          <button className="btn" onClick={() => downloadText(`bifurcation-lab-metrics-${stamp}.csv`, metricsCSV(data), 'text/csv')}>
            Download outputs (CSV)
          </button>
          <button className="btn" onClick={async () => notify((await copyText(reportMarkdown(data))) ? 'Report copied as Markdown.' : 'Copy failed.')}>
            Copy report (Markdown)
          </button>
          <button className="btn" onClick={async () => notify((await copyText(scenarioJSON)) ? 'Scenario JSON copied.' : 'Copy failed.')}>
            Copy scenario JSON
          </button>
        </div>
        <div className="muted">If this page is embedded in a viewer that blocks downloads or printing, use the Copy buttons, or run the app from its own web address.</div>
      </Panel>
      <iframe ref={frame} className="report-frame" title="Report preview" srcDoc={html} />
    </div>
  );
}
