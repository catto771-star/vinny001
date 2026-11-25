import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@/auth/AuthProvider";
import type { Lodge } from "@/lib/types";

/**
 * Casa ativa (escopo Beta, item 1): a casa escolhida pinta o cabeçalho e o menu
 * (Amiens em ocre, Connolly em azul) e é a casa em que as telas lançam.
 * O seletor no topo troca a casa na hora (Float), sem sair do sistema.
 */
type Ctx = { activeId: string; setActiveId: (id: string) => void };
const ActiveLodgeContext = createContext<Ctx | null>(null);
const STORAGE_KEY = "lodge.active";

export function houseOf(lodge: Pick<Lodge, "code"> | undefined | null): string {
  return lodge?.code ? lodge.code.toLowerCase() : "";
}

export function pickInitialLodge(lodges: Pick<Lodge, "id">[], preferred: (string | null | undefined)[]): string {
  for (const id of preferred) if (id && lodges.some((l) => l.id === id)) return id;
  return lodges[0]?.id ?? "";
}

function readStored(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function ActiveLodgeProvider({ children }: { children: ReactNode }) {
  const { lodges, post, staff } = useAuth();
  const { isManagement } = useAuth();
  const [chosen, setChosen] = useState<string | null>(readStored);
  // A casa guardada no navegador só vale para Admin; conta de casa usa sempre a sua.
  const activeId = pickInitialLodge(lodges, [isManagement ? chosen : null, post?.lodge_id, staff?.home_lodge_id]);
  const setActiveId = useCallback((id: string) => {
    setChosen(id);
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* armazenamento indisponível */
    }
  }, []);
  const house = houseOf(lodges.find((l) => l.id === activeId));
  useEffect(() => {
    if (house) document.documentElement.dataset.house = house;
    else delete document.documentElement.dataset.house;
  }, [house]);
  const value = useMemo(() => ({ activeId, setActiveId }), [activeId, setActiveId]);
  return <ActiveLodgeContext.Provider value={value}>{children}</ActiveLodgeContext.Provider>;
}

export function useActiveLodge(): Ctx & { lodge: Lodge | undefined } {
  const ctx = useContext(ActiveLodgeContext);
  const { lodges } = useAuth();
  const fallback = useState("");
  const activeId = ctx?.activeId ?? fallback[0];
  return { activeId, setActiveId: ctx?.setActiveId ?? fallback[1], lodge: lodges.find((l) => l.id === activeId) };
}

/**
 * Casa usada por uma tela. `only` limita às casas que têm o serviço (ex.: Dinner só em Amiens);
 * se a casa ativa não tem o serviço, a tela usa a que tem e a cor acompanha.
 * Fora do menu (testes de tela), funciona como um estado local.
 */
export function useLodgeState(only?: (l: Lodge) => boolean): [string, (id: string) => void] {
  const ctx = useContext(ActiveLodgeContext);
  const { lodges, post, staff } = useAuth();
  const list = only ? lodges.filter(only) : lodges;
  const [local, setLocal] = useState(() => pickInitialLodge(list, [post?.lodge_id, staff?.home_lodge_id]));
  const wanted = ctx ? ctx.activeId : local;
  const effective = pickInitialLodge(list, [wanted, local]);
  const set = ctx ? ctx.setActiveId : setLocal;
  useEffect(() => {
    if (ctx && effective && effective !== ctx.activeId) ctx.setActiveId(effective);
  }, [ctx, effective]);
  return [effective, set];
}
