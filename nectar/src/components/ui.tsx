import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
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
    <header className="mb-7 md:mb-9">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
        <div className="mr-auto min-w-0">
          <h1 className="display">{title}</h1>
          {subtitle && <p className="mt-2 text-[15px] text-fg2">{subtitle}</p>}
        </div>
        {action}
      </div>
      {tabs && (
        <div className="segmented tabs-scroll mt-6" role="tablist">
          {tabs.map((t) => (
            <button key={t} role="tab" aria-selected={t === tab} className={t === tab ? 'tab-active' : 'tab'} onClick={() => onTab?.(t)}>{t}</button>
          ))}
        </div>
      )}
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
        <Figure value={value} unit={unit} className={`mt-1.5 block text-[clamp(22px,6vw,32px)] leading-9 font-medium ${accent ? 'text-brand-ink' : ''}`} />
      )}
      {hint && <div className="mt-1 text-[13px] leading-5 text-fg3">{hint}</div>}
    </div>
  );
}

export function Skeleton({ className = '', style }: { className?: string; style?: CSSProperties }) {
  return <div className={`skeleton rounded-md ${className}`} style={style} aria-hidden />;
}

/** Placeholder rows while a list loads. */
export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="card space-y-4" aria-busy="true" aria-label="Carregando">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-5 w-5 shrink-0 rounded-[6px]" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3.5" style={{ width: `${[72, 54, 64, 46, 58][i % 5]}%` }} />
            <Skeleton className="h-2.5 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function Empty({ icon, children, action }: { icon?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
      {icon && <div className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-raised text-fg3">{icon}</div>}
      <p className="max-w-sm text-sm text-fg2">{children}</p>
      {action}
    </div>
  );
}

const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/**
 * A form panel: a sheet that rises from the bottom on phones, a card that
 * settles in the middle on larger screens. Closing by the backdrop, Esc or the
 * X plays the way out before the parent removes it.
 */
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const [closing, setClosing] = useState(false);
  const done = useRef(false);
  const close = useCallback(() => {
    if (done.current) return;
    done.current = true;
    if (prefersReducedMotion()) return onClose();
    setClosing(true);
    window.setTimeout(onClose, 200);
  }, [onClose]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; };
  }, [close]);
  // Rendered on <body>: an animated page around it must not decide where "the screen" is.
  return createPortal(
    <div
      className="modal-backdrop fixed inset-0 z-30 flex items-end justify-center bg-[rgb(12_12_13/0.38)] backdrop-blur-[2px] sm:items-center sm:p-6"
      data-closing={closing || undefined} onClick={close}
    >
      <div
        className="modal-panel max-h-[90vh] w-full overflow-y-auto rounded-t-[24px] bg-surface px-5 pt-3 pb-[calc(28px+env(safe-area-inset-bottom))] shadow-[var(--float-shadow)] sm:max-w-md sm:rounded-[24px] sm:p-6"
        data-closing={closing || undefined}
        onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title} aria-modal="true"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line-strong sm:hidden" aria-hidden />
        <div className="mb-5 flex items-center gap-2">
          <h2 className="mr-auto text-xl leading-7 font-semibold tracking-[-0.02em]">{title}</h2>
          <button className="icon-btn -mr-2" onClick={close} aria-label="Fechar"><X size={18} strokeWidth={1.75} /></button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
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
            className={`h-10 w-10 rounded-[10px] text-sm font-medium transition-[background-color,color,transform] duration-200 ease-out active:scale-[0.92] ${on ? 'bg-primary text-primary-ink' : 'bg-raised text-fg2 hover:text-fg'}`}
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
