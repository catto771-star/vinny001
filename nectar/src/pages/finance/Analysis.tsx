import { useMemo, useState } from 'react';
import { conv, displayCurrency, money, symbolOf } from '../../lib/money';
import { monthName, toDay } from '../../lib/dates';
import { addMonths, averageLeftoverRate, byCategory, cents, monthlyFlow, netWorth, netWorthHistory, reais } from '../../lib/finance';
import { projectCashFlow, type HorizonDays } from '../../lib/cashflow';
import { AreaChart, ColumnChart, DonutChart, RankedBars } from '../../components/Charts';
import { Stat } from '../../components/ui';
import type { Finance } from './useFinance';

const HORIZONS: HorizonDays[] = [30, 60, 90];
const KIND_TAG = { recurring: 'recorrente', pending: 'pendente', invoice: 'fatura' } as const;
const shortDay = (d: string) => `${Number(d.slice(8))}/${d.slice(5, 7)}`;

export default function Analysis({ f, year, month }: { f: Finance; year: number; month: number }) {
  const [months, setMonths] = useState(6);
  const [horizon, setHorizon] = useState<HorizonDays>(30);
  const today = toDay(new Date());
  const worth = netWorth(f.banks.rows, f.txs.rows, f.transfers.rows, f.payments.rows, today);
  const worthCurve = useMemo(
    () => netWorthHistory(f.banks.rows, f.txs.rows, f.transfers.rows, f.payments.rows, year, month, months, today),
    [f.banks.rows, f.txs.rows, f.transfers.rows, f.payments.rows, year, month, months, today],
  );

  const projection = useMemo(() => projectCashFlow({
    startDay: today,
    days: horizon,
    startingBalance: worth,
    templates: f.activeTemplates,
    txs: f.txs.rows,
    skips: f.skips.rows,
    cards: f.cards.rows,
    payments: f.payments.rows,
  }), [today, horizon, worth, f.activeTemplates, f.txs.rows, f.skips.rows, f.cards.rows, f.payments.rows]);

  // Sample curve cleanly (~20-31 points) while always keeping first, last, and lowest-balance day
  const step = horizon === 30 ? 1 : horizon === 60 ? 2 : 3;
  const chartPoints = projection.points
    .filter((pt, idx) => idx === 0 || idx === projection.points.length - 1 || pt.day === projection.minBalanceDay || idx % step === 0)
    .map((pt) => ({
      label: shortDay(pt.day),
      value: conv(pt.balance),
      detail: pt.events.length
        ? pt.events.map((e) => `${e.amount >= 0 ? '+' : '−'}${money(Math.abs(e.amount))} ${e.label}`).join(' · ')
        : undefined,
    }));

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
  const horizonSelector = (
    <div className="segmented" role="group" aria-label="Horizonte da previsão">
      {HORIZONS.map((d) => (
        <button key={d} type="button" aria-pressed={d === horizon} className={d === horizon ? 'tab-active' : 'tab'} onClick={() => setHorizon(d)}>
          {d} dias
        </button>
      ))}
    </div>
  );

  return (
    <>
      {/* 30 / 60 / 90-day Cash Flow Projection */}
      <div className="mb-6 space-y-4">
        <section className="card grid grid-cols-2 gap-6 lg:grid-cols-4" aria-label="Resumo da previsão de caixa">
          <Stat label="Saldo hoje" value={money(projection.startingBalance)} hint={`${f.banks.rows.length} ${f.banks.rows.length === 1 ? 'conta' : 'contas'}`} />
          <Stat
            label={`Previsto em ${horizon}d`}
            value={<span className={projection.endingBalance < 0 ? 'text-negative' : ''}>{money(projection.endingBalance)}</span>}
            accent
            hint={`${projection.netChange >= 0 ? '+' : '−'}${money(Math.abs(projection.netChange))} no período`}
          />
          <Stat
            label="Menor saldo"
            value={<span className={projection.minBalance < 0 ? 'text-negative' : ''}>{money(projection.minBalance)}</span>}
            hint={projection.negativeDays > 0 ? `${projection.negativeDays} ${projection.negativeDays === 1 ? 'dia' : 'dias'} no vermelho (${shortDay(projection.minBalanceDay)})` : `em ${shortDay(projection.minBalanceDay)}`}
          />
          <Stat
            label="Previsto entrar / sair"
            value={money(projection.totalIn)}
            hint={`saídas previstas: ${money(projection.totalOut)}`}
          />
        </section>

        <AreaChart
          title={`Previsão de fluxo de caixa (${horizon} dias)`}
          subtitle="Saldo projetado somando recorrentes, pendentes e faturas em aberto"
          points={chartPoints}
          unit={symbolOf(displayCurrency())}
          height={250}
          aside={horizonSelector}
          tone={projection.endingBalance < projection.startingBalance ? 'var(--warning)' : 'var(--brand)'}
        />

        {projection.events.length > 0 && (
          <details className="card">
            <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium">
              <span>Movimentações previstas nos próximos {horizon} dias ({projection.events.length})</span>
              <span className="text-xs text-fg3">ver lista</span>
            </summary>
            <ul className="mt-3 max-h-64 divide-y divide-line overflow-y-auto text-sm">
              {projection.events.map((ev) => (
                <li key={ev.key} className="flex items-center gap-3 py-2">
                  <span className="figure w-12 shrink-0 text-xs text-fg3">{shortDay(ev.day)}</span>
                  <span className="min-w-0 flex-1 truncate">{ev.label}</span>
                  <span className="badge bg-raised text-fg3">{KIND_TAG[ev.kind]}</span>
                  <span className={`figure shrink-0 text-right ${ev.amount >= 0 ? 'text-positive' : ''}`}>
                    {ev.amount >= 0 ? '+' : '−'}{money(Math.abs(ev.amount))}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      {/* Historical Net Worth Evolution */}
      <div className="mb-6">
        <AreaChart
          title="Evolução do patrimônio"
          subtitle={`Saldo consolidado das contas ao final de cada mês (${months} meses)`}
          unit={symbolOf(displayCurrency())}
          minZero={false}
          height={250}
          aside={selector}
          tone="var(--positive)"
          points={worthCurve.map((p) => ({
            label: short(p.year, p.month),
            value: conv(p.value),
            detail: `em ${shortDay(p.date)}`,
          }))}
        />
      </div>

      {/* Historical monthly flow & categories */}
      <section className="card mb-6 grid grid-cols-2 gap-6 lg:grid-cols-4">
        <Stat label="Taxa de sobra média" value={rate === null ? '—' : String(rate).replace('.', ',')} unit={rate === null ? undefined : '%'} accent hint="sobra sobre o que entrou, nos meses com entrada" />
        <Stat label="Entrou no período" value={money(income)} />
        <Stat label="Saiu no período" value={money(expense)} />
        <Stat label="Sobrou no período" value={money(reais(cents(income) - cents(expense)))} />
      </section>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <ColumnChart title="Sobra mês a mês" subtitle="Entradas menos saídas de cada mês" unit={symbolOf(displayCurrency())} height={270}
            points={flow.map((m) => ({ label: short(m.year, m.month), value: conv(Math.max(0, m.leftover)), detail: `entrou ${money(m.income)}, saiu ${money(m.expense)}${m.leftover < 0 ? `, faltou ${money(-m.leftover)}` : ''}` }))} />
          <section className="card overflow-x-auto">
            <div className="mb-3 font-medium">Fluxo mês a mês</div>
            <table className="w-full min-w-[480px] text-sm">
              <thead><tr className="text-left text-xs text-fg3"><th className="pb-2 font-normal">Mês</th><th className="pb-2 text-right font-normal">Entrou</th><th className="pb-2 text-right font-normal">Saiu</th><th className="pb-2 text-right font-normal">Sobra</th><th className="pb-2 text-right font-normal">Taxa</th></tr></thead>
              <tbody>
                {[...flow].reverse().map((m) => (
                  <tr key={m.key} className="border-t border-line">
                    <td className="py-2 capitalize">{monthName(m.month)} {m.year}</td>
                    <td className="figure py-2 text-right">{money(m.income)}</td>
                    <td className="figure py-2 text-right">{money(m.expense)}</td>
                    <td className={`figure py-2 text-right ${m.leftover < 0 ? 'text-negative' : ''}`}>{money(m.leftover)}</td>
                    <td className="figure py-2 text-right text-fg3">{m.rate === null ? '—' : `${String(m.rate).replace('.', ',')}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
        <section className="card h-fit min-w-0 space-y-5">
          <DonutChart
            bare
            title="Categorias no período"
            subtitle={`Últimos ${months} meses`}
            centerLabel="Total"
            format={money}
            size={150}
            emptyText="Sem saídas no período"
            rows={ranking}
          />
          {ranking.length > 0 && (
            <div className="border-t border-line pt-4">
              <div className="label mb-3">Média mensal</div>
              <RankedBars unit="" format={money} rows={ranking.slice(0, 6).map((r) => ({ ...r, detail: `média de ${money(reais(Math.round(cents(r.value) / months)))} por mês` }))} />
            </div>
          )}
        </section>
      </div>
    </>
  );
}

