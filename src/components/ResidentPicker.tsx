import { useId, useMemo, useState } from "react";
import { useI18n } from "@/i18n";

export type ResidentOption = { id: string; label: string };

/** Filtra pela busca (com ou sem @): cada palavra precisa aparecer no rótulo, sem acento nem caixa. Vazio = todos. */
export function filterResidents(query: string, options: ResidentOption[], limit = 50): ResidentOption[] {
  const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const words = norm(query.replace(/^@/, "")).split(/\s+/).filter(Boolean);
  return options.filter((o) => words.every((w) => norm(o.label).includes(w))).slice(0, limit);
}

/**
 * Escolha do residente (Laundry e Dinner): um campo só. Ao tocar, abre a lista; digitar (com ou sem @)
 * filtra pelo nome ou quarto; toque, ou setas + Enter, escolhe.
 */
export function ResidentPicker({ options, value, onChange, emptyLabel, autoFocus, label }: {
  options: ResidentOption[];
  value: string;
  onChange: (id: string) => void;
  emptyLabel: string;
  autoFocus?: boolean;
  label?: string;
}) {
  const { t } = useI18n();
  const listId = useId();
  const selected = options.find((o) => o.id === value);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const matches = useMemo(() => filterResidents(query, options), [query, options]);

  function choose(o: ResidentOption) {
    onChange(o.id);
    setQuery("");
    setOpen(false);
  }

  return (
    <div className="resident-picker">
      <label className="resident-picker-label" htmlFor={`${listId}-input`}>{label ?? t("residentPicker.search")}</label>
      <div className="resident-picker-box">
        <input
          id={`${listId}-input`}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          value={open ? query : selected?.label ?? query}
          placeholder={selected ? selected.label : t("residentPicker.placeholder")}
          autoFocus={autoFocus}
          onFocus={() => { setOpen(true); setActive(0); }}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(0); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, matches.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            else if (e.key === "Enter" && open && matches[active]) { e.preventDefault(); choose(matches[active]); }
            else if (e.key === "Escape") setOpen(false);
          }}
        />
        {value && !open && (
          <button type="button" className="resident-picker-clear" aria-label={emptyLabel} onClick={() => onChange("")}>×</button>
        )}
        {open && (
          <ul className="resident-picker-list" role="listbox" id={listId}>
            {matches.length === 0 ? (
              <li className="muted resident-picker-empty">{t("residentPicker.none")}</li>
            ) : matches.map((o, i) => (
              <li key={o.id} role="option" aria-selected={i === active} className={i === active ? "is-active" : ""}
                onMouseDown={(e) => { e.preventDefault(); choose(o); }} onMouseEnter={() => setActive(i)}>
                {o.label}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
