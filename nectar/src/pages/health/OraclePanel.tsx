import { useEffect, useMemo, useState } from 'react';
import { Bot, Plus, Search, Sparkles } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { write } from '../../lib/useTable';
import { toDay } from '../../lib/dates';
import { num } from '../../lib/format';
import { MEALS, nutrientsFor, sumNutrients, type Food } from '../../lib/nutrition';
import {
  MICRONUTRIENTS,
  buildOracleAiPrompt,
  micronutrientsPer100g,
  rankFoodsByNutrient,
  rdaFor,
  scaleMicronutrients,
  sumMicronutrients,
  type OracleNutrientKey,
  type OracleRankMode,
} from '../../lib/micronutrients';
import { openAssistantDrawer } from '../../components/AssistantDrawer';
import { energyForDay } from './energyForDay';
import type { Health } from './useHealth';

const I = { size: 16, strokeWidth: 1.5, 'aria-hidden': true } as const;

const DIETS = ['Nenhuma', 'Vegetariana', 'Vegana', 'Pescetariana', 'Sem Glúten', 'Low-Carb / Keto'] as const;
const EXCLUSIONS = ['Laticínios', 'Ovos', 'Peixe', 'Amendoim', 'Soja', 'Castanhas'] as const;

const COLUMNS = 'id,name,brand,source,country,kcal,protein_g,carbs_g,fat_g,fiber_g,default_serving_g,nutrients,measures,is_supplement';

