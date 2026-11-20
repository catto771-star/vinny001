import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, CircleAlert, Info } from "lucide-react";

type Kind = "success" | "error" | "info";
type Item = { id: number; kind: Kind; message: string; leaving: boolean };
type Api = { success: (m: string) => void; error: (m: string) => void; info: (m: string) => void };

const ToastContext = createContext<Api | null>(null);
const VISIBLE_MS = 3200;
const LEAVE_MS = 220;

/** Confirmações de ação (salvo, lançado, confirmado) com entrada e saída animadas. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const seq = useRef(0);

  const push = useCallback((kind: Kind, message: string) => {
    const id = ++seq.current;
    setItems((list) => [...list.slice(-3), { id, kind, message, leaving: false }]);
    window.setTimeout(() => setItems((list) => list.map((t) => (t.id === id ? { ...t, leaving: true } : t))), VISIBLE_MS);
    window.setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), VISIBLE_MS + LEAVE_MS);
  }, []);

  const api = useMemo<Api>(
    () => ({ success: (m) => push("success", m), error: (m) => push("error", m), info: (m) => push("info", m) }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} role={t.kind === "error" ? "alert" : "status"} className={`toast toast-${t.kind}${t.leaving ? " is-leaving" : ""}`}>
            <span className="toast-icon">{t.kind === "success" ? <Check size={16} /> : t.kind === "error" ? <CircleAlert size={16} /> : <Info size={16} />}</span>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): Api {
  const ctx = useContext(ToastContext);
  // Fora do provedor (ex.: testes isolados) não quebra a tela.
  return ctx ?? { success: () => {}, error: () => {}, info: () => {} };
}
