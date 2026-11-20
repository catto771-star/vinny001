import { useEffect, useRef, type ReactNode } from "react";

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

  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
    return () => el?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      className={wide ? "dialog dialog-wide" : "dialog"}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header className="dialog-header">
        <h2>{title}</h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label="×">
          ×
        </button>
      </header>
      <div className="dialog-body">{children}</div>
      {footer && <footer className="dialog-footer">{footer}</footer>}
    </dialog>
  );
}
