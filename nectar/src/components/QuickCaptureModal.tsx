import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { write } from '../lib/useTable';
import { addDays, toDay } from '../lib/dates';
import { newBlock } from '../lib/blocks';
import { CURRENCIES, displayCurrency, symbolOf, toBRL, type Currency } from '../lib/money';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, type TxType } from '../lib/finance';
import type { Priority } from '../lib/tasks';
import { useRates } from '../pages/finance/useRates';
import { Field, FieldGroup, Modal } from './ui';

export type QuickTab = 'task' | 'money' | 'note';

export function openQuickCapture(tab: QuickTab = 'task') {
  window.dispatchEvent(new CustomEvent<QuickTab>('painel-quick-capture', { detail: tab }));
}

export function notifyDataChanged() {
  window.dispatchEvent(new Event('painel-data-changed'));
}

const TAB_LABEL: Record<QuickTab, string> = { task: 'Tarefa', money: 'Finanças', note: 'Nota' };

export function QuickCaptureModal() {
  const [open, setOpen] = useState<QuickTab | null>(null);
  useEffect(() => {
    const onOpen = (e: Event) => setOpen((e as CustomEvent<QuickTab>).detail ?? 'task');
    window.addEventListener('painel-quick-capture', onOpen);
    return () => window.removeEventListener('painel-quick-capture', onOpen);
  }, []);
  if (!open) return null;
  return <QuickCaptureDialog initial={open} onClose={() => setOpen(null)} />;
}

