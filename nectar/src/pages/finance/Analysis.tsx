import { useState } from 'react';
import { brl } from '../../lib/format';
import { monthName } from '../../lib/dates';
import { addMonths, averageLeftoverRate, byCategory, cents, monthlyFlow, reais } from '../../lib/finance';
import { ColumnChart, RankedBars } from '../../components/Charts';
import { Empty, Stat } from '../../components/ui';
import type { Finance } from './useFinance';

export default function Analysis({ f, year, month }: { f: Finance; year: number; month: number }) {
  const [months, setMonths] = useState(6);
  const flow = monthlyFlow(f.txs.rows, year, month, months);
  const rate = averageLeftoverRate(flow);
  const income = reais(flow.reduce((s, m) => s + cents(m.income), 0));
  const expense = reais(flow.reduce((s, m) => s + cents(m.expense), 0));
  const cats = new Map<string, number>();
  for (let i = 0; i < months; i++) {
    const m = addMonths(year, month, -i);
    for (const c of byCategory(f.txs.rows, 'expense', m.year, m.month)) cats.set(c.category, (cats.get(c.category) ?? 0) + cents(c.amount));
  }
  const ranking = [...cats.entries()].map(([label, c]) => ({ label, value: reais(c) })).sort((a, b) => b.value - a.value);
  const short = (y: number, m: number) => `${monthName(m).slice(0, 3)}/${String(y).slice(2)}`;
  const selector = (
    <div className="segmented">
      {[3, 6, 12].map((n) => <button key={n} className={n === months ? 'tab-active' : 'tab'} onClick={() => setMonths(n)}>{n} meses</button>)}
    </div>
  );

  return (
    <>
      <section className="card mb-6 grid grid-cols-2 gap-6 lg:grid-cols-4">
        <Stat label="Taxa de sobra média" value={rate === null ? '—' : String(rate).replace('.', ',')} unit={rate === null ? undefined : '%'} accent hint="sobra sobre o que entrou, nos meses com entrada" />
        <Stat label="Entrou no período" value={brl(income)} />
        <Stat label="Saiu no período" value={brl(expense)} />
        <Stat label="Sobrou no período" value={brl(reais(cents(income) - cents(expense)))} />
      </section>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <ColumnChart title="Sobra mês a mês" subtitle="entradas menos saídas de cada mês" unit="R$" height={280} aside={selector}
            points={flow.map((m) => ({ label: short(m.year, m.month), value: Math.max(0, m.leftover), detail: `entrou ${brl(m.income)}, saiu ${brl(m.expense)}${m.leftover < 0 ? `, faltou ${brl(-m.leftover)}` : ''}` }))} />
          <section className="card overflow-x-auto">
            <div className="mb-3 font-medium">Fluxo mês a mês</div>
            <table className="w-full min-w-[480px] text-sm">
              <thead><tr className="text-left text-xs text-fg3"><th className="pb-2 font-normal">Mês</th><th className="pb-2 text-right font-normal">Entrou</th><th className="pb-2 text-right font-normal">Saiu</th><th className="pb-2 text-right font-normal">Sobra</th><th className="pb-2 text-right font-normal">Taxa</th></tr></thead>
              <tbody>
                {[...flow].reverse().map((m) => (
                  <tr key={m.key} className="border-t border-line">
                    <td className="py-2 capitalize">{monthName(m.month)} {m.year}</td>
                    <td className="figure py-2 text-right">{brl(m.income)}</td>
                    <td className="figure py-2 text-right">{brl(m.expense)}</td>
                    <td className={`figure py-2 text-right ${m.leftover < 0 ? 'text-negative' : ''}`}>{brl(m.leftover)}</td>
                    <td className="figure py-2 text-right text-fg3">{m.rate === null ? '—' : `${String(m.rate).replace('.', ',')}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
        <section className="card h-fit">
          <div className="mb-4 font-medium">Categorias no período</div>
          {ranking.length ? <RankedBars unit="" format={brl} rows={ranking.slice(0, 10).map((r) => ({ ...r, detail: `média de ${brl(reais(Math.round(cents(r.value) / months)))} por mês` }))} />
            : <Empty>Sem saídas no período</Empty>}
        </section>
      </div>
    </>
  );
}
