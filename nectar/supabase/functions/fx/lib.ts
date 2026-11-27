// Reading exchange rates (reais per unit of USD and EUR) from two free
// sources: the Banco Central do Brasil's PTAX (official, bulletins through the
// day) and, as a backup, Frankfurter (European Central Bank).

export type Rates = { USD: number; EUR: number };

/**
 * api.frankfurter.dev/v1/<date>?base=EUR&symbols=BRL,USD: { date, rates: { BRL, USD } }.
 * The date is the last business day on or before the one asked. USD in reais is BRL per EUR / USD per EUR.
 */
export function parseFrankfurter(json: unknown): { rates: Rates; date: string } | null {
  const j = json as { date?: string; rates?: { BRL?: number; USD?: number } } | null;
  const brl = Number(j?.rates?.BRL);
  const usd = Number(j?.rates?.USD);
  if (!(brl > 0) || !(usd > 0) || !j?.date) return null;
  return { rates: { USD: round(brl / usd), EUR: round(brl) }, date: j.date };
}

const round = (n: number) => Math.round(n * 10000) / 10000;

/** The PTAX query of one currency on one day (the API wants MM-DD-YYYY). */
export function bcbUrl(currency: 'USD' | 'EUR', date: string): string {
  const [y, m, d] = date.split('-');
  return `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoMoedaDia(moeda=@moeda,dataCotacao=@dataCotacao)?@moeda='${currency}'&@dataCotacao='${m}-${d}-${y}'&$format=json&$select=cotacaoCompra,cotacaoVenda,dataHoraCotacao,tipoBoletim`;
}

/** The day's latest PTAX bulletin at the selling rate; null on days without quotes. */
export function parseBcb(json: unknown): { rate: number; at: string; bulletin: string } | null {
  const rows = (json as { value?: { cotacaoVenda?: number; dataHoraCotacao?: string; tipoBoletim?: string }[] } | null)?.value;
  if (!Array.isArray(rows) || !rows.length) return null;
  const last = [...rows].filter((r) => Number(r.cotacaoVenda) > 0).sort((a, b) => String(a.dataHoraCotacao).localeCompare(String(b.dataHoraCotacao))).pop();
  if (!last) return null;
  return { rate: round(Number(last.cotacaoVenda)), at: String(last.dataHoraCotacao).slice(0, 16), bulletin: last.tipoBoletim ?? '' };
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
