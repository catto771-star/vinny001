import { useState, type FormEvent } from 'react';
import { Bot, ChefHat, Layers, Plus, Repeat, Trash2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { write } from '../../lib/useTable';
import { num } from '../../lib/format';
import { MEALS, nutrientsFor, type Food } from '../../lib/nutrition';
import { computeRecipeYield, type RecipeIngredient } from '../../lib/metabolism';
import { micronutrientsPer100g, scaleMicronutrients } from '../../lib/micronutrients';
import { openAssistantDrawer } from '../../components/AssistantDrawer';
import { Field, Modal } from '../../components/ui';
import FoodSearch from './FoodSearch';
import type { CustomMeal, CustomRecipe, Health } from './useHealth';

const I = { size: 16, strokeWidth: 1.5, 'aria-hidden': true } as const;
const DAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export default function RecipesAndMealsModal({
  h,
  day,
  defaultMeal,
  onClose,
}: {
  h: Health;
  day: string;
  defaultMeal: string;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'recipes' | 'meals' | 'repeats'>('recipes');
  const [creatingRecipe, setCreatingRecipe] = useState(false);
  const [creatingMeal, setCreatingMeal] = useState(false);
  const [addingRepeat, setAddingRepeat] = useState(false);
  const [targetMeal, setTargetMeal] = useState(defaultMeal);

  async function logRecipeToDiary(recipe: CustomRecipe, portions: number) {
    const yieldInfo = computeRecipeYield(recipe.items, recipe.servings, recipe.cooked_weight_g);
    const grams = Math.max(1, Math.round(yieldInfo.gramsPerServing * portions * 10) / 10);
    const factor = portions / Math.max(1, recipe.servings);
    const scaledMicros: Record<string, number> = {};
    for (const item of recipe.items) {
      const m = item.nutrients ?? scaleMicronutrients(micronutrientsPer100g({ name: item.food_name }), item.quantity_g);
      for (const [k, v] of Object.entries(m)) {
        if (typeof v === 'number') scaledMicros[k] = Math.round(((scaledMicros[k] ?? 0) + v * factor) * 100) / 100;
      }
    }

    if (await write(supabase.from('food_logs').insert({
      date: day,
      meal: targetMeal,
      food_id: null,
      food_name: recipe.name,
      quantity_g: grams,
      kcal: Math.round(yieldInfo.perServing.kcal * portions),
      protein_g: Math.round(yieldInfo.perServing.protein_g * portions * 10) / 10,
      carbs_g: Math.round(yieldInfo.perServing.carbs_g * portions * 10) / 10,
      fat_g: Math.round(yieldInfo.perServing.fat_g * portions * 10) / 10,
      fiber_g: Math.round(yieldInfo.perServing.fiber_g * portions * 10) / 10,
      measure_label: 'porção da receita',
      measure_qty: portions,
      nutrients: scaledMicros,
      group_name: `recipe:${recipe.id}:${portions}`,
    }))) {
      await h.foodLogs.reload();
      onClose();
    }
  }

  async function logMealToDiary(cm: CustomMeal) {
    const sum = cm.items.reduce(
      (acc, i) => ({
        grams: acc.grams + i.quantity_g,
        kcal: acc.kcal + i.kcal,
        protein_g: acc.protein_g + i.protein_g,
        carbs_g: acc.carbs_g + i.carbs_g,
        fat_g: acc.fat_g + i.fat_g,
        fiber_g: acc.fiber_g + (i.fiber_g || 0),
      }),
      { grams: 0, kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 },
    );
    const mergedMicros: Record<string, number> = {};
    for (const item of cm.items) {
      const m = item.nutrients ?? scaleMicronutrients(micronutrientsPer100g({ name: item.food_name }), item.quantity_g);
      for (const [k, v] of Object.entries(m)) {
        if (typeof v === 'number') mergedMicros[k] = Math.round(((mergedMicros[k] ?? 0) + v) * 100) / 100;
      }
    }

    if (await write(supabase.from('food_logs').insert({
      date: day,
      meal: targetMeal || cm.default_meal,
      food_id: null,
      food_name: cm.name,
      quantity_g: Math.max(1, Math.round(sum.grams)),
      kcal: Math.round(sum.kcal),
      protein_g: Math.round(sum.protein_g * 10) / 10,
      carbs_g: Math.round(sum.carbs_g * 10) / 10,
      fat_g: Math.round(sum.fat_g * 10) / 10,
      fiber_g: Math.round(sum.fiber_g * 10) / 10,
      measure_label: 'refeição completa',
      measure_qty: 1,
      nutrients: mergedMicros,
      group_name: `meal:${cm.id}:1`,
    }))) {
      await h.foodLogs.reload();
      onClose();
    }
  }

  if (creatingRecipe) {
    return (
      <CreateRecipeView
        h={h}
        onCancel={() => setCreatingRecipe(false)}
        onSaved={async () => {
          setCreatingRecipe(false);
          await h.customRecipes.reload();
        }}
        onClose={onClose}
      />
    );
  }

  if (creatingMeal) {
    return (
      <CreateCustomMealView
        h={h}
        defaultMeal={targetMeal}
        onCancel={() => setCreatingMeal(false)}
        onSaved={async () => {
          setCreatingMeal(false);
          await h.customMeals.reload();
        }}
        onClose={onClose}
      />
    );
  }

  return (
    <Modal title="Receitas, Refeições Salvas e Recorrentes" onClose={onClose}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="segmented">
          <button type="button" className={tab === 'recipes' ? 'tab-active' : 'tab'} onClick={() => setTab('recipes')}>
            <ChefHat size={14} strokeWidth={1.5} className="mr-1 inline" />Receitas
          </button>
          <button type="button" className={tab === 'meals' ? 'tab-active' : 'tab'} onClick={() => setTab('meals')}>
            <Layers size={14} strokeWidth={1.5} className="mr-1 inline" />Refeições
          </button>
          <button type="button" className={tab === 'repeats' ? 'tab-active' : 'tab'} onClick={() => setTab('repeats')}>
            <Repeat size={14} strokeWidth={1.5} className="mr-1 inline" />Recorrentes
          </button>
        </div>

        {tab !== 'repeats' && (
          <select className="input h-8 w-auto py-0 text-xs" value={targetMeal} onChange={(e) => setTargetMeal(e.target.value)} aria-label="Refeição de destino">
            {MEALS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        )}
      </div>

      {tab === 'recipes' && (
        <div>
          <div className="mb-3 flex flex-wrap gap-2">
            <button type="button" className="btn-primary text-xs" onClick={() => setCreatingRecipe(true)}>
              <Plus {...I} /> Nova receita
            </button>
            <button
              type="button"
              className="btn-secondary text-xs"
              onClick={() => {
                onClose();
                openAssistantDrawer({
                  prompt: 'Quero importar/criar uma receita nutricional a partir de um link ou lista de ingredientes. Pergunte o link ou os ingredientes e calcule porções e macros.',
                  newThread: true,
                });
              }}
            >
              <Bot {...I} /> Importar via IA / Link
            </button>
          </div>
          <p className="mb-2 text-xs text-fg3">
            Ao lançar uma receita no diário, você pode clicar em <strong>Explodir</strong> na linha para desmembrá-la nos ingredientes individuais.
          </p>
          <ul className="max-h-72 divide-y divide-line overflow-y-auto text-sm">
            {h.customRecipes.rows.map((r) => {
              const y = computeRecipeYield(r.items, r.servings, r.cooked_weight_g);
              return (
                <li key={r.id} className="flex items-center gap-2 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-fg">{r.name}</div>
                    <div className="figure text-xs text-fg3">
                      1 porção ({num(y.gramsPerServing)} g): {num(y.perServing.kcal)} kcal · P {num(y.perServing.protein_g)} · C {num(y.perServing.carbs_g)} · G {num(y.perServing.fat_g)}
                    </div>
                  </div>
                  <button type="button" className="btn-secondary h-8 px-2.5 text-xs" onClick={() => void logRecipeToDiary(r, 1)}>
                    + 1 porção
                  </button>
                  <button
                    type="button"
                    className="text-fg3 hover:text-negative"
                    aria-label={`Excluir receita ${r.name}`}
                    onClick={async () => {
                      if (confirm(`Excluir receita "${r.name}"?`) && await write(supabase.from('custom_recipes').delete().eq('id', r.id))) {
                        void h.customRecipes.reload();
                      }
                    }}
                  >
                    <Trash2 size={14} strokeWidth={1.5} />
                  </button>
                </li>
              );
            })}
            {!h.customRecipes.rows.length && (
              <li className="py-6 text-center text-sm text-fg3">Nenhuma receita cadastrada ainda.</li>
            )}
          </ul>
        </div>
      )}

      {tab === 'meals' && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <button type="button" className="btn-primary text-xs" onClick={() => setCreatingMeal(true)}>
              <Plus {...I} /> Nova refeição salva
            </button>
          </div>
          <p className="mb-2 text-xs text-fg3">
            Combine alimentos que você come juntos sempre (ex.: Café padrão) e lance com 1 clique. No diário, use <strong>Explodir</strong> se quiser ajustar um item naquele dia.
          </p>
          <ul className="max-h-72 divide-y divide-line overflow-y-auto text-sm">
            {h.customMeals.rows.map((cm) => {
              const kcal = cm.items.reduce((s, i) => s + i.kcal, 0);
              return (
                <li key={cm.id} className="flex items-center gap-2 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-fg">{cm.name}</div>
                    <div className="text-xs text-fg3">
                      {cm.items.length} itens · <span className="figure">{num(kcal)} kcal</span> · padrão: {cm.default_meal}
                    </div>
                  </div>
                  <button type="button" className="btn-secondary h-8 px-2.5 text-xs" onClick={() => void logMealToDiary(cm)}>
                    Lançar
                  </button>
                  <button
                    type="button"
                    className="text-fg3 hover:text-negative"
                    aria-label={`Excluir refeição ${cm.name}`}
                    onClick={async () => {
                      if (confirm(`Excluir "${cm.name}"?`) && await write(supabase.from('custom_meals').delete().eq('id', cm.id))) {
                        void h.customMeals.reload();
                      }
                    }}
                  >
                    <Trash2 size={14} strokeWidth={1.5} />
                  </button>
                </li>
              );
            })}
            {!h.customMeals.rows.length && (
              <li className="py-6 text-center text-sm text-fg3">Nenhuma refeição salva ainda.</li>
            )}
          </ul>
        </div>
      )}

      {tab === 'repeats' && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs text-fg3">Agende itens que você consome automaticamente toda semana (ex.: creatina, whey, café).</span>
            <button type="button" className="btn-primary shrink-0 text-xs" onClick={() => setAddingRepeat(true)}>
              <Plus {...I} /> Agendar item
            </button>
          </div>
          <ul className="max-h-72 divide-y divide-line overflow-y-auto text-sm">
            {h.repeatItems.rows.map((ri) => (
              <li key={ri.id} className="flex items-center gap-2 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-fg">{ri.food_name} · <span className="figure text-fg2">{num(ri.quantity_g)} g</span></div>
                  <div className="text-xs text-fg3">
                    {ri.meal} · {ri.weekdays.map((d) => DAYS_SHORT[d]).join(', ')}
                  </div>
                </div>
                <button
                  type="button"
                  className="text-fg3 hover:text-negative"
                  aria-label={`Remover recorrente ${ri.food_name}`}
                  onClick={async () => {
                    if (await write(supabase.from('repeat_food_items').delete().eq('id', ri.id))) {
                      void h.repeatItems.reload();
                    }
                  }}
                >
                  <Trash2 size={14} strokeWidth={1.5} />
                </button>
              </li>
            ))}
            {!h.repeatItems.rows.length && (
              <li className="py-6 text-center text-sm text-fg3">Nenhum item recorrente configurado.</li>
            )}
          </ul>

          {addingRepeat && (
            <AddRepeatItemModal
              h={h}
              defaultMeal={targetMeal}
              onClose={() => setAddingRepeat(false)}
              onSaved={async () => {
                setAddingRepeat(false);
                await h.repeatItems.reload();
              }}
            />
          )}
        </div>
      )}
    </Modal>
  );
}

function CreateRecipeView({
  h,
  onCancel,
  onSaved,
  onClose,
}: {
  h: Health;
  onCancel: () => void;
  onSaved: () => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [servings, setServings] = useState(4);
  const [cookedWeight, setCookedWeight] = useState('');
  const [items, setItems] = useState<RecipeIngredient[]>([]);
  const [pickingFood, setPickingFood] = useState(false);

  const yieldInfo = computeRecipeYield(items, servings, cookedWeight ? Number(cookedWeight) : null);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!items.length) return alert('Adicione pelo menos 1 ingrediente.');
    if (await write(supabase.from('custom_recipes').insert({
      name: name.trim(),
      servings: Math.max(1, servings),
      cooked_weight_g: cookedWeight ? Number(cookedWeight) : null,
      items,
    }))) {
      await onSaved();
    }
  }

  return (
    <Modal title="Nova receita" onClose={onClose}>
      <form onSubmit={save}>
        <Field label="Nome da receita">
          <input className="input" placeholder="Ex.: Panqueca proteica de aveia" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Rendimento (porções)">
            <input className="input figure" type="number" min={1} step="any" value={servings} onChange={(e) => setServings(Number(e.target.value))} required />
          </Field>
          <Field label="Peso final cozido g (opcional)">
            <input className="input figure" type="number" min={1} step="any" placeholder={`${num(yieldInfo.totalRawWeightG)} g cru`} value={cookedWeight} onChange={(e) => setCookedWeight(e.target.value)} />
          </Field>
        </div>

        <div className="mb-3">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="label">Ingredientes ({items.length})</span>
            <button type="button" className="btn-secondary h-8 px-2.5 text-xs" onClick={() => setPickingFood(true)}>
              <Plus {...I} /> Ingrediente
            </button>
          </div>
          <ul className="max-h-40 divide-y divide-line overflow-y-auto rounded-lg border border-line px-3 text-sm">
            {items.map((it, idx) => (
              <li key={idx} className="flex items-center gap-2 py-1.5">
                <span className="mr-auto truncate">{it.food_name} · <span className="figure text-fg3">{num(it.quantity_g)} g</span></span>
                <span className="figure text-xs text-fg3">{num(it.kcal)} kcal</span>
                <button type="button" className="text-fg3 hover:text-negative" onClick={() => setItems(items.filter((_, j) => j !== idx))}>
                  <X size={14} strokeWidth={1.5} />
                </button>
              </li>
            ))}
            {!items.length && <li className="py-4 text-center text-xs text-fg3">Adicione os ingredientes da receita</li>}
          </ul>
        </div>

        {items.length > 0 && (
          <div className="mb-4 rounded-xl border border-line bg-raised/40 p-3 text-xs text-fg2">
            <div><strong>Por porção ({num(yieldInfo.gramsPerServing)} g):</strong> <span className="figure">{num(yieldInfo.perServing.kcal)} kcal</span> · P {num(yieldInfo.perServing.protein_g)} g · C {num(yieldInfo.perServing.carbs_g)} g · G {num(yieldInfo.perServing.fat_g)} g</div>
            <div className="mt-0.5 text-fg3">Densidade por 100 g pronto: <span className="figure">{num(yieldInfo.per100g.kcal)} kcal</span></div>
          </div>
        )}

        <div className="flex gap-2">
          <button type="button" className="btn-ghost" onClick={onCancel}>Voltar</button>
          <button className="btn-primary ml-auto" disabled={!items.length || !name.trim()}>Salvar receita</button>
        </div>
      </form>

      {pickingFood && (
        <FoodSearch
          title="Adicionar ingrediente"
          favoriteIds={h.favoriteIds}
          onClose={() => setPickingFood(false)}
          onPick={(food: Food, grams: number, meta) => {
            const mac = nutrientsFor(food, grams);
            setItems((prev) => [
              ...prev,
              {
                food_id: food.id,
                food_name: food.name,
                quantity_g: grams,
                ...mac,
                nutrients: meta?.nutrients ?? scaleMicronutrients(micronutrientsPer100g(food), grams),
              },
            ]);
            setPickingFood(false);
          }}
        />
      )}
    </Modal>
  );
}

