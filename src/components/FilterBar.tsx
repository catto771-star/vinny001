import { useId, useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { useI18n } from "@/i18n";
import { activeFilters, csv, type FilterDef, type FilterValues } from "@/lib/filters";

/**
 * Barra de filtros reutilizável (revisão 8): busca, filtros principais, "More filters", chips dos filtros ativos,
 * "Clear all" e contagem de resultados.
 */
export function FilterBar({ defs, values, onChange, onClear, count }: {
  defs: FilterDef[];
  values: FilterValues;
  onChange: (patch: FilterValues) => void;
  onClear: () => void;
  count?: number;
}) {
  const { t } = useI18n();
  const id = useId();
  const [more, setMore] = useState(false);
  const search = defs.find((d) => d.type === "search");
  const primary = defs.filter((d) => d.primary && d.type !== "search");
  const secondary = defs.filter((d) => !d.primary && d.type !== "search");
  const chips = activeFilters(defs, values);
  const hiddenActive = chips.filter((c) => secondary.some((d) => d.key === c.key)).length;

  const control = (d: FilterDef) => {
    const v = values[d.key] ?? "";
    if (d.type === "select") {
      return (
        <label className="filter-field" key={d.key}>
          <span>{d.label}</span>
          <select value={v} onChange={(e) => onChange({ [d.key]: e.target.value })}>
            <option value="">{t("filters.any")}</option>
            {d.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
      );
    }
    if (d.type === "date") {
      return (
        <label className="filter-field" key={d.key}>
          <span>{d.label}</span>
          <input type="date" value={v} onChange={(e) => onChange({ [d.key]: e.target.value })} />
        </label>
      );
    }
    const chosen = csv(v);
    return (
      <fieldset className="filter-field filter-multi" key={d.key}>
        <legend>{d.label}</legend>
        <div className="chip-row">
          {d.options?.map((o) => {
            const on = chosen.includes(o.value);
            return (
              <button key={o.value} type="button" className={`chip${on ? " is-on" : ""}`} aria-pressed={on}
                onClick={() => onChange({ [d.key]: (on ? chosen.filter((x) => x !== o.value) : [...chosen, o.value]).join(",") })}>
                {o.label}
              </button>
            );
          })}
        </div>
      </fieldset>
    );
  };

  return (
    <div className="filter-bar" role="search">
      <div className="filter-row">
        {search && (
          <label className="filter-search">
            <Search size={16} aria-hidden="true" />
            <input type="search" value={values[search.key] ?? ""} placeholder={search.label} aria-label={search.label}
              onChange={(e) => onChange({ [search.key]: e.target.value })} />
          </label>
        )}
        {primary.map(control)}
        {secondary.length > 0 && (
          <button type="button" className="filter-more" aria-expanded={more} aria-controls={`${id}-more`} onClick={() => setMore((m) => !m)}>
            <SlidersHorizontal size={16} aria-hidden="true" />
            {t("filters.more")}{hiddenActive > 0 && ` (${hiddenActive})`}
          </button>
        )}
      </div>
      {more && secondary.length > 0 && <div className="filter-panel" id={`${id}-more`}>{secondary.map(control)}</div>}
      {(chips.length > 0 || (search && values[search.key])) && (
        <div className="filter-active">
          {chips.map((c, i) => (
            <span className="filter-chip" key={`${c.label}-${i}`}>
              {c.label}
              <button type="button" aria-label={t("filters.remove", { name: c.label })} onClick={() => onChange(c.remove)}><X size={12} aria-hidden="true" /></button>
            </span>
          ))}
          <button type="button" className="link-button" onClick={onClear}>{t("filters.clear")}</button>
        </div>
      )}
      {count !== undefined && <p className="small-text muted" role="status" aria-live="polite">{t("filters.results", { n: count })}</p>}
    </div>
  );
}
