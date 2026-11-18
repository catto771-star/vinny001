// One number format for the whole app (pt-BR), so every figure reads the same.

const cache = new Map<string, Intl.NumberFormat>();
function nf(min: number, max: number) {
  const key = `${min}-${max}`;
  if (!cache.has(key)) cache.set(key, new Intl.NumberFormat('pt-BR', { minimumFractionDigits: min, maximumFractionDigits: max }));
  return cache.get(key)!;
}

/** 1980 -> '1.980', 82.5 -> '82,5', 0.333 -> '0,3'. */
export function num(n: number | null | undefined, maxDecimals = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return nf(0, maxDecimals).format(n);
}

/** Money in reais: 1234.5 -> 'R$ 1.234,50'. */
export function brl(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

/** Signed change with what it compares to: '+12% vs semana passada'. */
export function change(current: number, previous: number, against: string): string | null {
  if (!previous) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return `igual à ${against}`;
  return `${pct > 0 ? '+' : '−'}${Math.abs(pct)}% vs ${against}`;
}
