import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { write } from '../../lib/useTable';
import { kcalFromMacros, nutrientsFor, shoppingList, sumNutrients, type DayTarget, type DayType } from '../../lib/nutrition';
import { Empty, Field, Modal } from '../../components/ui';
import FoodSearch from './FoodSearch';
import type { Health } from './useHealth';

const VIEWS = ['Metas', 'Refeições do plano', 'Lista de compras'] as const;

export default function DietPlan({ h }: { h: Health }) {
  const [view, setView] = useState<(typeof VIEWS)[number]>('Metas');
  if (!h.plan) return <CreatePlan h={h} />;
  return (
    <>
      <div className="mb-4 flex flex-wrap gap-1">
        {VIEWS.map((v) => <button key={v} className={v === view ? 'tab-active' : 'tab'} onClick={() => setView(v)}>{v}</button>)}
      </div>
      {view === 'Metas' && <Targets h={h} />}
      {view === 'Refeições do plano' && <PlanMeals h={h} />}
      {view === 'Lista de compras' && <Shopping h={h} />}
    </>
  );
}

function CreatePlan({ h }: { h: Health }) {
  const [name, setName] = useState('Meu plano');
  return (
    <div className="card max-w-md">
      <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">Cadastre o plano do seu nutricionista: metas para dia de treino e de descanso, e as refeições, que geram a lista de compras.</p>
      <Field label="Nome do plano"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <button className="btn-primary" onClick={async () => {
        if (await write(supabase.from('diet_plans').insert({ name, is_active: true }))) void h.plans.reload();
      }}>Criar plano</button>
    </div>
  );
}

function Targets({ h }: { h: Health }) {
  const plan = h.plan!;
  const get = (t: DayType) => h.targets.rows.find((x) => x.plan_id === plan.id && x.day_type === t);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <TargetForm h={h} dayType="rest" current={get('rest')} />
      <TargetForm h={h} dayType="training" current={get('training')} />
      <div className="card md:col-span-2">
        <div className="label mb-2">Meta nos dias de treino</div>
        <label className="mb-1 flex items-start gap-2 text-sm">
          <input type="radio" name="mode" checked={plan.training_target_mode === 'fixed'} onChange={() => setMode(h, 'fixed')} />
          <span><strong>Fixa:</strong> usa a meta de dia de treino como cadastrada.</span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="radio" name="mode" checked={plan.training_target_mode === 'dynamic'} onChange={() => setMode(h, 'dynamic')} />
          <span><strong>Ajustada pelo treino:</strong> parte da meta de descanso e soma as calorias gastas no treino e no cardio do dia, convertidas em carboidrato.</span>
        </label>
      </div>
    </div>
  );
}

async function setMode(h: Health, mode: 'fixed' | 'dynamic') {
  // Show the choice at once; the reload brings the saved state.
  h.plans.setRows((rows) => rows.map((p) => (p.id === h.plan!.id ? { ...p, training_target_mode: mode } : p)));
  if (await write(supabase.from('diet_plans').update({ training_target_mode: mode }).eq('id', h.plan!.id))) void h.plans.reload();
}

function TargetForm({ h, dayType, current }: { h: Health; dayType: DayType; current?: DayTarget }) {
  const [v, setV] = useState({ protein_g: current?.protein_g ?? 0, carbs_g: current?.carbs_g ?? 0, fat_g: current?.fat_g ?? 0, kcal: current?.kcal ?? 0 });
  useEffect(() => { if (current) setV(current); }, [current?.kcal, current?.protein_g, current?.carbs_g, current?.fat_g]);
  const fromMacros = kcalFromMacros(v);
  async function save() {
    const kcal = v.kcal > 0 ? v.kcal : fromMacros;
    if (kcal <= 0) return alert('Informe as calorias ou os macros.');
    if (await write(supabase.from('diet_day_targets').upsert({ plan_id: h.plan!.id, day_type: dayType, ...v, kcal }, { onConflict: 'plan_id,day_type' }))) void h.targets.reload();
  }
  const input = (k: keyof typeof v, label: string) => (
    <Field label={label}><input className="input" type="number" min={0} aria-label={`${label} (${dayType === 'rest' ? 'descanso' : 'treino'})`} value={v[k]} onChange={(e) => setV({ ...v, [k]: Number(e.target.value) })} /></Field>
  );
  return (
    <div className="card">
      <div className="label mb-2">{dayType === 'rest' ? 'Dia de descanso' : 'Dia de treino'}</div>
      <div className="grid grid-cols-2 gap-2">
        {input('kcal', 'Calorias')}
        {input('protein_g', 'Proteína (g)')}
        {input('carbs_g', 'Carboidrato (g)')}
        {input('fat_g', 'Gordura (g)')}
      </div>
      <p className="mb-3 text-xs text-slate-500">Os macros somam {fromMacros} kcal{v.kcal && Math.abs(v.kcal - fromMacros) > 50 ? `, diferente das ${v.kcal} kcal informadas` : ''}. Calorias em 0 usam a soma dos macros.</p>
      <button className="btn-primary" onClick={save}>Salvar meta</button>
    </div>
  );
}

