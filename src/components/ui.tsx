import { useEffect, useState, type ReactNode } from 'react';
import type { EvidenceStatus } from '../data/evidence';
import { EVIDENCE_SHORT } from '../data/evidence';

const EV_CLASS: Record<EvidenceStatus, string> = {
  'VERIFIED MANUFACTURER SPECIFICATION': 'ev-verified',
  'PUBLISHED BENCH MEASUREMENT': 'ev-bench',
  'DERIVED FROM VERIFIED DATA': 'ev-derived',
  'ILLUSTRATIVE ASSUMPTION': 'ev-illustrative',
  'DATA UNAVAILABLE': 'ev-unavailable',
};

export function EvidenceChip({ status, long = false }: { status: EvidenceStatus; long?: boolean }) {
  return (
    <span className={`ev ${EV_CLASS[status]}`} title={status}>
      {long ? status : EVIDENCE_SHORT[status]}
    </span>
  );
}

export function Panel({ title, sub, children, actions }: { title: string; sub?: ReactNode; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="panel" aria-label={title}>
      <header>
        <h2>{title}</h2>
        {sub && <span className="sub">{sub}</span>}
        {actions}
      </header>
      <div className="body">{children}</div>
    </section>
  );
}

export interface NumberFieldProps {
  id: string;
  label: ReactNode;
  unit: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  allowZero?: boolean;
  help?: string;
  validate?: (v: number) => string | null;
  onCommit: (v: number) => void;
}

/** Numeric input that only commits valid values and explains why a value is rejected. */
export function NumberField({ id, label, unit, value, min, max, step = 0.05, allowZero = false, help, validate, onCommit }: NumberFieldProps) {
  const [text, setText] = useState(String(value));
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (Number(text) !== value) setText(String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const check = (raw: string): string | null => {
    if (raw.trim() === '') return 'Enter a value.';
    const v = Number(raw);
    if (!Number.isFinite(v)) return 'Enter a number.';
    if (v < 0) return 'Negative values are not allowed.';
    if (v === 0 && !allowZero) return 'Must be greater than 0.';
    if (min != null && v < min) return `Minimum ${min} ${unit}.`;
    if (max != null && v > max) return `Maximum ${max} ${unit}.`;
    return validate ? validate(v) : null;
  };
  return (
    <div className={`field${err ? ' invalid' : ''}`}>
      <label htmlFor={id} title={help}>
        {label}
      </label>
      <div className="input-unit">
        <input
          id={id}
          inputMode="decimal"
          type="number"
          step={step}
          value={text}
          aria-invalid={!!err}
          aria-describedby={err ? `${id}-err` : undefined}
          onChange={(e) => {
            setText(e.target.value);
            const e2 = check(e.target.value);
            setErr(e2);
            if (!e2) onCommit(Number(e.target.value));
          }}
        />
        <span className="unit">{unit}</span>
      </div>
      {err && (
        <div className="err" id={`${id}-err`} role="alert">
          {err}
        </div>
      )}
    </div>
  );
}

export const GLOSSARY: Record<string, string> = {
  POT: 'Proximal optimization technique: inflation of a short balloon sized to the proximal main vessel, with its distal end just proximal to the carina, to expand the proximal stent segment.',
  carina: 'The flow divider where the distal main vessel and side branch separate.',
  ostium: 'The origin (opening) of the side branch from the main vessel.',
  'cell opening': 'Dilating the stent cell that faces the side-branch ostium so the side branch is less covered by struts.',
  kissing: 'Simultaneous inflation of balloons in the main vessel and side branch.',
  jailing: 'Stent struts lying across the side-branch ostium after main-vessel stenting.',
  protrusion: 'Length of the side-branch stent that extends into the main vessel.',
  'Huo–Kassab': 'A published scaling relationship between parent and daughter vessel diameters: D_PMV^(7/3) = D_DMV^(7/3) + D_SB^(7/3).',
};

export function Term({ k, children, teaching }: { k: keyof typeof GLOSSARY | string; children: ReactNode; teaching: boolean }) {
  if (!teaching) return <>{children}</>;
  return (
    <abbr className="term" title={GLOSSARY[k] ?? ''} tabIndex={0}>
      {children}
    </abbr>
  );
}

export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 2600);
    return () => clearTimeout(t);
  }, [msg]);
  return { msg, show: setMsg, node: msg ? <div className="toast" role="status">{msg}</div> : null };
}

type DownloadsNs = { save: (r: { filename: string; data: string }) => Promise<unknown> } | null;
let downloadsNs: Promise<DownloadsNs> | null = null;
function hostDownloads(): Promise<DownloadsNs> {
  const c = (window as unknown as { claude?: { use?: (n: string) => Promise<unknown> } }).claude;
  if (!c?.use) return Promise.resolve(null);
  downloadsNs ??= c.use('downloads').then((x) => (x as DownloadsNs) ?? null, () => null);
  return downloadsNs;
}

/** Saves a text file: through the host's download capability when embedded, else a normal browser download. */
export async function downloadText(filename: string, text: string, mime = 'text/plain'): Promise<boolean> {
  const host = await hostDownloads();
  if (host) {
    try {
      await host.save({ filename, data: text });
      return true;
    } catch {
      return false;
    }
  }
  try {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return true;
  } catch {
    return false;
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export const storage = {
  get<T>(key: string, fallback: T): T {
    try {
      const v = localStorage.getItem(key);
      return v ? (JSON.parse(v) as T) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
};

/** Collapsible section used to keep the rails short. */
export function Section({ title, children, open = false, meta }: { title: ReactNode; children: ReactNode; open?: boolean; meta?: ReactNode }) {
  return (
    <details className="section" open={open}>
      <summary>
        <span className="section-title">{title}</span>
        {meta && <span className="section-meta">{meta}</span>}
      </summary>
      <div className="section-body">{children}</div>
    </details>
  );
}
