import { useMemo, useState } from "react";
import { useI18n } from "@/i18n";

export type ResidentOption = { id: string; label: string };

/** Filtra pela busca com @ (ou sem): cada palavra precisa aparecer no rótulo, sem acento nem caixa. */
export function filterResidents(query: string, options: ResidentOption[], limit = 8): ResidentOption[] {
  const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const words = norm(query.replace(/^@/, "")).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  return options.filter((o) => words.every((w) => norm(o.label).includes(w))).slice(0, limit);
}

/**
 * Escolha do residente ativo (escopo Beta: Laundry e Dinner): lista em cascata
 * ou busca digitando @ e o nome/quarto.
 */
export function ResidentPicker({ options, value, onChange, emptyLabel, autoFocus }: {
  options: ResidentOption[];
  value: string;
  onChange: (id: string) => void;
  emptyLabel: string;
  autoFocus?: boolean;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const matches = useMemo(() => filterResidents(query, options), [query, options]);
  return (
    <div className="resident-picker">
      <label>
        {t("residentPicker.search")}
        <input
          value={query}
          placeholder={t("residentPicker.placeholder")}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && matches[0]) {
              e.preventDefault();
              onChange(matches[0].id);
              setQuery("");
            }
          }}
          autoFocus={autoFocus}
          aria-autocomplete="list"
        />
      </label>
      {matches.length > 0 && (
        <ul className="mention-menu" role="listbox">
          {matches.map((o) => (
            <li key={o.id}>
              <button type="button" role="option" aria-selected={o.id === value} onClick={() => { onChange(o.id); setQuery(""); }}>
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      <label>
        {t("residentPicker.list")}
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">{emptyLabel}</option>
          {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </label>
    </div>
  );
}
