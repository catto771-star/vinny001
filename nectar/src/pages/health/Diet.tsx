import { useEffect, useMemo, useState } from 'react';
import { num } from '../../lib/format';
import {
  Camera, CheckCircle2, ChefHat, ChevronDown, ChevronLeft, ChevronRight,
  Copy, Droplets, Plus, Repeat, Sparkles, Split, Undo2, X,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { write } from '../../lib/useTable';
import { addDays, formatDay, toDay } from '../../lib/dates';
import { MEALS, netCarbsG, nutrientsFor, sumNutrients, type Food, type FoodLog } from '../../lib/nutrition';
import { copyLogs, frequentFoods, recentFoods, rescaleLog } from '../../lib/diary';
import {
  HIGHLIGHTED_KEYS,
  MICRONUTRIENTS,
  computeNutrientBalances,
  computeNutritionScores,
  rdaFor,
  sumMicronutrients,
} from '../../lib/micronutrients';
import { computeEnergySummary } from '../../lib/metabolism';
import { NutrientRing, TargetBar } from '../../components/Charts';
import { Field, Modal } from '../../components/ui';
import FoodSearch, { type FoodPickMeta } from './FoodSearch';
import RecipesAndMealsModal from './RecipesAndMealsModal';
import { energyForDay } from './energyForDay';
import { DEFAULT_WEIGHT_KG, type Health } from './useHealth';

const I = { size: 16, strokeWidth: 1.5, 'aria-hidden': true } as const;

export default function Diet({ h, onOpenOracle }: { h: Health; onOpenOracle?: () => void }) {
  const [day, setDay] = useState(toDay(new Date()));
  const [adding, setAdding] = useState<string | null>(null);
  const [recipesModalMeal, setRecipesModalMeal] = useState<string | null>(null);
  const [adjusting, setAdjusting] = useState(false);
  const [editingLog, setEditingLog] = useState<FoodLog | null>(null);
  const [copying, setCopying] = useState<{ meal?: string } | null>(null);
  const [customWaterModal, setCustomWaterModal] = useState(false);
  const [customWaterMl, setCustomWaterMl] = useState('350');
  const [showAllMicros, setShowAllMicros] = useState(false);
  const [netCarbsToggle, setNetCarbsToggle] = useState<boolean | null>(null);
  const [noteDraft, setNoteDraft] = useState('');

  const logs = useMemo(() => h.foodLogs.rows.filter((l) => l.date === day), [h.foodLogs.rows, day]);
  const dayWaterLogs = useMemo(() => h.waterLogs.rows.filter((w) => w.date === day), [h.waterLogs.rows, day]);
  const recent = useMemo(() => recentFoods(h.foodLogs.rows), [h.foodLogs.rows]);
  const frequent = useMemo(() => frequentFoods(h.foodLogs.rows), [h.foodLogs.rows]);
  const totals = useMemo(() => sumNutrients(logs), [logs]);
  const micros = useMemo(() => sumMicronutrients(logs), [logs]);
  const { burned, estimated, dayType, target } = energyForDay(h, day);
  const override = h.overrides.rows.find((o) => o.date === day);

  useEffect(() => {
    setNoteDraft(override?.notes ?? '');
  }, [day, override?.notes]);

  const useNetCarbs = netCarbsToggle ?? !!h.profile?.net_carbs_mode;
  const displayedCarbs = useNetCarbs ? netCarbsG(totals.carbs_g, totals.fiber_g) : totals.carbs_g;

  // Check if Macro Scheduler has a named template assigned to this weekday
  const weekdayNum = new Date(`${day}T12:00:00`).getDay();
  const scheduledTemplate = h.macroTemplates.rows.find((t) => t.weekdays?.includes(weekdayNum));
  const effectiveTarget = useMemo(() => {
    if (override && (override.kcal ?? override.protein_g ?? override.carbs_g ?? override.fat_g) != null && target) {
      return target;
    }
    if (scheduledTemplate) {
      return {
        kcal: scheduledTemplate.kcal,
        protein_g: scheduledTemplate.protein_g,
        carbs_g: scheduledTemplate.carbs_g,
        fat_g: scheduledTemplate.fat_g,
        basis: `agenda: ${scheduledTemplate.name}`,
      };
    }
    return target;
  }, [override, scheduledTemplate, target]);

  // Energy summary (BMR + Baseline Activity + Exercise + TEF)
  const energySummary = useMemo(
    () =>
      computeEnergySummary({
        consumedKcal: totals.kcal,
        macros: totals,
        metabolic: {
          weightKg: h.latestWeight ?? DEFAULT_WEIGHT_KG,
          heightCm: h.profile?.height_cm,
          sex: h.profile?.sex,
          birthDate: h.profile?.birth_date,
          bodyFatPct: h.latestBodyFatPct,
          customBmr: h.profile?.custom_bmr,
          asOfDate: day,
        },
        activityLevel: h.profile?.activity_level ?? 'lightly_active',
        exerciseBurnedKcal: burned,
        includeTef: h.profile?.include_tef ?? true,
        targetKcal: effectiveTarget?.kcal ?? null,
      }),
    [totals, h.latestWeight, h.profile, h.latestBodyFatPct, day, burned, effectiveTarget?.kcal],
  );

  // Hydration
  const waterGoalMl = h.profile?.water_goal_ml ?? 2500;
  const waterCupMl = h.profile?.water_cup_ml ?? 250;
  const drunkMl = dayWaterLogs.reduce((acc, w) => acc + w.ml, 0);
  const totalWaterMl = Math.round(drunkMl + (micros.water_g || 0));
  const filledCups = Math.floor(drunkMl / waterCupMl);
  const totalCups = Math.max(6, Math.min(12, Math.round(waterGoalMl / waterCupMl)));

  // Nutrition Scores & Balances
  const scores = useMemo(() => computeNutritionScores(micros, h.profile?.sex), [micros, h.profile?.sex]);
  const balances = useMemo(() => computeNutrientBalances(micros, totals.protein_g), [micros, totals.protein_g]);

  // Pending Repeat Items for this weekday
  const pendingRepeats = useMemo(() => {
    return h.repeatItems.rows.filter(
      (ri) =>
        ri.active
        && ri.weekdays?.includes(weekdayNum)
        && !logs.some((l) => l.meal === ri.meal && l.food_name === ri.food_name),
    );
  }, [h.repeatItems.rows, weekdayNum, logs]);

  async function toggleFavorite(foodId: string) {
    if (h.favoriteIds.has(foodId)) {
      if (await write(supabase.from('favorite_foods').delete().eq('food_id', foodId))) {
        await h.favorites.reload();
      }
    } else {
      if (await write(supabase.from('favorite_foods').insert({ food_id: foodId }))) {
        await h.favorites.reload();
      }
    }
  }

  async function upsertDayMeta(patch: { day_type?: 'training' | 'rest' | null; completed?: boolean; notes?: string | null }) {
    const ok = await write(
      supabase.from('diet_day_overrides').upsert(
        {
          date: day,
          day_type: patch.day_type !== undefined ? patch.day_type : (override?.day_type ?? null),
          kcal: override?.kcal ?? null,
          protein_g: override?.protein_g ?? null,
          carbs_g: override?.carbs_g ?? null,
          fat_g: override?.fat_g ?? null,
          completed: patch.completed !== undefined ? patch.completed : (override?.completed ?? false),
          notes: patch.notes !== undefined ? patch.notes : (override?.notes ?? null),
        },
        { onConflict: 'user_id,date' },
      ),
    );
    if (ok) void h.overrides.reload();
  }

  async function addWater(ml: number) {
    const nowTime = new Date().toTimeString().slice(0, 5);
    if (await write(supabase.from('water_logs').insert({ date: day, ml: Math.round(ml), logged_time: nowTime }))) {
      await h.waterLogs.reload();
    }
  }

  async function undoLastWater() {
    const last = dayWaterLogs[dayWaterLogs.length - 1];
    if (!last) return;
    if (await write(supabase.from('water_logs').delete().eq('id', last.id))) {
      await h.waterLogs.reload();
    }
  }

  async function applyPendingRepeats() {
    if (!pendingRepeats.length) return;
    const rows = pendingRepeats.map((ri) => ({
      date: day,
      meal: ri.meal,
      food_id: ri.food_id,
      food_name: ri.food_name,
      quantity_g: ri.quantity_g,
      measure_label: ri.measure_label,
      measure_qty: ri.measure_qty,
      kcal: ri.kcal,
      protein_g: ri.protein_g,
      carbs_g: ri.carbs_g,
      fat_g: ri.fat_g,
      fiber_g: ri.fiber_g,
      nutrients: ri.nutrients ?? {},
      is_supplement: ri.is_supplement,
    }));
    if (await write(supabase.from('food_logs').insert(rows))) {
      await h.foodLogs.reload();
    }
  }

  /** Cronometer-style "Explode": replaces a logged Recipe or Custom Meal row with its individual ingredient rows. */
  async function explodeEntry(log: FoodLog) {
    if (!log.group_name) return;
    const [kind, id, multRaw] = log.group_name.split(':');
    const mult = Number(multRaw || 1) || 1;
    let expandedRows: Record<string, unknown>[] = [];

    if (kind === 'meal') {
      const cm = h.customMeals.rows.find((x) => x.id === id);
      if (!cm?.items?.length) return alert('Os itens originais desta refeição não foram encontrados.');
      expandedRows = cm.items.map((it) => ({
        date: log.date,
        meal: log.meal,
        food_id: it.food_id,
        food_name: it.food_name,
        quantity_g: Math.round(it.quantity_g * mult * 10) / 10,
        kcal: Math.round(it.kcal * mult),
        protein_g: Math.round(it.protein_g * mult * 10) / 10,
        carbs_g: Math.round(it.carbs_g * mult * 10) / 10,
        fat_g: Math.round(it.fat_g * mult * 10) / 10,
        fiber_g: Math.round((it.fiber_g || 0) * mult * 10) / 10,
        nutrients: it.nutrients ?? {},
        logged_time: log.logged_time ?? null,
      }));
    } else if (kind === 'recipe') {
      const rec = h.customRecipes.rows.find((x) => x.id === id);
      if (!rec?.items?.length) return alert('Os ingredientes originais desta receita não foram encontrados.');
      const scale = mult / Math.max(1, rec.servings);
      expandedRows = rec.items.map((it) => ({
        date: log.date,
        meal: log.meal,
        food_id: it.food_id,
        food_name: it.food_name,
        quantity_g: Math.max(1, Math.round(it.quantity_g * scale * 10) / 10),
        kcal: Math.round(it.kcal * scale),
        protein_g: Math.round(it.protein_g * scale * 10) / 10,
        carbs_g: Math.round(it.carbs_g * scale * 10) / 10,
        fat_g: Math.round(it.fat_g * scale * 10) / 10,
        fiber_g: Math.round((it.fiber_g || 0) * scale * 10) / 10,
        nutrients: it.nutrients ?? {},
        logged_time: log.logged_time ?? null,
      }));
    }

    if (!expandedRows.length) return;
    if (await write(supabase.from('food_logs').insert(expandedRows))) {
      await write(supabase.from('food_logs').delete().eq('id', log.id));
      await h.foodLogs.reload();
    }
  }

  return (
    <>
      {/* Top Day Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button className="btn-ghost" onClick={() => setDay(addDays(day, -1))} aria-label="Dia anterior">
          <ChevronLeft {...I} />
        </button>
        <span className="min-w-44 text-center font-medium">{formatDay(day)}</span>
        <button className="btn-ghost" onClick={() => setDay(addDays(day, 1))} aria-label="Próximo dia">
          <ChevronRight {...I} />
        </button>
        {day !== toDay(new Date()) && (
          <button className="btn-ghost" onClick={() => setDay(toDay(new Date()))}>Hoje</button>
        )}

        <button
          type="button"
          className={`btn-secondary text-xs ${override?.completed ? 'border-positive text-positive' : ''}`}
          onClick={() => void upsertDayMeta({ completed: !override?.completed })}
        >
          <CheckCircle2 {...I} />
          {override?.completed ? 'Dia completo' : 'Marcar dia completo'}
        </button>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button type="button" className="btn-secondary text-xs" onClick={() => setRecipesModalMeal('Almoço')}>
            <ChefHat {...I} /> Receitas & Refeições
          </button>
          {onOpenOracle && (
            <button type="button" className="btn-secondary text-xs" onClick={onOpenOracle}>
              <Sparkles {...I} /> Oráculo IA
            </button>
          )}
          <button type="button" className="btn-secondary text-xs" onClick={() => setCopying({})}>
            <Copy {...I} /> Copiar dia
          </button>
        </div>
      </div>

      {/* Repeat Items Auto-Log Banner */}
      {pendingRepeats.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-raised/50 px-4 py-2.5 text-sm">
          <span className="inline-flex items-center gap-2 text-fg2">
            <Repeat size={15} strokeWidth={1.5} className="text-brand" />
            Você tem <strong>{pendingRepeats.length}</strong> {pendingRepeats.length === 1 ? 'item recorrente agendado' : 'itens recorrentes agendados'} para hoje ({pendingRepeats.map((p) => p.food_name).join(', ')}).
          </span>
          <button type="button" className="btn-primary h-8 px-3 text-xs" onClick={() => void applyPendingRepeats()}>
            Lançar recorrentes
          </button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* Left Column: Hydration + Meals + Day Note */}
        <div className="min-w-0 space-y-3">
          {/* Dedicated Hydration Widget */}
          <section className="card">
            <div className="mb-2.5 flex flex-wrap items-center gap-2">
              <Droplets {...I} className="text-info" />
              <div className="mr-auto">
                <span className="font-medium text-fg">Água</span>
                <span className="figure ml-2 text-xs text-fg2">
                  {num(drunkMl)} / {num(waterGoalMl)} mL
                </span>
                {micros.water_g > 0 && (
                  <span className="figure ml-2 text-xs text-fg3">
                    (Total c/ alimentos: {num(totalWaterMl)} mL)
                  </span>
                )}
              </div>
              {dayWaterLogs.length > 0 && (
                <button type="button" className="btn-ghost h-7 px-2 text-xs text-fg3" onClick={() => void undoLastWater()} title="Desfazer último copo">
                  <Undo2 size={14} strokeWidth={1.5} />
                </button>
              )}
              <button type="button" className="btn-ghost h-7 px-2 text-xs" onClick={() => setCustomWaterModal(true)}>
                <Plus size={14} strokeWidth={1.5} /> Outro valor
              </button>
            </div>
            <div className="mb-2.5 h-1.5 rounded-full bg-raised">
              <div
                className="h-1.5 rounded-full transition-[width] duration-300"
                style={{ width: `${Math.min(100, (drunkMl / waterGoalMl) * 100)}%`, background: 'var(--info)' }}
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {Array.from({ length: totalCups }).map((_, idx) => {
                const filled = idx < filledCups;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => void addWater(waterCupMl)}
                    className={`inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-xs transition-colors ${
                      filled
                        ? 'border-info/50 bg-raised text-fg'
                        : 'border-line text-fg3 hover:border-line-strong hover:text-fg2'
                    }`}
                    title={`Adicionar +${waterCupMl} mL`}
                  >
                    <Droplets size={13} strokeWidth={1.5} className={filled ? 'text-info' : 'text-fg3'} />
                    <span className="figure">+{waterCupMl}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Meal Groups */}
          {MEALS.map((meal) => {
            const items = logs.filter((l) => l.meal === meal);
            const sub = sumNutrients(items);
            return (
              <section key={meal} className="card">
                <div className="mb-2 flex items-start gap-2">
                  <div className="min-w-0">
                    <h3 className="font-medium">{meal}</h3>
                    {items.length > 0 && (
                      <div className="text-xs text-fg3">
                        <span className="figure">{num(sub.kcal)}</span> kcal · P {num(sub.protein_g)} · C {num(useNetCarbs ? netCarbsG(sub.carbs_g, sub.fiber_g) : sub.carbs_g)} · G {num(sub.fat_g)}
                      </div>
                    )}
                  </div>
                  <button
                    className="icon-btn ml-auto"
                    onClick={() => setCopying({ meal })}
                    aria-label={`Copiar ${meal} de outro dia`}
                    title="Copiar de outro dia"
                  >
                    <Copy {...I} />
                  </button>
                  <button
                    type="button"
                    className="btn-ghost h-8 px-2 text-xs"
                    onClick={() => setRecipesModalMeal(meal)}
                    title="Lançar receita ou refeição salva"
                  >
                    <ChefHat size={15} strokeWidth={1.5} />
                  </button>
                  <button className="btn-ghost" onClick={() => setAdding(meal)}>
                    <Plus {...I} />Alimento
                  </button>
                </div>

                <ul className="text-sm">
                  {items.map((l) => {
                    const canExplode = !!l.group_name && (l.group_name.startsWith('meal:') || l.group_name.startsWith('recipe:'));
                    const measureDesc = l.measure_label && l.measure_label !== 'Gramas (g)' && l.measure_label !== 'g'
                      ? `${num(l.measure_qty ?? 1)} × ${l.measure_label} (${num(l.quantity_g)} g)`
                      : `${num(l.quantity_g)} g`;
                    return (
                      <li key={l.id} className="flex items-center gap-2 border-t border-line">
                        <button
                          className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left"
                          onClick={() => setEditingLog(l)}
                          aria-label={`Editar ${l.food_name}`}
                        >
                          {l.logged_time && (
                            <span className="figure shrink-0 rounded bg-raised px-1.5 py-0.5 text-[11px] text-fg3">
                              {l.logged_time.slice(0, 5)}
                            </span>
                          )}
                          <span className="mr-auto truncate">
                            {l.food_name} <span className="text-fg3">· {measureDesc}</span>
                          </span>
                          <span className="figure shrink-0 text-xs text-fg3">{num(l.kcal)} kcal</span>
                        </button>
                        {canExplode && (
                          <button
                            type="button"
                            className="rounded border border-line px-1.5 py-0.5 text-[11px] text-fg2 hover:bg-raised hover:text-fg"
                            title="Explodir em ingredientes individuais"
                            onClick={() => void explodeEntry(l)}
                          >
                            <Split size={12} strokeWidth={1.5} className="mr-0.5 inline" />
                            Explodir
                          </button>
                        )}
                        <button
                          className="text-fg3 hover:text-negative"
                          aria-label={`Remover ${l.food_name}`}
                          onClick={async () => {
                            if (await write(supabase.from('food_logs').delete().eq('id', l.id))) void h.foodLogs.reload();
                          }}
                        >
                          <X {...I} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <MealPhotos day={day} meal={meal} />
              </section>
            );
          })}

          {/* Diary Day Note */}
          <section className="card">
            <div className="mb-2 flex items-center justify-between">
              <span className="label">Nota do diário ({formatDay(day).split(',')[0]})</span>
              {noteDraft !== (override?.notes ?? '') && (
                <button
                  type="button"
                  className="btn-secondary h-7 px-2.5 text-xs"
                  onClick={() => void upsertDayMeta({ notes: noteDraft.trim() || null })}
                >
                  Salvar nota
                </button>
              )}
            </div>
            <textarea
              rows={2}
              className="input resize-none text-sm"
              placeholder="Registre digestão, energia, fome, refeição livre ou sintomas do dia…"
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
            />
          </section>
        </div>

        {/* Right Column: Energy Summary + Macros + Scores + Highlighted Rings + Balances + 26 Micros */}
        <aside className="space-y-4">
          {/* 1. Cronometer Energy Summary */}
          <section className="card">
            <div className="mb-3 flex items-center gap-2">
              <div className="label mr-auto">Resumo Energético</div>
              <select
                className="input w-auto py-1 text-xs"
                aria-label="Tipo do dia"
                value={override?.day_type ?? 'auto'}
                onChange={(e) => void upsertDayMeta({ day_type: e.target.value === 'auto' ? null : (e.target.value as 'training' | 'rest') })}
              >
                <option value="auto">automático ({dayType === 'training' ? 'treino' : 'descanso'})</option>
                <option value="training">dia de treino</option>
                <option value="rest">dia de descanso</option>
              </select>
            </div>

            <div className="mb-4 grid grid-cols-3 gap-2 rounded-xl border border-line bg-raised/40 p-3 text-center">
              <div>
                <div className="text-[11px] text-fg3">Consumido</div>
                <div className="figure mt-0.5 text-base font-medium text-fg">{num(energySummary.consumed)}</div>
                <div className="text-[10px] text-fg3">kcal</div>
              </div>
              <div className="border-x border-line px-1">
                <div className="text-[11px] text-fg3">Gasto total</div>
                <div className="figure mt-0.5 text-base font-medium text-fg">{num(energySummary.totalExpenditure)}</div>
                <div className="text-[10px] text-fg3">TMB+Ativ+TEF</div>
              </div>
              <div>
                <div className="text-[11px] text-fg3">
                  {energySummary.remainingToTarget !== null ? 'Restante' : 'Balanço'}
                </div>
                <div className={`figure mt-0.5 text-base font-medium ${
                  (energySummary.remainingToTarget ?? -energySummary.netBalance) < 0 ? 'text-negative' : 'text-positive'
                }`}>
                  {num(energySummary.remainingToTarget ?? energySummary.netBalance)}
                </div>
                <div className="text-[10px] text-fg3">kcal</div>
              </div>
            </div>

            <div className="mb-4 flex flex-wrap justify-between gap-x-2 gap-y-1 text-[11px] text-fg3">
              <span>TMB: <strong className="figure text-fg2">{num(energySummary.bmr)}</strong></span>
              <span>Ativ.: <strong className="figure text-fg2">{num(energySummary.baselineActivity)}</strong></span>
              <span>Treino: <strong className="figure text-fg2">{num(burned)}{estimated && burned > 0 ? '*' : ''}</strong></span>
              <span>TEF: <strong className="figure text-fg2">{num(energySummary.tef)}</strong></span>
            </div>

            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-fg2">Metas de Macronutrientes</span>
              <button
                type="button"
                className="text-[11px] text-fg3 underline hover:text-fg"
                onClick={() => setNetCarbsToggle(!useNetCarbs)}
              >
                {useNetCarbs ? 'Usando Carbo Líquido' : 'Usar Carbo Líquido'}
              </button>
            </div>

            {effectiveTarget ? (
              <>
                <TargetBar label="Calorias" consumed={totals.kcal} target={effectiveTarget.kcal} unit="kcal" />
                <TargetBar label="Proteína" consumed={totals.protein_g} target={effectiveTarget.protein_g} unit="g" />
                <TargetBar
                  label={useNetCarbs ? 'Carboidratos Líquidos' : 'Carboidrato'}
                  consumed={displayedCarbs}
                  target={effectiveTarget.carbs_g}
                  unit="g"
                />
                <TargetBar label="Gordura" consumed={totals.fat_g} target={effectiveTarget.fat_g} unit="g" />
                <p className="text-xs text-fg3">
                  Base: {effectiveTarget.basis} · fibra <span className="figure">{num(totals.fiber_g)} g</span>
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button className="btn-ghost h-8 px-2 text-xs" onClick={() => setAdjusting(true)}>
                    Ajustar macros deste dia
                  </button>
                  {onOpenOracle && (
                    <button type="button" className="btn-secondary ml-auto h-8 px-2.5 text-xs" onClick={onOpenOracle}>
                      <Sparkles size={13} strokeWidth={1.5} /> Sugerir alimentos
                    </button>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-fg3">
                Cadastre suas metas na aba Plano para comparar o dia. Total até agora: {num(totals.kcal)} kcal · P {num(totals.protein_g)} g · C {num(displayedCarbs)} g · G {num(totals.fat_g)} g.
              </p>
            )}
          </section>

          {/* 2. Highlighted Micronutrients (8 Circular Rings) */}
          <section className="card">
            <div className="label mb-3">Nutrientes em Destaque</div>
            <div className="grid grid-cols-4 gap-y-4 gap-x-2">
              {HIGHLIGHTED_KEYS.map((key) => {
                const meta = MICRONUTRIENTS.find((m) => m.key === key)!;
                const rda = rdaFor(meta, h.profile?.sex);
                const val = micros[key] ?? 0;
                const pct = rda > 0 ? Math.round((val / rda) * 100) : 0;
                const over = meta.ul !== undefined && val > meta.ul;
                return (
                  <NutrientRing
                    key={key}
                    label={meta.shortLabel}
                    pct={pct}
                    sublabel={`${num(val, val < 10 ? 1 : 0)}${meta.unit}`}
                    size={58}
                    overLimit={over}
                  />
                );
              })}
            </div>
          </section>

          {/* 3. Nutrition Scores */}
          <section className="card">
            <div className="label mb-3">Nutrition Scores</div>
            <div className="space-y-2.5">
              {scores.map((s) => (
                <div key={s.id} title={s.detail}>
                  <div className="mb-1 flex items-baseline justify-between text-xs">
                    <span className="text-fg2">{s.label}</span>
                    <span className="figure font-medium text-fg">{s.pct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-raised">
                    <div
                      className="h-1.5 rounded-full transition-[width] duration-300"
                      style={{ width: `${s.pct}%`, background: s.pct >= 80 ? 'var(--positive)' : 'var(--brand)' }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* 4. Nutrient Balances (Ratios + PRAL) */}
          <section className="card">
            <div className="label mb-2.5">Equilíbrio Nutricional</div>
            <ul className="divide-y divide-line text-xs">
              {balances.map((b) => (
                <li key={b.id} className="flex items-center justify-between py-2">
                  <div>
                    <div className="font-medium text-fg2">{b.label}</div>
                    <div className="text-[11px] text-fg3">Ideal: {b.idealRange}</div>
                  </div>
                  <span className={`figure font-medium ${
                    b.status === 'optimal' ? 'text-positive' : b.status === 'empty' ? 'text-fg3' : 'text-warning'
                  }`}>
                    {b.valueLabel}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {/* 5. Full 26 Micronutrient Breakdown */}
          <section className="card">
            <button
              type="button"
              className="flex w-full items-center justify-between text-left"
              onClick={() => setShowAllMicros(!showAllMicros)}
            >
              <span className="label">Tabela Completa de Micronutrientes ({MICRONUTRIENTS.length})</span>
              <ChevronDown
                size={16}
                strokeWidth={1.5}
                className={`text-fg3 transition-transform ${showAllMicros ? 'rotate-180' : ''}`}
              />
            </button>

            {showAllMicros && (
              <div className="mt-3 space-y-4 border-t border-line pt-3">
                {(['Minerais', 'Vitaminas', 'Lipídios & Outros'] as const).map((cat) => (
                  <div key={cat}>
                    <div className="mb-1.5 text-xs font-medium text-fg">{cat}</div>
                    <ul className="divide-y divide-line text-xs">
                      {MICRONUTRIENTS.filter((m) => m.category === cat).map((m) => {
                        const val = micros[m.key] ?? 0;
                        const rda = rdaFor(m, h.profile?.sex);
                        const pct = rda > 0 ? Math.round((val / rda) * 100) : 0;
                        const overUl = m.ul !== undefined && val > m.ul;
                        return (
                          <li key={m.key} className="py-1.5">
                            <div className="flex items-baseline justify-between">
                              <span className="text-fg2">{m.label}</span>
                              <span className={`figure ${overUl ? 'text-negative font-medium' : 'text-fg'}`}>
                                {num(val, val > 0 && val < 10 ? 1 : 0)} / {num(rda)} {m.unit} ({pct}%)
                              </span>
                            </div>
                            <div className="mt-1 h-1 rounded-full bg-raised">
                              <div
                                className="h-1 rounded-full"
                                style={{
                                  width: `${Math.min(100, pct)}%`,
                                  background: overUl ? 'var(--negative)' : pct >= 100 ? 'var(--positive)' : 'var(--brand)',
                                }}
                              />
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>

      {adding && (
        <FoodSearch
          title={`Adicionar em ${adding}`}
          recent={recent}
          frequent={frequent}
          favoriteIds={h.favoriteIds}
          onToggleFavorite={toggleFavorite}
          allowTimestamp
          onClose={() => setAdding(null)}
          onPick={async (food: Food, grams: number, meta?: FoodPickMeta) => {
            const n = nutrientsFor(food, grams);
            if (await write(supabase.from('food_logs').insert({
              date: day,
              meal: adding,
              food_id: food.id,
              food_name: food.name,
              quantity_g: grams,
              ...n,
              nutrients: meta?.nutrients ?? {},
              measure_label: meta?.measure_label ?? 'g',
              measure_qty: meta?.measure_qty ?? grams,
              logged_time: meta?.logged_time ?? null,
              is_supplement: meta?.is_supplement ?? !!food.is_supplement,
            }))) {
              setAdding(null);
              void h.foodLogs.reload();
            }
          }}
        />
      )}

      {recipesModalMeal && (
        <RecipesAndMealsModal
          h={h}
          day={day}
          defaultMeal={recipesModalMeal}
          onClose={() => setRecipesModalMeal(null)}
        />
      )}

      {customWaterModal && (
        <Modal title="Registrar água" onClose={() => setCustomWaterModal(false)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await addWater(Number(customWaterMl));
              setCustomWaterModal(false);
            }}
          >
            <Field label="Volume (mL)">
              <input
                className="input figure"
                type="number"
                min={10}
                max={5000}
                step={10}
                value={customWaterMl}
                onChange={(e) => setCustomWaterMl(e.target.value)}
                autoFocus
                required
              />
            </Field>
            <button className="btn-primary w-full justify-center">Adicionar água</button>
          </form>
        </Modal>
      )}

      {adjusting && effectiveTarget && <AdjustDay h={h} day={day} current={effectiveTarget} onClose={() => setAdjusting(false)} />}
      {editingLog && <EditLog h={h} log={editingLog} onClose={() => setEditingLog(null)} />}
      {copying && <CopyFrom h={h} toDay={day} meal={copying.meal} onClose={() => setCopying(null)} />}
    </>
  );
}

function EditLog({ h, log, onClose }: { h: Health; log: FoodLog; onClose: () => void }) {
  const [grams, setGrams] = useState(log.quantity_g);
  const [meal, setMeal] = useState(log.meal);
  const [loggedTime, setLoggedTime] = useState(log.logged_time ?? '');
  const preview = rescaleLog(log, grams || 0);

  async function save() {
    const ratio = log.quantity_g > 0 ? (grams || 0) / log.quantity_g : 1;
    const scaledMicros: Record<string, number> = {};
    if (log.nutrients) {
      for (const [k, v] of Object.entries(log.nutrients)) {
        if (typeof v === 'number') scaledMicros[k] = Math.round(v * ratio * 100) / 100;
      }
    }
    if (await write(supabase.from('food_logs').update({
      quantity_g: preview.quantity_g,
      kcal: preview.kcal,
      protein_g: preview.protein_g,
      carbs_g: preview.carbs_g,
      fat_g: preview.fat_g,
      fiber_g: preview.fiber_g,
      meal,
      logged_time: loggedTime || null,
      measure_label: 'g',
      measure_qty: preview.quantity_g,
      nutrients: scaledMicros,
    }).eq('id', log.id))) {
      await h.foodLogs.reload();
      onClose();
    }
  }

  async function remove() {
    if (await write(supabase.from('food_logs').delete().eq('id', log.id))) {
      await h.foodLogs.reload();
      onClose();
    }
  }

  return (
    <Modal title={log.food_name} onClose={onClose}>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Quantidade (g)">
          <input className="input" type="number" min={1} step="any" value={grams} onChange={(e) => setGrams(Number(e.target.value))} autoFocus />
        </Field>
        <Field label="Refeição">
          <select className="input" value={meal} onChange={(e) => setMeal(e.target.value)}>
            {MEALS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </Field>
        <Field label="Horário">
          <input className="input" type="time" value={loggedTime} onChange={(e) => setLoggedTime(e.target.value)} />
        </Field>
      </div>
      <p className="mb-5 text-sm text-fg2">
        <span className="figure">{num(preview.kcal)}</span> kcal · Proteína {num(preview.protein_g)} g · Carboidrato {num(preview.carbs_g)} g · Gordura {num(preview.fat_g)} g
      </p>
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
  const rows = copyLogs(h.foodLogs.rows, { day: from, meal: fromMeal || undefined }, { day: target, meal });

  async function copy() {
    if (!rows.length) return;
    const clean = rows.map(({ date, meal: m, food_id, food_name, quantity_g, kcal, protein_g, carbs_g, fat_g, fiber_g, nutrients, measure_label, measure_qty, is_supplement }) =>
      ({ date, meal: m, food_id, food_name, quantity_g, kcal, protein_g, carbs_g, fat_g, fiber_g, nutrients: nutrients ?? {}, measure_label, measure_qty, is_supplement: !!is_supplement }));
    if (await write(supabase.from('food_logs').insert(clean))) {
      await h.foodLogs.reload();
      onClose();
    }
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
      <button className="btn-primary w-full justify-center" onClick={copy} disabled={!rows.length}>
        Copiar {rows.length} {rows.length === 1 ? 'item' : 'itens'}
      </button>
    </Modal>
  );
}

function AdjustDay({ h, day, current, onClose }: { h: Health; day: string; current: { kcal: number; protein_g: number; carbs_g: number; fat_g: number }; onClose: () => void }) {
  const o = h.overrides.rows.find((x) => x.date === day);
  const [v, setV] = useState({ kcal: String(o?.kcal ?? ''), protein_g: String(o?.protein_g ?? ''), carbs_g: String(o?.carbs_g ?? ''), fat_g: String(o?.fat_g ?? '') });
  const toNum = (s: string) => (s === '' ? null : Number(s));

  async function save(clear = false) {
    const row = {
      date: day,
      day_type: o?.day_type ?? null,
      completed: o?.completed ?? false,
      notes: o?.notes ?? null,
      ...(clear ? { kcal: null, protein_g: null, carbs_g: null, fat_g: null } : { kcal: toNum(v.kcal), protein_g: toNum(v.protein_g), carbs_g: toNum(v.carbs_g), fat_g: toNum(v.fat_g) }),
    };
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
          <button className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-md border border-line bg-surface text-fg2" aria-label="Excluir foto" onClick={() => remove(p)}><X size={14} strokeWidth={1.5} /></button>
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
