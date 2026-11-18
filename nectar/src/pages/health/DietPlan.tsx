import { useEffect, useState } from 'react';
import { num } from '../../lib/format';
import { Plus, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { write } from '../../lib/useTable';
import { kcalFromMacros, nutrientsFor, shoppingList, sumNutrients, type DayTarget, type DayType } from '../../lib/nutrition';
import { gramsFromPercent, percentFromGrams } from '../../lib/diary';
import { weekdayShort } from '../../lib/dates';
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
      <p className="mb-3 text-sm text-fg2">Cadastre o plano do seu nutricionista: metas para dia de treino e de descanso, e as refeições, que geram a lista de compras.</p>
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
      <WeekdayTargets h={h} />
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

/** Calories and macros, entered in grams or as a percentage of the calories. */
export function MacroEditor({ value, onChange, idSuffix }: { value: DayTarget; onChange: (v: DayTarget) => void; idSuffix: string }) {
  const [mode, setMode] = useState<'g' | '%'>('g');
  const pct = percentFromGrams(value);
  const [p, setP] = useState(pct);
  const fromMacros = kcalFromMacros(value);
  const setPct = (next: typeof pct) => { setP(next); onChange({ ...value, ...gramsFromPercent(value.kcal, next) }); };
  const g = (k: 'protein_g' | 'carbs_g' | 'fat_g', label: string) => (
    <Field label={label}><input className="input" type="number" min={0} aria-label={`${label} (${idSuffix})`} value={value[k]} onChange={(e) => onChange({ ...value, [k]: Number(e.target.value) })} /></Field>
  );
  const pc = (k: keyof typeof pct, label: string) => (
    <Field label={`${label} (%)`}><input className="input" type="number" min={0} max={100} aria-label={`${label} % (${idSuffix})`} value={p[k]} onChange={(e) => setPct({ ...p, [k]: Number(e.target.value) })} /></Field>
  );
  return (
    <>
      <div className="mb-3 flex items-end gap-3">
        <div className="flex-1"><Field label="Calorias"><input className="input" type="number" min={0} aria-label={`Calorias (${idSuffix})`} value={value.kcal} onChange={(e) => onChange({ ...value, kcal: Number(e.target.value), ...(mode === '%' ? gramsFromPercent(Number(e.target.value), p) : {}) })} /></Field></div>
        <div className="segmented mb-4">
          {(['g', '%'] as const).map((m) => <button type="button" key={m} className={m === mode ? 'tab-active' : 'tab'} onClick={() => { setMode(m); if (m === '%') setP(percentFromGrams(value)); }}>{m === 'g' ? 'Gramas' : '%'}</button>)}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {mode === 'g'
          ? <>{g('protein_g', 'Proteína (g)')}{g('carbs_g', 'Carboidrato (g)')}{g('fat_g', 'Gordura (g)')}</>
          : <>{pc('protein', 'Proteína')}{pc('carbs', 'Carboidrato')}{pc('fat', 'Gordura')}</>}
      </div>
      <p className="mb-3 text-xs text-fg3">
        {mode === '%' ? `${value.protein_g} g de proteína, ${value.carbs_g} g de carboidrato e ${value.fat_g} g de gordura${p.protein + p.carbs + p.fat !== 100 ? ` · os percentuais somam ${p.protein + p.carbs + p.fat}%` : ''}`
          : `Os macros somam ${num(fromMacros)} kcal${value.kcal && Math.abs(value.kcal - fromMacros) > 50 ? `, diferente das ${num(value.kcal)} kcal informadas` : ''}`}
      </p>
    </>
  );
}

function TargetForm({ h, dayType, current }: { h: Health; dayType: DayType; current?: DayTarget }) {
  const [v, setV] = useState<DayTarget>({ kcal: current?.kcal ?? 0, protein_g: current?.protein_g ?? 0, carbs_g: current?.carbs_g ?? 0, fat_g: current?.fat_g ?? 0 });
  useEffect(() => { if (current) setV({ kcal: current.kcal, protein_g: current.protein_g, carbs_g: current.carbs_g, fat_g: current.fat_g }); }, [current?.kcal, current?.protein_g, current?.carbs_g, current?.fat_g]);
  async function save() {
    const kcal = v.kcal > 0 ? v.kcal : kcalFromMacros(v);
    if (kcal <= 0) return alert('Informe as calorias ou os macros');
    if (await write(supabase.from('diet_day_targets').upsert({ plan_id: h.plan!.id, day_type: dayType, ...v, kcal }, { onConflict: 'plan_id,day_type' }))) void h.targets.reload();
  }
  return (
    <div className="card">
      <div className="mb-3 font-medium">{dayType === 'rest' ? 'Dia de descanso' : 'Dia de treino'}</div>
      <MacroEditor value={v} onChange={setV} idSuffix={dayType === 'rest' ? 'descanso' : 'treino'} />
      <button className="btn-primary" onClick={save}>Salvar meta</button>
    </div>
  );
}

const WEEKDAY_FULL = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

function WeekdayTargets({ h }: { h: Health }) {
  const [editing, setEditing] = useState<number | null>(null);
  const plan = h.plan!;
  const rows = h.weekdayTargets.rows.filter((t) => t.plan_id === plan.id);
  return (
    <section className="card md:col-span-2">
      <div className="mb-1 font-medium">Metas por dia da semana</div>
      <p className="mb-4 text-[13px] text-fg3">Opcional. Um dia com meta própria ignora a de treino ou descanso; os outros seguem as metas acima</p>
      <ul className="divide-y divide-line">
        {[1, 2, 3, 4, 5, 6, 0].map((wd) => {
          const t = rows.find((r) => r.weekday === wd);
          return (
            <li key={wd} className="flex items-center gap-3 py-2.5 text-sm">
              <span className="w-24">{WEEKDAY_FULL[wd]}</span>
              <span className="mr-auto text-fg3">
                {t ? <><span className="figure text-fg">{num(t.kcal)}</span> kcal · P {t.protein_g} · C {t.carbs_g} · G {t.fat_g}</> : 'segue treino ou descanso'}
              </span>
              <button className="btn-ghost" onClick={() => setEditing(wd)} aria-label={`Editar meta de ${WEEKDAY_FULL[wd]}`}>{t ? 'Editar' : 'Definir'}</button>
            </li>
          );
        })}
      </ul>
      {editing !== null && <WeekdayForm h={h} weekday={editing} current={rows.find((r) => r.weekday === editing)} onClose={() => setEditing(null)} />}
    </section>
  );
}

function WeekdayForm({ h, weekday, current, onClose }: { h: Health; weekday: number; current?: DayTarget; onClose: () => void }) {
  const fallback = h.targets.rows.find((t) => t.plan_id === h.plan!.id && t.day_type === 'rest');
  const [v, setV] = useState<DayTarget>(current ?? (fallback ? { kcal: fallback.kcal, protein_g: fallback.protein_g, carbs_g: fallback.carbs_g, fat_g: fallback.fat_g } : { kcal: 2000, protein_g: 150, carbs_g: 200, fat_g: 65 }));
  async function save() {
    const kcal = v.kcal > 0 ? v.kcal : kcalFromMacros(v);
    if (await write(supabase.from('diet_weekday_targets').upsert({ plan_id: h.plan!.id, weekday, ...v, kcal }, { onConflict: 'plan_id,weekday' }))) { await h.weekdayTargets.reload(); onClose(); }
  }
  async function clear() {
    if (await write(supabase.from('diet_weekday_targets').delete().eq('plan_id', h.plan!.id).eq('weekday', weekday))) { await h.weekdayTargets.reload(); onClose(); }
  }
  return (
    <Modal title={`Meta de ${WEEKDAY_FULL[weekday].toLowerCase()} (${weekdayShort(weekday)})`} onClose={onClose}>
      <MacroEditor value={v} onChange={setV} idSuffix={WEEKDAY_FULL[weekday].toLowerCase()} />
      <div className="flex gap-2">
        {current && <button className="btn-ghost" onClick={clear}>Remover meta do dia</button>}
        <button className="btn-primary ml-auto" onClick={save}>Salvar</button>
      </div>
    </Modal>
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
        <span className="text-sm text-fg3">Plano por dia: {num(day.kcal)} kcal · P {num(day.protein_g)} g · C {num(day.carbs_g)} g · G {num(day.fat_g)} g</span>
        <button className="btn-primary ml-auto" onClick={() => setNewMeal(true)}><Plus size={16} strokeWidth={1.5} />Refeição</button>
      </div>
      {!meals.length && <div className="card"><Empty>Nenhuma refeição no plano ainda.</Empty></div>}
      {meals.map((m) => {
        const items = h.items.rows.filter((i) => i.meal_id === m.id);
        return (
          <section key={m.id} className="card mb-3">
            <div className="mb-2 flex items-baseline gap-2">
              <h3 className="font-medium">{m.name}</h3>
              {m.time_of_day && <span className="text-xs text-fg3">{m.time_of_day.slice(0, 5)}</span>}
              <button className="btn-ghost ml-auto" onClick={() => setAdding(m.id)}><Plus size={16} strokeWidth={1.5} />Alimento</button>
              <button className="text-xs text-negative" onClick={async () => {
                if (confirm(`Excluir a refeição ${m.name}?`) && await write(supabase.from('diet_plan_meals').delete().eq('id', m.id))) { void h.meals.reload(); void h.items.reload(); }
              }}>excluir</button>
            </div>
            <ul className="text-sm">
              {items.map((i) => (
                <li key={i.id} className="flex gap-2 border-t border-line py-1.5">
                  <span className="mr-auto">{i.food?.name} <span className="text-fg3">· {num(i.quantity_g)} g</span></span>
                  {i.food && <span className="text-xs text-fg3">{nutrientsFor(i.food, i.quantity_g).kcal} kcal</span>}
                  <button className="text-fg3 hover:text-negative" aria-label={`Remover ${i.food?.name}`} onClick={async () => {
                    if (await write(supabase.from('diet_plan_items').delete().eq('id', i.id))) void h.items.reload();
                  }}><X size={16} strokeWidth={1.5} /></button>
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
  const fmt = (g: number) => (g >= 1000 ? `${num(g / 1000, 2)} kg` : `${num(g)} g`);
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-sm">Comprar para</span>
        <input className="input w-20" type="number" min={1} max={60} value={days} onChange={(e) => setDays(Math.max(1, Number(e.target.value)))} aria-label="Dias" />
        <span className="text-sm">dias</span>
        <button className="btn-ghost ml-auto" onClick={() => { setChecked(new Set()); try { localStorage.removeItem(CHECKS_KEY); } catch { /* ignore */ } }}>desmarcar tudo</button>
      </div>
      {!list.length ? <div className="card"><Empty>Monte as refeições do plano para gerar a lista.</Empty></div> : (
        <ul className="card divide-y divide-line p-0">
          {list.map((i) => (
            <li key={i.food_id} className="flex items-center gap-3 px-4 py-2 text-sm">
              <input type="checkbox" className="h-4 w-4" checked={checked.has(i.food_id)} onChange={() => toggle(i.food_id)} aria-label={`Comprado: ${i.name}`} />
              <span className={`mr-auto ${checked.has(i.food_id) ? 'text-fg3 line-through' : ''}`}>{i.name}</span>
              <span className="text-fg3">{fmt(i.grams)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-fg3">Quantidades em peso dos alimentos como cadastrados no plano (cru ou cozido, conforme a tabela escolhida).</p>
    </>
  );
}
