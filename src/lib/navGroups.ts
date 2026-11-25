/** Menu lateral em módulos retráteis (revisão 8): lógica pura e guardada no navegador (por conveniência). */
const KEY = "nav.open";

/** Índice do grupo cuja rota casa com o caminho atual ("/" só casa exato). -1 se nenhum. */
export function groupIndexOfPath(groups: string[][], pathname: string): number {
  return groups.findIndex((paths) => paths.some((p) => (p === "/" ? pathname === "/" : pathname === p || pathname.startsWith(`${p}/`))));
}

export function nextOpen(open: string[], label: string): string[] {
  return open.includes(label) ? open.filter((l) => l !== label) : [...open, label];
}

export function readOpen(): string[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function writeOpen(open: string[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(open));
  } catch {
    /* armazenamento indisponível */
  }
}
