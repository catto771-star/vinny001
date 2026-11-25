/** Filtros reutilizáveis (revisão 8): valores na URL (links compartilháveis), chips ativos e busca de texto. */
export type FilterOption = { value: string; label: string };
export type FilterDef = {
  key: string;
  label: string;
  type: "search" | "select" | "multi" | "date" | "text";
  options?: FilterOption[];
  /** Fica visível na barra, sem abrir "More filters". */
  primary?: boolean;
};
export type FilterValues = Record<string, string>;

export const csv = (v: string | undefined): string[] => (v ? v.split(",").filter(Boolean) : []);

/** Lê da URL só as chaves conhecidas; opção desconhecida de select/multi é descartada. */
export function parseFilters(params: URLSearchParams, defs: FilterDef[]): FilterValues {
  const out: FilterValues = {};
  for (const d of defs) {
    const raw = params.get(d.key);
    if (!raw) continue;
    if (d.type === "select") {
      if (d.options?.some((o) => o.value === raw)) out[d.key] = raw;
    } else if (d.type === "multi") {
      const ok = csv(raw).filter((v) => !d.options || d.options.some((o) => o.value === v));
      if (ok.length) out[d.key] = ok.join(",");
    } else out[d.key] = raw;
  }
  return out;
}

/** Monta a URL: remove vazios, mantém parâmetros alheios (ex.: casa) e deixa a ordem estável. */
export function serializeFilters(values: FilterValues, defs: FilterDef[], base: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(base);
  for (const d of defs) next.delete(d.key);
  for (const d of defs) {
    const v = values[d.key];
    if (!v) continue;
    next.set(d.key, d.type === "multi" ? csv(v).sort().join(",") : v);
  }
  return next;
}

export type ActiveFilter = { key: string; label: string; remove: FilterValues };

/** Chips dos filtros ativos (a busca de texto fica fora: já aparece na caixa). `remove` = novo valor da chave. */
export function activeFilters(defs: FilterDef[], values: FilterValues): ActiveFilter[] {
  const chips: ActiveFilter[] = [];
  for (const d of defs) {
    const v = values[d.key];
    if (!v || d.type === "search") continue;
    if (d.type === "multi") {
      for (const item of csv(v)) {
        chips.push({ key: d.key, label: `${d.label}: ${d.options?.find((o) => o.value === item)?.label ?? item}`, remove: { [d.key]: csv(v).filter((x) => x !== item).join(",") } });
      }
    } else {
      chips.push({ key: d.key, label: `${d.label}: ${d.options?.find((o) => o.value === v)?.label ?? v}`, remove: { [d.key]: "" } });
    }
  }
  return chips;
}

const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
/** Todas as palavras da busca precisam aparecer em algum dos textos (sem acento nem caixa). */
export function matchesText(haystack: Array<string | null | undefined>, query: string): boolean {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const text = norm(haystack.filter(Boolean).join(" "));
  return words.every((w) => text.includes(w));
}