function QuickCaptureDialog({ initial, onClose }: { initial: QuickTab; onClose: () => void }) {
  const [tab, setTab] = useState<QuickTab>(initial);
  const [saving, setSaving] = useState(false);

  // Task state
  const [taskTitle, setTaskTitle] = useState('');
  const [taskWhen, setTaskWhen] = useState<'today' | 'tomorrow' | 'none'>('today');
  const [priority, setPriority] = useState<Priority>('medium');

  // Money state
  const [txType, setTxType] = useState<TxType>('expense');
  const [currency, setCurrency] = useState<Currency>(displayCurrency());
  const [amountText, setAmountText] = useState('');
  const [txDesc, setTxDesc] = useState('');
  const [txCat, setTxCat] = useState('');
  const [banks, setBanks] = useState<{ id: string; name: string; currency?: Currency }[]>([]);
  const [bankId, setBankId] = useState('');
  const quote = useRates(null);

  // Note state
  const [noteTitle, setNoteTitle] = useState('');
  const [noteText, setNoteText] = useState('');

  useEffect(() => {
    void supabase.from('banks').select('id,name,currency').order('name').then(({ data }) => {
      const list = (data ?? []) as { id: string; name: string; currency?: Currency }[];
      setBanks(list);
      if (list.length) {
        const match = list.find((b) => b.currency === displayCurrency()) ?? list[0];
        setBankId(match.id);
      }
    });
  }, []);

  async function submitTask(e: FormEvent) {
    e.preventDefault();
    const title = taskTitle.trim();
    if (!title || saving) return;
    setSaving(true);
    const today = toDay(new Date());
    const day = taskWhen === 'today' ? today : taskWhen === 'tomorrow' ? addDays(today, 1) : null;
    const ok = await write(supabase.from('tasks').insert({
      title,
      priority,
      due_date: day ? new Date(`${day}T12:00:00`).toISOString() : null,
      due_all_day: !!day,
    }));
    setSaving(false);
    if (ok) { notifyDataChanged(); onClose(); }
  }

  async function submitMoney(e: FormEvent) {
    e.preventDefault();
    const val = Number(amountText.replace(',', '.'));
    const description = txDesc.trim();
    if (!(val > 0) || !description || saving) return;
    const rate = currency === 'BRL' ? null : quote.rates?.[currency] ?? null;
    if (currency !== 'BRL' && !rate) return;
    setSaving(true);
    const amount = currency === 'BRL' ? val : toBRL(val, rate!);
    const ok = await write(supabase.from('transactions').insert({
      type: txType,
      description,
      amount,
      currency,
      original_amount: currency === 'BRL' ? null : val,
      fx_rate: rate,
      date: toDay(new Date()),
      category: txCat.trim() || null,
      payment_method: 'debito',
      bank_id: bankId || null,
      card_id: null,
      is_pending: false,
    }));
    setSaving(false);
    if (ok) { notifyDataChanged(); onClose(); }
  }

  async function submitNote(e: FormEvent) {
    e.preventDefault();
    const title = noteTitle.trim();
    if (!title || saving) return;
    setSaving(true);
    const lines = noteText.split('\n');
    const blocks = lines.map((l) => newBlock('paragraph', l));
    const ok = await write(supabase.from('knowledge_blocks').insert({
      title,
      content: blocks,
      content_text: noteText.trim(),
      tags: [],
      importance: 2,
      is_pinned: false,
      is_favorite: false,
    }));
    setSaving(false);
    if (ok) { notifyDataChanged(); onClose(); }
  }

  const rateMissing = currency !== 'BRL' && !quote.rates?.[currency];
  const categories = txType === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;

  return (
    <Modal title="Captura rápida" onClose={onClose}>
      <div className="segmented mb-5 w-full" role="tablist" aria-label="Tipo de registro">
        {(['task', 'money', 'note'] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            className={`flex-1 justify-center ${tab === t ? 'tab-active' : 'tab'}`}
            onClick={() => setTab(t)}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      {tab === 'task' && (
        <form onSubmit={submitTask}>
          <Field label="O que precisa ser feito?">
            <input className="input" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Ex.: Enviar atividade do QQI" required autoFocus />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <FieldGroup label="Quando">
              <div className="segmented w-full">
                {([['today', 'Hoje'], ['tomorrow', 'Amanhã'], ['none', 'Sem data']] as const).map(([v, l]) => (
                  <button key={v} type="button" aria-pressed={taskWhen === v} className={`flex-1 justify-center px-2 ${taskWhen === v ? 'tab-active' : 'tab'}`} onClick={() => setTaskWhen(v)}>{l}</button>
                ))}
              </div>
            </FieldGroup>
            <FieldGroup label="Prioridade">
              <div className="segmented w-full">
                {([['high', 'Alta'], ['medium', 'Média'], ['low', 'Baixa']] as const).map(([v, l]) => (
                  <button key={v} type="button" aria-pressed={priority === v} className={`flex-1 justify-center px-2 ${priority === v ? 'tab-active' : 'tab'}`} onClick={() => setPriority(v)}>{l}</button>
                ))}
              </div>
            </FieldGroup>
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
            <button className="btn-primary" disabled={saving || !taskTitle.trim()}>{saving ? 'Salvando…' : 'Criar tarefa'}</button>
          </div>
        </form>
      )}

      {tab === 'money' && (
        <form onSubmit={submitMoney}>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="segmented" role="group" aria-label="Tipo">
              {([['expense', 'Saída'], ['income', 'Entrada']] as const).map(([v, l]) => (
                <button key={v} type="button" aria-pressed={txType === v} className={txType === v ? 'tab-active' : 'tab'} onClick={() => setTxType(v)}>{l}</button>
              ))}
            </div>
            <div className="segmented ml-auto" role="group" aria-label="Moeda">
              {CURRENCIES.map((c) => (
                <button key={c.code} type="button" aria-pressed={currency === c.code} className={currency === c.code ? 'tab-active' : 'tab'} onClick={() => setCurrency(c.code)}>{c.symbol}</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={`Valor (${symbolOf(currency)})`}>
              <input className="input figure" type="number" min={0.01} step="0.01" inputMode="decimal" value={amountText} onChange={(e) => setAmountText(e.target.value)} placeholder="0,00" required autoFocus />
            </Field>
            <Field label="Conta">
              <select className="input" value={bankId} onChange={(e) => setBankId(e.target.value)}>
                <option value="">Nenhuma</option>
                {banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Descrição">
            <input className="input" value={txDesc} onChange={(e) => setTxDesc(e.target.value)} placeholder="Ex.: Tesco, Almoço, Renda" required />
          </Field>
          <Field label="Categoria (opcional)">
            <input className="input" list="quick-cats" value={txCat} onChange={(e) => setTxCat(e.target.value)} placeholder={categories[0]} />
            <datalist id="quick-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          </Field>
          {rateMissing && <p className="mb-3 text-xs text-fg3">Buscando cotação de {currency}…</p>}
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
            <button className="btn-primary" disabled={saving || rateMissing || !txDesc.trim() || !amountText}>{saving ? 'Salvando…' : 'Registrar'}</button>
          </div>
        </form>
      )}

      {tab === 'note' && (
        <form onSubmit={submitNote}>
          <Field label="Título da nota">
            <input className="input" value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} placeholder="Ex.: Ideia para o projeto" required autoFocus />
          </Field>
          <Field label="Conteúdo">
            <textarea className="input h-28 py-2.5" value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Escreva livremente…" />
          </Field>
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
            <button className="btn-primary" disabled={saving || !noteTitle.trim()}>{saving ? 'Salvando…' : 'Salvar nota'}</button>
          </div>
        </form>
      )}
    </Modal>
  );
}
