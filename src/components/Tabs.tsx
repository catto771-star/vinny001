import { useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export type TabStatus = "idle" | "progress" | "done" | "danger";
export type TabItem = { value: string; label: ReactNode; hint?: ReactNode; status?: TabStatus; statusLabel?: string };

/** Abas com indicador deslizante (docs/DESIGN.md). Setas ←/→ trocam de aba. */
export function Tabs({
  items,
  value,
  onChange,
  label,
  size = "md",
}: {
  items: TabItem[];
  value: string;
  onChange: (value: string) => void;
  label: string;
  size?: "md" | "sm";
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState({ left: 0, width: 0, ready: false });

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = () => {
      const active = list.querySelector<HTMLElement>('[aria-selected="true"]');
      if (active) {
        setIndicator({ left: active.offsetLeft, width: active.offsetWidth, ready: true });
        // Em telas estreitas a faixa rola: mantém a aba escolhida à vista.
        active.scrollIntoView?.({ inline: "nearest", block: "nearest" });
      }
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(list);
    return () => ro.disconnect();
  }, [value, items.length]);

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = (index + (e.key === "ArrowRight" ? 1 : -1) + items.length) % items.length;
    onChange(items[next].value);
    listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  }

  return (
    <div ref={listRef} className={`tabs tabs-${size}`} role="tablist" aria-label={label}>
      <span
        className="tabs-indicator"
        aria-hidden="true"
        style={{ transform: `translateX(${indicator.left}px)`, width: indicator.width, opacity: indicator.ready ? 1 : 0 }}
      />
      {items.map((item, i) => (
        <button
          key={item.value}
          type="button"
          role="tab"
          aria-selected={item.value === value}
          tabIndex={item.value === value ? 0 : -1}
          className="tab"
          onClick={() => onChange(item.value)}
          onKeyDown={(e) => onKeyDown(e, i)}
          title={item.statusLabel}
        >
          {item.status && <span className={`status-dot is-${item.status}`} aria-hidden="true" />}
          <span>{item.label}</span>
          {item.statusLabel && <span className="sr-only">{item.statusLabel}</span>}
          {item.hint && <span className="tab-hint">{item.hint}</span>}
        </button>
      ))}
    </div>
  );
}