function CreateCustomMealView({
  h,
  defaultMeal,
  onCancel,
  onSaved,
  onClose,
}: {
  h: Health;
  defaultMeal: string;
  onCancel: () => void;
  onSaved: () => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [meal, setMeal] = useState(defaultMeal);
  const [items, setItems] = useState<RecipeIngredient[]>([]);
  const [pickingFood, setPickingFood] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!items.length) return;
    if (await write(supabase.from('custom_meals').insert({ name: name.trim(), default_meal: meal, items }))) {
      await onSaved();
    }
  }

  return (
    <Modal title="Nova refeição salva" onClose={onClose}>
      <form onSubmit={save}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nome">
            <input className="input" placeholder="Ex.: Café padrão" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </Field>
          <Field label="Refeição padrão">
            <select className="input" value={meal} onChange={(e) => setMeal(e.target.value)}>
              {MEALS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
        </div>
        <div className="mb-3">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="label">Itens ({items.length})</span>
            <button type="button" className="btn-secondary h-8 px-2.5 text-xs" onClick={() => setPickingFood(true)}>
              <Plus {...I} /> Adicionar alimento
            </button>
          </div>
          <ul className="max-h-44 divide-y divide-line overflow-y-auto rounded-lg border border-line px-3 text-sm">
            {items.map((it, idx) => (
              <li key={idx} className="flex items-center gap-2 py-1.5">
                <span className="mr-auto truncate">{it.food_name} · <span className="figure text-fg3">{num(it.quantity_g)} g</span></span>
                <span className="figure text-xs text-fg3">{num(it.kcal)} kcal</span>
                <button type="button" className="text-fg3 hover:text-negative" onClick={() => setItems(items.filter((_, j) => j !== idx))}>
                  <X size={14} strokeWidth={1.5} />
                </button>
              </li>
            ))}
            {!items.length && <li className="py-4 text-center text-xs text-fg3">Nenhum item adicionado</li>}
          </ul>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn-ghost" onClick={onCancel}>Voltar</button>
          <button className="btn-primary ml-auto" disabled={!items.length || !name.trim()}>Salvar refeição</button>
        </div>
      </form>

      {pickingFood && (
        <FoodSearch
          title="Adicionar item à refeição"
          favoriteIds={h.favoriteIds}
          onClose={() => setPickingFood(false)}
          onPick={(food, grams, meta) => {
            const mac = nutrientsFor(food, grams);
            setItems((prev) => [
              ...prev,
              {
                food_id: food.id,
                food_name: food.name,
                quantity_g: grams,
                ...mac,
                nutrients: meta?.nutrients ?? scaleMicronutrients(micronutrientsPer100g(food), grams),
              },
            ]);
            setPickingFood(false);
          }}
        />
      )}
    </Modal>
  );
}

