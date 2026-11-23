import { useEffect, useState } from 'react';
import { num } from '../../lib/format';
import { Camera, ChevronLeft, ChevronRight, Copy, Plus, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { write } from '../../lib/useTable';
import { addDays, formatDay, toDay } from '../../lib/dates';
import { MEALS, nutrientsFor, sumNutrients, type Food, type FoodLog } from '../../lib/nutrition';
import { copyLogs, frequentFoods, recentFoods, rescaleLog } from '../../lib/diary';
import { TargetBar } from '../../components/Charts';
import { Field, Modal } from '../../components/ui';
import FoodSearch from './FoodSearch';
import { energyForDay } from './energyForDay';
import type { Health } from './useHealth';

export default function Diet({ h }: { h: Health }) {
  const [day, setDay] = useState(toDay(new Date()));
  const [adding, setAdding] = useState<string | null>(null);
  const [adjusting, setAdjusting] = useState(false);
  const [editingLog, setEditingLog] = useState<FoodLog | null>(null);
  const [copying, setCopying] = useState<{ meal?: string } | null>(null);
  const logs = h.foodLogs.rows.filter((l) => l.date === day);
  const recent = recentFoods(h.foodLogs.rows);
  const frequent = frequentFoods(h.foodLogs.rows);
  const totals = sumNutrients(logs);
  const { burned, estimated, dayType, target } = energyForDay(h, day);
  const override = h.overrides.rows.find((o) => o.date === day);

  async function setDayType(t: 'training' | 'rest' | null) {
    const ok = await write(supabase.from('diet_day_overrides').upsert({ date: day, day_type: t, kcal: override?.kcal ?? null, protein_g: override?.protein_g ?? null, carbs_g: override?.carbs_g ?? null, fat_g: override?.fat_g ?? null }, { onConflict: 'user_id,date' }));
    if (ok) void h.overrides.reload();
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button className="btn-ghost" onClick={() => setDay(addDays(day, -1))} aria-label="Dia anterior"><ChevronLeft size={16} strokeWidth={1.5} /></button>
        <span className="min-w-48 text-center font-medium">{formatDay(day)}</span>
        <button className="btn-ghost" onClick={() => setDay(addDays(day, 1))} aria-label="Próximo dia"><ChevronRight size={16} strokeWidth={1.5} /></button>
        {day !== toDay(new Date()) && <button className="btn-ghost" onClick={() => setDay(toDay(new Date()))}>Hoje</button>}
        <button className="btn-secondary ml-auto" onClick={() => setCopying({})}><Copy size={16} strokeWidth={1.5} />Copiar dia</button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0">
          {MEALS.map((meal) => {
            const items = logs.filter((l) => l.meal === meal);
            const sub = sumNutrients(items);
            return (
              <section key={meal} className="card mb-3">
                <div className="mb-2 flex items-start gap-2">
                  <div className="min-w-0">
                    <h3 className="font-medium">{meal}</h3>
                    {items.length > 0 && <div className="text-xs text-fg3"><span className="figure">{num(sub.kcal)}</span> kcal · P {num(sub.protein_g)} · C {num(sub.carbs_g)} · G {num(sub.fat_g)}</div>}
                  </div>
                  <button className="icon-btn ml-auto" onClick={() => setCopying({ meal })} aria-label={`Copiar ${meal} de outro dia`} title="Copiar de outro dia"><Copy size={16} strokeWidth={1.5} /></button>
                  <button className="btn-ghost" onClick={() => setAdding(meal)}><Plus size={16} strokeWidth={1.5} />Alimento</button>
                </div>
                <ul className="text-sm">
                  {items.map((l) => (
                    <li key={l.id} className="flex items-center gap-2 border-t border-line">
                      <button className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left" onClick={() => setEditingLog(l)} aria-label={`Editar ${l.food_name}`}>
                        <span className="mr-auto truncate">{l.food_name} <span className="text-fg3">· {num(l.quantity_g)} g</span></span>
                        <span className="figure text-xs text-fg3">{num(l.kcal)} kcal</span>
                      </button>
                      <button className="text-fg3 hover:text-negative" aria-label={`Remover ${l.food_name}`} onClick={async () => {
                        if (await write(supabase.from('food_logs').delete().eq('id', l.id))) void h.foodLogs.reload();
                      }}><X size={16} strokeWidth={1.5} /></button>
                    </li>
                  ))}
                </ul>
                <MealPhotos day={day} meal={meal} />
              </section>
            );
          })}
        </div>

        <aside className="card h-fit">
          <div className="mb-3 flex items-center gap-2">
            <div className="label mr-auto">Meta do dia</div>
            <select className="input w-auto py-1 text-xs" aria-label="Tipo do dia" value={override?.day_type ?? 'auto'} onChange={(e) => setDayType(e.target.value === 'auto' ? null : (e.target.value as 'training' | 'rest'))}>
              <option value="auto">automático ({dayType === 'training' ? 'treino' : 'descanso'})</option>
              <option value="training">dia de treino</option>
              <option value="rest">dia de descanso</option>
            </select>
          </div>
          {target ? (
            <>
              <TargetBar label="Calorias" consumed={totals.kcal} target={target.kcal} unit="kcal" />
              <TargetBar label="Proteína" consumed={totals.protein_g} target={target.protein_g} unit="g" />
              <TargetBar label="Carboidrato" consumed={totals.carbs_g} target={target.carbs_g} unit="g" />
              <TargetBar label="Gordura" consumed={totals.fat_g} target={target.fat_g} unit="g" />
              <p className="text-xs text-fg3">Base: {target.basis} · fibra {num(totals.fiber_g)} g</p>
              {burned > 0 && <p className="mt-1 text-xs text-fg3">Treino do dia: {num(burned)} kcal{estimated ? ' (estimado)' : ''}</p>}
              <button className="btn-ghost mt-3" onClick={() => setAdjusting(true)}>Ajustar macros deste dia</button>
            </>
          ) : (
            <p className="text-sm text-fg3">Cadastre suas metas na aba Plano para comparar o dia. Total até agora: {num(totals.kcal)} kcal · P {num(totals.protein_g)} g · C {num(totals.carbs_g)} g · G {num(totals.fat_g)} g.</p>
          )}
        </aside>
      </div>

      {adding && (
        <FoodSearch title={`Adicionar em ${adding}`} recent={recent} frequent={frequent} onClose={() => setAdding(null)} onPick={async (food: Food, grams: number) => {
          const n = nutrientsFor(food, grams);
          if (await write(supabase.from('food_logs').insert({ date: day, meal: adding, food_id: food.id, food_name: food.name, quantity_g: grams, ...n }))) {
            setAdding(null);
            void h.foodLogs.reload();
          }
        }} />
      )}
      {adjusting && target && <AdjustDay h={h} day={day} current={target} onClose={() => setAdjusting(false)} />}
      {editingLog && <EditLog h={h} log={editingLog} onClose={() => setEditingLog(null)} />}
      {copying && <CopyFrom h={h} toDay={day} meal={copying.meal} onClose={() => setCopying(null)} />}
    </>
  );
}

function EditLog({ h, log, onClose }: { h: Health; log: FoodLog; onClose: () => void }) {
  const [grams, setGrams] = useState(log.quantity_g);
  const [meal, setMeal] = useState(log.meal);
  const preview = rescaleLog(log, grams || 0);
  async function save() {
    if (await write(supabase.from('food_logs').update({
      quantity_g: preview.quantity_g, kcal: preview.kcal, protein_g: preview.protein_g, carbs_g: preview.carbs_g,
      fat_g: preview.fat_g, fiber_g: preview.fiber_g, meal,
    }).eq('id', log.id))) { await h.foodLogs.reload(); onClose(); }
  }
  async function remove() {
    if (await write(supabase.from('food_logs').delete().eq('id', log.id))) { await h.foodLogs.reload(); onClose(); }
  }
  return (
    <Modal title={log.food_name} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Quantidade (g)"><input className="input" type="number" min={1} step="any" value={grams} onChange={(e) => setGrams(Number(e.target.value))} autoFocus /></Field>
        <Field label="Refeição">
          <select className="input" value={meal} onChange={(e) => setMeal(e.target.value)}>
            {MEALS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </Field>
      </div>
      <p className="mb-5 text-sm text-fg2"><span className="figure">{num(preview.kcal)}</span> kcal · Proteína {num(preview.protein_g)} g · Carboidrato {num(preview.carbs_g)} g · Gordura {num(preview.fat_g)} g</p>
      <div className="flex gap-2">
        <button className="btn-ghost text-negative" onClick={remove}>Excluir</button>
        <button className="btn-primary ml-auto" onClick={save} disabled={!grams}>Salvar</button>
      </div>
    </Modal>
  );
}

function CopyFrom({ h, toDay: target, meal, onClose }: { h: Health; toDay: string; meal?: string; onClose: () => void }) {
  const [from, setFrom] = useState(addDays(target, -1));
  const [fromMeal, setFromMeal] = useState(meal ?? '');
  const rows = copyLogs(h.foodLogs.rows, { day: from, meal: fromMeal || undefined }, { day: target, meal: meal });
  async function copy() {
    if (!rows.length) return;
    const clean = rows.map(({ date, meal: m, food_id, food_name, quantity_g, kcal, protein_g, carbs_g, fat_g, fiber_g }) =>
      ({ date, meal: m, food_id, food_name, quantity_g, kcal, protein_g, carbs_g, fat_g, fiber_g }));
    if (await write(supabase.from('food_logs').insert(clean))) { await h.foodLogs.reload(); onClose(); }
  }
  return (
    <Modal title={meal ? `Copiar para ${meal}` : `Copiar para ${formatDay(target)}`} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Do dia"><input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="Refeição de origem">
          <select className="input" value={fromMeal} onChange={(e) => setFromMeal(e.target.value)}>
            {!meal && <option value="">Dia inteiro</option>}
            {MEALS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </Field>
      </div>
      <ul className="mb-5 max-h-48 overflow-y-auto text-sm">
        {rows.map((r, i) => <li key={i} className="flex gap-2 border-t border-line py-1.5"><span className="mr-auto">{r.food_name}</span><span className="figure text-fg3">{num(r.quantity_g)} g</span></li>)}
        {!rows.length && <li className="py-4 text-center text-fg3">Nada registrado nessa origem</li>}
      </ul>
      <button className="btn-primary w-full" onClick={copy} disabled={!rows.length}>Copiar {rows.length} {rows.length === 1 ? 'item' : 'itens'}</button>
    </Modal>
  );
}

function AdjustDay({ h, day, current, onClose }: { h: Health; day: string; current: { kcal: number; protein_g: number; carbs_g: number; fat_g: number }; onClose: () => void }) {
  const o = h.overrides.rows.find((x) => x.date === day);
  const [v, setV] = useState({ kcal: String(o?.kcal ?? ''), protein_g: String(o?.protein_g ?? ''), carbs_g: String(o?.carbs_g ?? ''), fat_g: String(o?.fat_g ?? '') });
  const num = (s: string) => (s === '' ? null : Number(s));
  async function save(clear = false) {
    const row = { date: day, day_type: o?.day_type ?? null, ...(clear ? { kcal: null, protein_g: null, carbs_g: null, fat_g: null } : { kcal: num(v.kcal), protein_g: num(v.protein_g), carbs_g: num(v.carbs_g), fat_g: num(v.fat_g) }) };
    if (await write(supabase.from('diet_day_overrides').upsert(row, { onConflict: 'user_id,date' }))) {
      await h.overrides.reload();
      onClose();
    }
  }
  const field = (k: keyof typeof v, label: string, placeholder: number) => (
    <Field label={label}><input className="input" type="number" min={0} value={v[k]} placeholder={String(placeholder)} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></Field>
  );
  return (
    <Modal title={`Ajuste de ${formatDay(day)}`} onClose={onClose}>
      <p className="mb-3 text-xs text-fg3">Deixe em branco o que deve seguir o plano. Os valores em cinza são os atuais.</p>
      <div className="grid grid-cols-2 gap-2">
        {field('kcal', 'Calorias', current.kcal)}
        {field('protein_g', 'Proteína (g)', current.protein_g)}
        {field('carbs_g', 'Carboidrato (g)', current.carbs_g)}
        {field('fat_g', 'Gordura (g)', current.fat_g)}
      </div>
      <div className="flex gap-2">
        <button className="btn-ghost" onClick={() => save(true)}>Voltar ao plano</button>
        <button className="btn-primary ml-auto" onClick={() => save()}>Salvar ajuste</button>
      </div>
    </Modal>
  );
}

interface Photo { id: string; storage_path: string }

function MealPhotos({ day, meal }: { day: string; meal: string }) {
  const [photos, setPhotos] = useState<(Photo & { url: string })[]>([]);
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data } = await supabase.from('meal_photos').select('id,storage_path').eq('date', day).eq('meal', meal);
    const rows = (data ?? []) as Photo[];
    if (!rows.length) return setPhotos([]);
    const { data: urls } = await supabase.storage.from('meal-photos').createSignedUrls(rows.map((r) => r.storage_path), 3600);
    setPhotos(rows.map((r, i) => ({ ...r, url: urls?.[i]?.signedUrl ?? '' })));
  }
  useEffect(() => { void load(); }, [day, meal]);

  async function upload(file: File) {
    setBusy(true);
    const { data: auth } = await supabase.auth.getUser();
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
    const path = `${auth.user?.id}/${day}-${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from('meal-photos').upload(path, file, { contentType: file.type });
    if (error) alert(`Não foi possível enviar a foto: ${error.message}`);
    else if (await write(supabase.from('meal_photos').insert({ date: day, meal, storage_path: path }))) await load();
    setBusy(false);
  }

  async function remove(p: Photo) {
    if (!confirm('Excluir esta foto?')) return;
    await supabase.storage.from('meal-photos').remove([p.storage_path]);
    if (await write(supabase.from('meal_photos').delete().eq('id', p.id))) await load();
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {photos.map((p) => (
        <figure key={p.id} className="relative">
          <img src={p.url} alt={`Foto de ${meal}`} className="h-16 w-16 rounded-lg object-cover" />
          <button className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-md border border-line bg-surface text-fg2" aria-label="Excluir foto" onClick={() => remove(p)}><X size={14} strokeWidth={1.5} /></button>
        </figure>
      ))}
      <label className={`btn-ghost cursor-pointer text-xs ${busy ? 'opacity-50' : ''}`}>
        <Camera size={16} strokeWidth={1.5} />{busy ? 'Enviando…' : 'Foto do prato'}
        <input type="file" accept="image/*" capture="environment" className="hidden" disabled={busy}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ''; }} />
      </label>
    </div>
  );
}
