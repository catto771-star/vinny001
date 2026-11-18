import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

export function PageHeader({ title, subtitle, tabs, tab, onTab, action }: {
  title: string;
  subtitle?: string;
  tabs?: readonly string[];
  tab?: string;
  onTab?: (t: string) => void;
  action?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end gap-x-6 gap-y-4">
      <div className="mr-auto min-w-0">
        <h1 className="text-[28px] leading-8 font-medium tracking-[-0.01em]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-fg3">{subtitle}</p>}
      </div>
      {tabs && (
        <div className="segmented" role="tablist">
          {tabs.map((t) => (
            <button key={t} role="tab" aria-selected={t === tab} className={t === tab ? 'tab-active' : 'tab'} onClick={() => onTab?.(t)}>{t}</button>
          ))}
        </div>
      )}
      {action}
    </header>
  );
}

/** A figure set like a scoreboard: mono digits, the unit small and quiet. */
export function Figure({ value, unit, className = '' }: { value: ReactNode; unit?: string; className?: string }) {
  return (
    <span className={`figure whitespace-nowrap ${className}`}>
      {value}
      {unit && <span className="ml-1 text-[0.55em] font-normal text-fg3">{unit}</span>}
    </span>
  );
}

export function Stat({ label, value, unit, hint, loading, accent }: {
  label: string; value: ReactNode; unit?: string; hint?: ReactNode; loading?: boolean; accent?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="label">{label}</div>
      {loading ? <Skeleton className="mt-2 h-8 w-20" /> : (
        <Figure value={value} unit={unit} className={`mt-1 block text-[28px] leading-8 font-medium ${accent ? 'text-brand-ink' : ''}`} />
      )}
      {hint && <div className="mt-1 text-[13px] leading-5 text-fg3">{hint}</div>}
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`rounded-md bg-raised ${className}`} aria-hidden />;
}

/** Placeholder rows while a list loads. */
export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="card space-y-3" aria-busy="true" aria-label="Carregando">
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-5 w-full" />)}
    </div>
  );
}

export function Empty({ icon, children, action }: { icon?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
      {icon && <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-raised text-fg3">{icon}</div>}
      <p className="max-w-sm text-sm text-fg2">{children}</p>
      {action}
    </div>
  );
}

/** A form panel: rises from the bottom on phones, centered on larger screens. */
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/50 sm:items-center sm:p-6" onClick={onClose}>
      <div
        className="enter max-h-[88vh] w-full overflow-y-auto rounded-t-[20px] border border-line bg-surface p-5 pb-8 sm:max-w-md sm:rounded-[20px] sm:pb-5"
        onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title} aria-modal="true"
      >
        <div className="mb-5 flex items-center gap-2">
          <h2 className="mr-auto text-lg leading-6 font-medium">{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar"><X size={18} strokeWidth={1.5} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="mb-4 block">
      <span className="mb-1.5 block text-[13px] leading-5 text-fg2">{label}</span>
      {children}
    </label>
  );
}

/** A labelled group of buttons. A <label> would hand its text to the first button and click it. */
export function FieldGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-4" role="group" aria-label={label}>
      <span className="mb-1.5 block text-[13px] leading-5 text-fg2">{label}</span>
      {children}
    </div>
  );
}

export const WEEKDAY_LETTERS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const WEEKDAY_NAMES = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

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
            className={`h-9 w-9 rounded-lg text-sm transition-colors duration-150 ${on ? 'bg-primary text-primary-ink' : 'border border-line bg-raised text-fg2 hover:text-fg'}`}
            aria-pressed={on}
            aria-label={WEEKDAY_NAMES[i]}
          >
            {l}
          </button>
        );
      })}
    </div>
  );
}