function PlanMeals({ h }: { h: Health }) {
  const plan = h.plan!;
  const meals = h.meals.rows.filter((m) => m.plan_id === plan.id);
  const [adding, setAdding] = useState<string | null>(null);
  const [newMeal, setNewMeal] = useState(false);
  const day = sumNutrients(h.items.rows.filter((i) => meals.some((m) => m.id === i.meal_id) && i.food).map((i) => nutrientsFor(i.food!, i.quantity_g)));
  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <span className="text-sm text-slate-500">Plano por dia: {day.kcal} kcal · P {day.protein_g} g · C {day.carbs_g} g · G {day.fat_g} g</span>
        <button className="btn-primary ml-auto" onClick={() => setNewMeal(true)}>+ Refeição</button>
      </div>
      {!meals.length && <div className="card"><Empty>Nenhuma refeição no plano ainda.</Empty></div>}
      {meals.map((m) => {
        const items = h.items.rows.filter((i) => i.meal_id === m.id);
        return (
          <section key={m.id} className="card mb-3">
            <div className="mb-2 flex items-baseline gap-2">
              <h3 className="font-medium">{m.name}</h3>
              {m.time_of_day && <span className="text-xs text-slate-500">{m.time_of_day.slice(0, 5)}</span>}
              <button className="btn-ghost ml-auto" onClick={() => setAdding(m.id)}>+ alimento</button>
              <button className="text-xs text-red-600" onClick={async () => {
                if (confirm(`Excluir a refeição ${m.name}?`) && await write(supabase.from('diet_plan_meals').delete().eq('id', m.id))) { void h.meals.reload(); void h.items.reload(); }
              }}>excluir</button>
            </div>
            <ul className="text-sm">
              {items.map((i) => (
                <li key={i.id} className="flex gap-2 border-t border-slate-100 py-1.5 dark:border-slate-800">
                  <span className="mr-auto">{i.food?.name} <span className="text-slate-500">· {i.quantity_g} g</span></span>
                  {i.food && <span className="text-xs text-slate-500">{nutrientsFor(i.food, i.quantity_g).kcal} kcal</span>}
                  <button className="text-slate-400 hover:text-red-600" aria-label={`Remover ${i.food?.name}`} onClick={async () => {
                    if (await write(supabase.from('diet_plan_items').delete().eq('id', i.id))) void h.items.reload();
                  }}>✕</button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {adding && (
        <FoodSearch title="Adicionar ao plano" onClose={() => setAdding(null)} onPick={async (food, grams) => {
          if (await write(supabase.from('diet_plan_items').insert({ meal_id: adding, food_id: food.id, quantity_g: grams }))) { setAdding(null); void h.items.reload(); }
        }} />
      )}
      {newMeal && <MealForm onClose={() => setNewMeal(false)} onSave={async (name, time) => {
        if (await write(supabase.from('diet_plan_meals').insert({ plan_id: plan.id, name, time_of_day: time || null, order_index: meals.length }))) { setNewMeal(false); void h.meals.reload(); }
      }} />}
    </>
  );
}

function MealForm({ onClose, onSave }: { onClose: () => void; onSave: (name: string, time: string) => void }) {
  const [name, setName] = useState('');
  const [time, setTime] = useState('');
  return (
    <Modal title="Nova refeição do plano" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); onSave(name, time); }}>
        <Field label="Nome"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Café da manhã" required autoFocus /></Field>
        <Field label="Horário (opcional)"><input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
        <button className="btn-primary w-full justify-center">Salvar</button>
      </form>
    </Modal>
  );
}

const CHECKS_KEY = 'painel.shopping.checked';

function Shopping({ h }: { h: Health }) {
  const [days, setDays] = useState(7);
  const [checked, setChecked] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(CHECKS_KEY) ?? '[]')); } catch { return new Set(); }
  });
  const meals = new Set(h.meals.rows.filter((m) => m.plan_id === h.plan!.id).map((m) => m.id));
  const items = h.items.rows.filter((i) => meals.has(i.meal_id));
  const foods = new Map(items.filter((i) => i.food).map((i) => [i.food_id, { id: i.food_id, name: i.food!.name }]));
  const list = shoppingList(items, foods, days);
  function toggle(id: string) {
    const next = new Set(checked);
    if (next.has(id)) next.delete(id); else next.add(id);
    setChecked(next);
    try { localStorage.setItem(CHECKS_KEY, JSON.stringify([...next])); } catch { /* storage unavailable */ }
  }
  const fmt = (g: number) => (g >= 1000 ? `${(g / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} kg` : `${g} g`);
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-sm">Comprar para</span>
        <input className="input w-20" type="number" min={1} max={60} value={days} onChange={(e) => setDays(Math.max(1, Number(e.target.value)))} aria-label="Dias" />
        <span className="text-sm">dias</span>
        <button className="btn-ghost ml-auto" onClick={() => { setChecked(new Set()); try { localStorage.removeItem(CHECKS_KEY); } catch { /* ignore */ } }}>desmarcar tudo</button>
      </div>
      {!list.length ? <div className="card"><Empty>Monte as refeições do plano para gerar a lista.</Empty></div> : (
        <ul className="card divide-y divide-slate-100 p-0 dark:divide-slate-800">
          {list.map((i) => (
            <li key={i.food_id} className="flex items-center gap-3 px-4 py-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-sky-600" checked={checked.has(i.food_id)} onChange={() => toggle(i.food_id)} aria-label={`Comprado: ${i.name}`} />
              <span className={`mr-auto ${checked.has(i.food_id) ? 'text-slate-400 line-through' : ''}`}>{i.name}</span>
              <span className="text-slate-500">{fmt(i.grams)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-slate-500">Quantidades em peso dos alimentos como cadastrados no plano (cru ou cozido, conforme a tabela escolhida).</p>
    </>
  );
}
