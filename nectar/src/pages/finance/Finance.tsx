import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { monthName } from '../../lib/dates';
import { addMonths } from '../../lib/finance';
import { PageHeader } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { CURRENCIES, formatIn, setDisplay, type Currency } from '../../lib/money';
import { useRates } from './useRates';
import { useFinance } from './useFinance';
import { TxForm } from './forms';
import Summary from './Summary';
import Statement from './Statement';
import Recurring from './Recurring';
import Installments from './Installments';
import Accounts from './Accounts';
import Analysis from './Analysis';

const TABS = ['Resumo', 'Lançamentos', 'Recorrentes', 'Parceladas', 'Contas', 'Análise'] as const;
type Tab = (typeof TABS)[number];

export default function Finance() {
  const f = useFinance();
  const now = new Date();
  const [tab, setTab] = useState<Tab>('Resumo');
  const [ym, setYm] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [newTx, setNewTx] = useState<Parameters<typeof TxForm>[0]['defaults'] | null>(null);
  const shift = (n: number) => setYm(addMonths(ym.year, ym.month, n));
  // The currency the screens show; values are kept in reais and converted at today's rate.
  const [currency, setCurrency] = useState<Currency>('BRL');
  const today = useRates(null);
  useEffect(() => {
    void supabase.from('user_settings').select('display_currency').maybeSingle().then(({ data }) => { if (data?.display_currency) setCurrency(data.display_currency as Currency); });
  }, []);
  const rate = currency === 'BRL' ? 1 : today.rates?.[currency] ?? null;
  setDisplay(currency, rate);
  async function chooseCurrency(c: Currency) {
    setCurrency(c);
    const { data } = await supabase.auth.getSession();
    if (data.session) await supabase.from('user_settings').upsert({ user_id: data.session.user.id, display_currency: c }, { onConflict: 'user_id' });
  }
  const isCurrent = ym.year === now.getFullYear() && ym.month === now.getMonth() + 1;

  /** Records one occurrence of a recurring entry as a transaction, pre-filled from its template. */
  function pay({ template_id, date }: { template_id: string; date: string }) {
    const t = f.templates.rows.find((x) => x.id === template_id);
    if (!t) return;
    setNewTx({
      type: t.type, amount: t.amount, description: t.description, date, category: t.category, payment_method: t.payment_method,
      bank_id: t.bank_id, card_id: t.card_id, recurring_template_id: t.id,
      currency: t.currency, original_amount: t.original_amount, fx_rate: t.fx_rate,
    });
  }

  return (
    <>
      <PageHeader
        title="Finanças"
        subtitle={`${monthName(ym.month).replace(/^./, (c) => c.toUpperCase())} de ${ym.year}`}
        tabs={TABS}
        tab={tab}
        onTab={(t) => setTab(t as Tab)}
        action={
          <div className="flex flex-wrap items-center gap-1">
            <div className="segmented mr-2" role="group" aria-label="Ver valores em">
              {CURRENCIES.map((c) => (
                <button key={c.code} type="button" className={currency === c.code ? 'tab-active' : 'tab'} aria-pressed={currency === c.code} title={c.name} onClick={() => void chooseCurrency(c.code)}>{c.symbol}</button>
              ))}
            </div>
            <button className="icon-btn" onClick={() => shift(-1)} aria-label="Mês anterior"><ChevronLeft size={16} strokeWidth={1.5} /></button>
            {!isCurrent && <button className="btn-ghost h-8" onClick={() => setYm({ year: now.getFullYear(), month: now.getMonth() + 1 })}>Hoje</button>}
            <button className="icon-btn" onClick={() => shift(1)} aria-label="Próximo mês"><ChevronRight size={16} strokeWidth={1.5} /></button>
            <button className="btn-primary ml-2" onClick={() => setNewTx({})}><Plus size={16} strokeWidth={1.5} />Lançamento</button>
          </div>
        }
      />
      {f.txs.error && <p className="mb-4 text-sm text-negative">{f.txs.error}</p>}
      {currency !== 'BRL' && (
        <p className="-mt-3 mb-4 text-[13px] text-fg3" role="status">
          {rate ? `Valores em ${CURRENCIES.find((c) => c.code === currency)!.name.toLowerCase()} pela cotação de ${today.date?.split('-').reverse().slice(0, 2).join('/')} (${today.source}): 1 ${CURRENCIES.find((c) => c.code === currency)!.symbol} = ${formatIn(rate, 'BRL')}.`
            : today.error ? `Sem cotação agora (${today.error}); valores em reais.` : 'Buscando a cotação…'}
        </p>
      )}
      <div key={`${currency}-${rate}`}>
      {tab === 'Resumo' && <Summary f={f} year={ym.year} month={ym.month} onPay={pay} />}
      {tab === 'Lançamentos' && <Statement f={f} year={ym.year} month={ym.month} />}
      {tab === 'Recorrentes' && <Recurring f={f} year={ym.year} month={ym.month} onPay={pay} />}
      {tab === 'Parceladas' && <Installments f={f} />}
      {tab === 'Contas' && <Accounts f={f} />}
      {tab === 'Análise' && <Analysis f={f} year={ym.year} month={ym.month} />}
      </div>
      {newTx && <TxForm f={f} defaults={newTx} onClose={() => setNewTx(null)} />}
    </>
  );
}
