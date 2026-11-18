import type { ReactNode } from 'react';

export function PageHeader({ title, subtitle, tabs, tab, onTab, action }: {
  title: string;
  subtitle?: string;
  tabs?: readonly string[];
  tab?: string;
  onTab?: (t: string) => void;
  action?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-center gap-4">
      <div className="mr-auto">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      </div>
      {tabs && (
        <div className="flex flex-wrap gap-1 rounded-full border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
          {tabs.map((t) => (
            <button key={t} className={t === tab ? 'tab-active' : 'tab'} onClick={() => onTab?.(t)}>{t}</button>
          ))}
        </div>
      )}
      {action}
    </header>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
      {hint && <div className="text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-slate-500">{children}</p>;
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-10 flex items-end justify-center bg-black/30 p-4 sm:items-center" onClick={onClose}>
      <div className="card w-full max-w-md" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="mb-4 flex items-center">
          <h2 className="mr-auto text-lg font-semibold">{title}</h2>
          <button className="btn-ghost" onClick={onClose} aria-label="Fechar">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-sm text-slate-600 dark:text-slate-300">{label}</span>
      {children}
    </label>
  );
}

export const WEEKDAY_LETTERS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

export function WeekdayPicker({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  return (
    <div className="flex gap-1">
      {WEEKDAY_LETTERS.map((l, i) => {
        const on = value.includes(i);
        return (
          <button
            type="button"
            key={i}
            onClick={() => onChange(on ? value.filter((d) => d !== i) : [...value, i].sort())}
            className={`h-8 w-8 rounded-full text-sm ${on ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}
            aria-pressed={on}
          >
            {l}
          </button>
        );
      })}
    </div>
  );
}
