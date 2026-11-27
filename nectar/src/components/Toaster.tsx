import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Check } from 'lucide-react';
import { nextToast, onFeedback, toastDuration, type Toast } from '../lib/feedback';

/** "Salvo" after each save, and errors that used to be alerts. */
export function Toaster() {
  const [toast, setToast] = useState<Toast | null>(null);
  const [bump, setBump] = useState(0);
  const current = useRef<Toast | null>(null);
  const timer = useRef<number>(0);

  useEffect(() => onFeedback((ev) => {
    const next = nextToast(current.current, ev, Date.now());
    if (current.current && next.id === current.current.id) setBump((b) => b + 1);
    current.current = next;
    setToast(next);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { current.current = null; setToast(null); }, toastDuration(next.kind));
  }), []);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  if (!toast) return null;
  const error = toast.kind === 'error';
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(96px+env(safe-area-inset-bottom))] z-40 flex justify-center px-4 md:bottom-6" role="status" aria-live={error ? 'assertive' : 'polite'}>
      <div key={toast.id} className="toast">
        <div key={bump} className={`${bump ? 'toast-bump' : ''} flex max-w-md items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium shadow-[var(--float-shadow)] ${error ? 'bg-negative text-white' : 'bg-primary text-primary-ink'}`}>
          {error ? <AlertCircle size={16} strokeWidth={2} /> : <Check size={16} strokeWidth={2.5} />}
          <span>{toast.text}</span>
        </div>
      </div>
    </div>
  );
}
