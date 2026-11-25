import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { parseFilters, serializeFilters, type FilterDef, type FilterValues } from "./filters";

/** Valores dos filtros guardados na URL (replace: o botão Voltar não fica poluído). */
export function useUrlFilters(defs: FilterDef[]) {
  const [params, setParams] = useSearchParams();
  const values = useMemo(() => parseFilters(params, defs), [params, defs]);
  const set = useCallback(
    (patch: FilterValues) => setParams((prev) => serializeFilters({ ...parseFilters(prev, defs), ...patch }, defs, prev), { replace: true }),
    [defs, setParams],
  );
  const clear = useCallback(() => setParams((prev) => serializeFilters({}, defs, prev), { replace: true }), [defs, setParams]);
  return { values, set, clear };
}