function AddRepeatItemModal({
  h,
  defaultMeal,
  onClose,
  onSaved,
}: {
  h: Health;
  defaultMeal: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [meal, setMeal] = useState(defaultMeal);
  const [weekdays, setWeekdays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [picking, setPicking] = useState(true);

  function toggleDay(d: number) {
    setWeekdays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));
  }

  if (picking) {
    return (
      <FoodSearch
        title="Escolher item recorrente"
        favoriteIds={h.favoriteIds}
        onClose={onClose}
        onPick={async (food, grams, meta) => {
          const mac = nutrientsFor(food, grams);
          if (await write(supabase.from('repeat_food_items').insert({
            meal,
            weekdays: weekdays.length ? weekdays : [0, 1, 2, 3, 4, 5, 6],
            food_id: food.id,
            food_name: food.name,
            quantity_g: grams,
            measure_label: meta?.measure_label ?? 'g',
            measure_qty: meta?.measure_qty ?? grams,
            ...mac,
            nutrients: meta?.nutrients ?? scaleMicronutrients(micronutrientsPer100g(food), grams),
            is_supplement: meta?.is_supplement ?? !!food.is_supplement,
            active: true,
          }))) {
            setPicking(false);
            await onSaved();
          }
        }}
      />
    );
  }

  return (
    <Modal title="Dias do item recorrente" onClose={onClose}>
      <Field label="Refeição">
        <select className="input" value={meal} onChange={(e) => setMeal(e.target.value)}>
          {MEALS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </Field>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {DAYS_SHORT.map((lbl, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => toggleDay(idx)}
            className={`rounded-md border px-2.5 py-1 text-xs ${weekdays.includes(idx) ? 'border-brand bg-raised text-fg' : 'border-line text-fg3'}`}
          >
            {lbl}
          </button>
        ))}
      </div>
      <button type="button" className="btn-primary w-full justify-center" onClick={() => setPicking(true)}>
        Escolher alimento
      </button>
    </Modal>
  );
}
