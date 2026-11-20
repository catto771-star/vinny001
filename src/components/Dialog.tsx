import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";

const CLOSE_MS = 200;
const CloseContext = createContext<() => void>(() => {});

/** Modal que abre com escala/fade e fecha animado (docs/DESIGN.md). */
export function Dialog({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [closing, setClosing] = useState(false);
  const timer = useRef<number>();

  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
    return () => {
      window.clearTimeout(timer.current);
      el?.close();
    };
  }, []);

  const requestClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
    timer.current = window.setTimeout(onClose, CLOSE_MS);
  }, [closing, onClose]);

  return (
    <CloseContext.Provider value={requestClose}>
      <dialog
        ref={ref}
        className={`dialog${wide ? " dialog-wide" : ""}${closing ? " is-closing" : ""}`}
        onCancel={(e) => {
          e.preventDefault();
          requestClose();
        }}
        onClick={(e) => {
          if (e.target === ref.current) requestClose();
        }}
      >
        <header className="dialog-header">
          <h2>{title}</h2>
          <button type="button" className="icon-button" onClick={requestClose} aria-label="×">
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        <div className="dialog-body">{children}</div>
        {footer && <footer className="dialog-footer">{footer}</footer>}
      </dialog>
    </CloseContext.Provider>
  );
}

/** Botão "Cancelar" de um modal: fecha com a mesma animação. */
export function DialogCancel({ children }: { children: ReactNode }) {
  const close = useContext(CloseContext);
  return (
    <button type="button" className="ghost" onClick={close}>
      {children}
    </button>
  );
}