export default function OraclePanel({ h }: { h: Health }) {
  const today = toDay(new Date());
  const [catalog, setCatalog] = useState<Food[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);

  // AI Suggester state
  const [meal, setMeal] = useState<string>('Jantar');
  const [diet, setDiet] = useState<string>('Nenhuma');
  const [exclusions, setExclusions] = useState<string[]>([]);

  // Nutrient Oracle ranking state
  const [nutrient, setNutrient] = useState<OracleNutrientKey>('potassium_mg');
  const [rankMode, setRankMode] = useState<OracleRankMode>('oracle');
  const [filterText, setFilterText] = useState('');

  useEffect(() => {
    let active = true;
    supabase
      .from('foods')
      .select(COLUMNS)
      .limit(400)
      .then(({ data }) => {
        if (active) {
          setCatalog((data ?? []) as Food[]);
          setLoadingCatalog(false);
        }
      });
    return () => { active = false; };
  }, []);

  const todayLogs = useMemo(() => h.foodLogs.rows.filter((l) => l.date === today), [h.foodLogs.rows, today]);
  const totals = useMemo(() => sumNutrients(todayLogs), [todayLogs]);
  const micros = useMemo(() => sumMicronutrients(todayLogs), [todayLogs]);
  const { target } = energyForDay(h, today);

  const remaining = useMemo(() => ({
    kcal: Math.max(0, (target?.kcal ?? 2000) - totals.kcal),
    protein_g: Math.max(0, Math.round(((target?.protein_g ?? 140) - totals.protein_g) * 10) / 10),
    carbs_g: Math.max(0, Math.round(((target?.carbs_g ?? 200) - totals.carbs_g) * 10) / 10),
    fat_g: Math.max(0, Math.round(((target?.fat_g ?? 65) - totals.fat_g) * 10) / 10),
  }), [target, totals]);

  const lowestMicronutrients = useMemo(() => {
    const sex = h.profile?.sex;
    return MICRONUTRIENTS
      .filter((m) => !['sodium_mg', 'cholesterol_mg', 'sugars_g', 'caffeine_mg', 'water_g'].includes(m.key))
      .map((m) => {
        const t = rdaFor(m, sex);
        const c = micros[m.key] ?? 0;
        const pct = t > 0 ? Math.round((c / t) * 100) : 100;
        return { key: m.key, label: m.label, shortLabel: m.shortLabel, pct, consumed: c, target: t, unit: m.unit };
      })
      .sort((a, b) => a.pct - b.pct)
      .slice(0, 4);
  }, [micros, h.profile?.sex]);

  // Quick local matches for the #1 deficient nutrient within remaining kcal
  const smartMatches = useMemo(() => {
    const topGap = lowestMicronutrients[0]?.key ?? 'protein_g';
    return rankFoodsByNutrient(catalog, topGap, 'oracle', 6);
  }, [catalog, lowestMicronutrients]);

  const oracleHits = useMemo(() => {
    const pool = filterText.trim()
      ? catalog.filter((f) => f.name.toLowerCase().includes(filterText.trim().toLowerCase()))
      : catalog;
    return rankFoodsByNutrient(pool, nutrient, rankMode, 25);
  }, [catalog, nutrient, rankMode, filterText]);

  function toggleExclusion(item: string) {
    setExclusions((prev) => (prev.includes(item) ? prev.filter((x) => x !== item) : [...prev, item]));
  }

  function askAiOracle() {
    const prompt = buildOracleAiPrompt({
      date: today,
      meal,
      diet,
      exclusions,
      remaining,
      lowestMicronutrients,
    });
    openAssistantDrawer({ prompt, newThread: true });
  }

  async function quickLogFood(food: Food) {
    const grams = food.default_serving_g || 100;
    const mac = nutrientsFor(food, grams);
    const mic = scaleMicronutrients(micronutrientsPer100g(food), grams);
    if (await write(supabase.from('food_logs').insert({
      date: today,
      meal,
      food_id: food.id,
      food_name: food.name,
      quantity_g: grams,
      ...mac,
      nutrients: mic,
      measure_label: `${grams} g`,
      measure_qty: 1,
      is_supplement: !!food.is_supplement,
    }))) {
      await h.foodLogs.reload();
    }
  }

  const maxScore = Math.max(1, oracleHits[0]?.score ?? 1);

  return (
    <div className="space-y-6">
      {/* 1. AI-Linked Food Suggester (Suggest Food + Assistant Integration) */}
      <section className="card">
        <div className="mb-4 flex flex-wrap items-start gap-3">
          <div className="mr-auto">
            <div className="flex items-center gap-2">
              <Sparkles {...I} className="text-brand" />
              <h2 className="text-base font-medium text-fg">Sugestão Inteligente de Alimentos · Agente IA</h2>
            </div>
            <p className="mt-0.5 text-[13px] text-fg3">
              Cruza seus macros restantes e as lacunas de micronutrientes de hoje diretamente com o Assistente IA da plataforma, que pode montar e registrar a refeição para você.
            </p>
          </div>
          <button type="button" className="btn-primary" onClick={askAiOracle}>
            <Bot {...I} /> Pedir sugestão ao Agente IA
          </button>
        </div>

        {/* Remaining today snapshot */}
        <div className="mb-4 grid gap-3 rounded-xl border border-line bg-raised/40 p-3.5 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <div className="text-[11px] text-fg3">Calorias restantes</div>
            <div className="figure mt-0.5 text-base font-medium text-fg">{num(remaining.kcal)} kcal</div>
          </div>
          <div>
            <div className="text-[11px] text-fg3">Proteína restante</div>
            <div className="figure mt-0.5 text-base font-medium text-fg">{num(remaining.protein_g)} g</div>
          </div>
          <div>
            <div className="text-[11px] text-fg3">Carbo restante</div>
            <div className="figure mt-0.5 text-base font-medium text-fg">{num(remaining.carbs_g)} g</div>
          </div>
          <div>
            <div className="text-[11px] text-fg3">Gordura restante</div>
            <div className="figure mt-0.5 text-base font-medium text-fg">{num(remaining.fat_g)} g</div>
          </div>
          <div>
            <div className="text-[11px] text-fg3">Maiores lacunas micro</div>
            <div className="mt-0.5 truncate text-xs text-fg2">
              {lowestMicronutrients.map((m) => `${m.shortLabel} (${m.pct}%)`).join(' · ')}
            </div>
          </div>
        </div>

        {/* Cronometer-style Filters: Meal + Diet + Exclusions */}
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <div className="label mb-1.5">Refeição alvo</div>
            <select className="input" value={meal} onChange={(e) => setMeal(e.target.value)}>
              {MEALS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <div className="label mb-1.5">Padrão alimentar</div>
            <select className="input" value={diet} onChange={(e) => setDiet(e.target.value)}>
              {DIETS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <div className="label mb-1.5">Exclusões / Alérgenos</div>
            <div className="flex flex-wrap gap-1.5">
              {EXCLUSIONS.map((ex) => {
                const active = exclusions.includes(ex);
                return (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => toggleExclusion(ex)}
                    className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                      active ? 'border-brand bg-raised text-fg font-medium' : 'border-line text-fg3 hover:text-fg2'
                    }`}
                  >
                    {ex}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Instant local top foods for #1 micronutrient gap */}
        {smartMatches.length > 0 && (
          <div className="mt-5 border-t border-line pt-4">
            <div className="mb-2.5 flex items-center justify-between">
              <span className="text-xs text-fg3">
                Destaques rápidos do catálogo para repor <strong className="font-medium text-fg2">{lowestMicronutrients[0]?.label}</strong>
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {smartMatches.map((hit) => (
                <div key={hit.food.id} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-fg">{hit.food.name}</div>
                    <div className="figure text-[11px] text-fg3">
                      {num(hit.amountPer100g)} {hit.unit}/100g · {num(hit.food.kcal)} kcal
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn-ghost h-8 shrink-0 px-2 text-xs"
                    onClick={() => quickLogFood(hit.food)}
                    title={`Adicionar em ${meal}`}
                  >
                    <Plus size={14} strokeWidth={1.5} /> {meal.split(' ')[0]}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* 2. Ask the Oracle: Nutrient Density Ranking */}
      <section className="card">
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div className="mr-auto">
            <h2 className="text-base font-medium text-fg">Pergunte ao Oráculo · Ranking por Nutriente</h2>
            <p className="text-[13px] text-fg3">
              Descubra os alimentos mais densos em qualquer vitamina, mineral, proteína ou fibra por caloria ou por peso.
            </p>
          </div>
          <div className="segmented">
            {([
              ['oracle', 'Oráculo'],
              ['per_100kcal', 'Por 100 kcal'],
              ['per_100g', 'Por 100 g'],
            ] as const).map(([id, lbl]) => (
              <button
                key={id}
                type="button"
                className={rankMode === id ? 'tab-active' : 'tab'}
                onClick={() => setRankMode(id)}
              >
                {lbl}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label mb-1.5 block">Nutriente pesquisado</label>
            <select
              className="input"
              aria-label="Nutriente pesquisado"
              value={nutrient}
              onChange={(e) => setNutrient(e.target.value as OracleNutrientKey)}
            >
              <optgroup label="Macronutrientes">
                <option value="protein_g">Proteína (g)</option>
                <option value="fiber_g">Fibras (g)</option>
              </optgroup>
              {(['Minerais', 'Vitaminas', 'Lipídios & Outros'] as const).map((cat) => (
                <optgroup key={cat} label={cat}>
                  {MICRONUTRIENTS.filter((m) => m.category === cat).map((m) => (
                    <option key={m.key} value={m.key}>{m.label} ({m.unit})</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div>
            <label className="label mb-1.5 block">Filtrar nome do alimento</label>
            <div className="relative">
              <Search size={15} strokeWidth={1.5} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg3" />
              <input
                className="input pl-9"
                placeholder="Ex.: frango, aveia, espinafre…"
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
              />
            </div>
          </div>
        </div>

        {loadingCatalog ? (
          <p className="py-6 text-center text-sm text-fg3">Carregando catálogo nutricional…</p>
        ) : oracleHits.length === 0 ? (
          <p className="py-6 text-center text-sm text-fg3">Nenhum alimento com esse nutriente mapeado para o filtro atual.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {oracleHits.map((hit, idx) => (
              <li key={hit.food.id} className="flex items-center gap-3 py-2.5">
                <span className="figure w-6 text-xs text-fg3">{idx + 1}.</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-medium text-fg">{hit.food.name}</span>
                    <span className="figure shrink-0 text-xs text-fg2">
                      <strong>{num(hit.amountPer100g)} {hit.unit}</strong> / 100g · {num(hit.amountPer100Kcal)} {hit.unit} / 100 kcal
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-raised">
                    <div
                      className="h-1.5 rounded-full"
                      style={{
                        width: `${Math.max(4, (hit.score / maxScore) * 100)}%`,
                        background: idx < 3 ? 'var(--brand)' : 'var(--chart-neutral)',
                      }}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-secondary h-8 shrink-0 px-2.5 text-xs"
                  onClick={() => quickLogFood(hit.food)}
                >
                  <Plus size={14} strokeWidth={1.5} /> Diário
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
