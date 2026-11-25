import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Bot, ChefHat, Layers, Plus, Repeat, Trash2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { write } from '../../lib/useTable';
import { num } from '../../lib/format';
import { MEALS, nutrientsFor } from '../../lib/nutrition';
import { computeRecipeYield } from '../../lib/metabolism';
import { micronutrientsPer100g, scaleMicronutrients } from '../../lib/micronutrients';
import { openAssistantDrawer } from '../../components/AssistantDrawer';
import { Field, Modal } from '../../components/ui';
import FoodSearch from './FoodSearch';
const I = { size: 16, strokeWidth: 1.5, 'aria-hidden': true };
const DAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export default function RecipesAndMealsModal({ h, day, defaultMeal, onClose, }) {
    const [tab, setTab] = useState('recipes');
    const [creatingRecipe, setCreatingRecipe] = useState(false);
    const [creatingMeal, setCreatingMeal] = useState(false);
    const [addingRepeat, setAddingRepeat] = useState(false);
    const [targetMeal, setTargetMeal] = useState(defaultMeal);
    async function logRecipeToDiary(recipe, portions) {
        const yieldInfo = computeRecipeYield(recipe.items, recipe.servings, recipe.cooked_weight_g);
        const grams = Math.max(1, Math.round(yieldInfo.gramsPerServing * portions * 10) / 10);
        const factor = portions / Math.max(1, recipe.servings);
        const scaledMicros = {};
        for (const item of recipe.items) {
            const m = item.nutrients ?? scaleMicronutrients(micronutrientsPer100g({ name: item.food_name }), item.quantity_g);
            for (const [k, v] of Object.entries(m)) {
                if (typeof v === 'number')
                    scaledMicros[k] = Math.round(((scaledMicros[k] ?? 0) + v * factor) * 100) / 100;
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
    async function logMealToDiary(cm) {
        const sum = cm.items.reduce((acc, i) => ({
            grams: acc.grams + i.quantity_g,
            kcal: acc.kcal + i.kcal,
            protein_g: acc.protein_g + i.protein_g,
            carbs_g: acc.carbs_g + i.carbs_g,
            fat_g: acc.fat_g + i.fat_g,
            fiber_g: acc.fiber_g + (i.fiber_g || 0),
        }), { grams: 0, kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 });
        const mergedMicros = {};
        for (const item of cm.items) {
            const m = item.nutrients ?? scaleMicronutrients(micronutrientsPer100g({ name: item.food_name }), item.quantity_g);
            for (const [k, v] of Object.entries(m)) {
                if (typeof v === 'number')
                    mergedMicros[k] = Math.round(((mergedMicros[k] ?? 0) + v) * 100) / 100;
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
        return (_jsx(CreateRecipeView, { h: h, onCancel: () => setCreatingRecipe(false), onSaved: async () => {
                setCreatingRecipe(false);
                await h.customRecipes.reload();
            }, onClose: onClose }));
    }
    if (creatingMeal) {
        return (_jsx(CreateCustomMealView, { h: h, defaultMeal: targetMeal, onCancel: () => setCreatingMeal(false), onSaved: async () => {
                setCreatingMeal(false);
                await h.customMeals.reload();
            }, onClose: onClose }));
    }
    return (_jsxs(Modal, { title: "Receitas, Refei\u00E7\u00F5es Salvas e Recorrentes", onClose: onClose, children: [_jsxs("div", { className: "mb-3 flex flex-wrap items-center justify-between gap-2", children: [_jsxs("div", { className: "segmented", children: [_jsxs("button", { type: "button", className: tab === 'recipes' ? 'tab-active' : 'tab', onClick: () => setTab('recipes'), children: [_jsx(ChefHat, { size: 14, strokeWidth: 1.5, className: "mr-1 inline" }), "Receitas"] }), _jsxs("button", { type: "button", className: tab === 'meals' ? 'tab-active' : 'tab', onClick: () => setTab('meals'), children: [_jsx(Layers, { size: 14, strokeWidth: 1.5, className: "mr-1 inline" }), "Refei\u00E7\u00F5es"] }), _jsxs("button", { type: "button", className: tab === 'repeats' ? 'tab-active' : 'tab', onClick: () => setTab('repeats'), children: [_jsx(Repeat, { size: 14, strokeWidth: 1.5, className: "mr-1 inline" }), "Recorrentes"] })] }), tab !== 'repeats' && (_jsx("select", { className: "input h-8 w-auto py-0 text-xs", value: targetMeal, onChange: (e) => setTargetMeal(e.target.value), "aria-label": "Refei\u00E7\u00E3o de destino", children: MEALS.map((m) => _jsx("option", { value: m, children: m }, m)) }))] }), tab === 'recipes' && (_jsxs("div", { children: [_jsxs("div", { className: "mb-3 flex flex-wrap gap-2", children: [_jsxs("button", { type: "button", className: "btn-primary text-xs", onClick: () => setCreatingRecipe(true), children: [_jsx(Plus, { ...I }), " Nova receita"] }), _jsxs("button", { type: "button", className: "btn-secondary text-xs", onClick: () => {
                                    onClose();
                                    openAssistantDrawer({
                                        prompt: 'Quero importar/criar uma receita nutricional a partir de um link ou lista de ingredientes. Pergunte o link ou os ingredientes e calcule porções e macros.',
                                        newThread: true,
                                    });
                                }, children: [_jsx(Bot, { ...I }), " Importar via IA / Link"] })] }), _jsxs("p", { className: "mb-2 text-xs text-fg3", children: ["Ao lan\u00E7ar uma receita no di\u00E1rio, voc\u00EA pode clicar em ", _jsx("strong", { children: "Explodir" }), " na linha para desmembr\u00E1-la nos ingredientes individuais."] }), _jsxs("ul", { className: "max-h-72 divide-y divide-line overflow-y-auto text-sm", children: [h.customRecipes.rows.map((r) => {
                                const y = computeRecipeYield(r.items, r.servings, r.cooked_weight_g);
                                return (_jsxs("li", { className: "flex items-center gap-2 py-2.5", children: [_jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("div", { className: "truncate font-medium text-fg", children: r.name }), _jsxs("div", { className: "figure text-xs text-fg3", children: ["1 por\u00E7\u00E3o (", num(y.gramsPerServing), " g): ", num(y.perServing.kcal), " kcal \u00B7 P ", num(y.perServing.protein_g), " \u00B7 C ", num(y.perServing.carbs_g), " \u00B7 G ", num(y.perServing.fat_g)] })] }), _jsx("button", { type: "button", className: "btn-secondary h-8 px-2.5 text-xs", onClick: () => void logRecipeToDiary(r, 1), children: "+ 1 por\u00E7\u00E3o" }), _jsx("button", { type: "button", className: "text-fg3 hover:text-negative", "aria-label": `Excluir receita ${r.name}`, onClick: async () => {
                                                if (confirm(`Excluir receita "${r.name}"?`) && await write(supabase.from('custom_recipes').delete().eq('id', r.id))) {
                                                    void h.customRecipes.reload();
                                                }
                                            }, children: _jsx(Trash2, { size: 14, strokeWidth: 1.5 }) })] }, r.id));
                            }), !h.customRecipes.rows.length && (_jsx("li", { className: "py-6 text-center text-sm text-fg3", children: "Nenhuma receita cadastrada ainda." }))] })] })), tab === 'meals' && (_jsxs("div", { children: [_jsx("div", { className: "mb-3 flex items-center justify-between", children: _jsxs("button", { type: "button", className: "btn-primary text-xs", onClick: () => setCreatingMeal(true), children: [_jsx(Plus, { ...I }), " Nova refei\u00E7\u00E3o salva"] }) }), _jsxs("p", { className: "mb-2 text-xs text-fg3", children: ["Combine alimentos que voc\u00EA come juntos sempre (ex.: Caf\u00E9 padr\u00E3o) e lance com 1 clique. No di\u00E1rio, use ", _jsx("strong", { children: "Explodir" }), " se quiser ajustar um item naquele dia."] }), _jsxs("ul", { className: "max-h-72 divide-y divide-line overflow-y-auto text-sm", children: [h.customMeals.rows.map((cm) => {
                                const kcal = cm.items.reduce((s, i) => s + i.kcal, 0);
                                return (_jsxs("li", { className: "flex items-center gap-2 py-2.5", children: [_jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("div", { className: "truncate font-medium text-fg", children: cm.name }), _jsxs("div", { className: "text-xs text-fg3", children: [cm.items.length, " itens \u00B7 ", _jsxs("span", { className: "figure", children: [num(kcal), " kcal"] }), " \u00B7 padr\u00E3o: ", cm.default_meal] })] }), _jsx("button", { type: "button", className: "btn-secondary h-8 px-2.5 text-xs", onClick: () => void logMealToDiary(cm), children: "Lan\u00E7ar" }), _jsx("button", { type: "button", className: "text-fg3 hover:text-negative", "aria-label": `Excluir refeição ${cm.name}`, onClick: async () => {
                                                if (confirm(`Excluir "${cm.name}"?`) && await write(supabase.from('custom_meals').delete().eq('id', cm.id))) {
                                                    void h.customMeals.reload();
                                                }
                                            }, children: _jsx(Trash2, { size: 14, strokeWidth: 1.5 }) })] }, cm.id));
                            }), !h.customMeals.rows.length && (_jsx("li", { className: "py-6 text-center text-sm text-fg3", children: "Nenhuma refei\u00E7\u00E3o salva ainda." }))] })] })), tab === 'repeats' && (_jsxs("div", { children: [_jsxs("div", { className: "mb-3 flex items-center justify-between", children: [_jsx("span", { className: "text-xs text-fg3", children: "Agende itens que voc\u00EA consome automaticamente toda semana (ex.: creatina, whey, caf\u00E9)." }), _jsxs("button", { type: "button", className: "btn-primary shrink-0 text-xs", onClick: () => setAddingRepeat(true), children: [_jsx(Plus, { ...I }), " Agendar item"] })] }), _jsxs("ul", { className: "max-h-72 divide-y divide-line overflow-y-auto text-sm", children: [h.repeatItems.rows.map((ri) => (_jsxs("li", { className: "flex items-center gap-2 py-2.5", children: [_jsxs("div", { className: "min-w-0 flex-1", children: [_jsxs("div", { className: "truncate font-medium text-fg", children: [ri.food_name, " \u00B7 ", _jsxs("span", { className: "figure text-fg2", children: [num(ri.quantity_g), " g"] })] }), _jsxs("div", { className: "text-xs text-fg3", children: [ri.meal, " \u00B7 ", ri.weekdays.map((d) => DAYS_SHORT[d]).join(', ')] })] }), _jsx("button", { type: "button", className: "text-fg3 hover:text-negative", "aria-label": `Remover recorrente ${ri.food_name}`, onClick: async () => {
                                            if (await write(supabase.from('repeat_food_items').delete().eq('id', ri.id))) {
                                                void h.repeatItems.reload();
                                            }
                                        }, children: _jsx(Trash2, { size: 14, strokeWidth: 1.5 }) })] }, ri.id))), !h.repeatItems.rows.length && (_jsx("li", { className: "py-6 text-center text-sm text-fg3", children: "Nenhum item recorrente configurado." }))] }), addingRepeat && (_jsx(AddRepeatItemModal, { h: h, defaultMeal: targetMeal, onClose: () => setAddingRepeat(false), onSaved: async () => {
                            setAddingRepeat(false);
                            await h.repeatItems.reload();
                        } }))] }))] }));
}
function CreateRecipeView({ h, onCancel, onSaved, onClose, }) {
    const [name, setName] = useState('');
    const [servings, setServings] = useState(4);
    const [cookedWeight, setCookedWeight] = useState('');
    const [items, setItems] = useState([]);
    const [pickingFood, setPickingFood] = useState(false);
    const yieldInfo = computeRecipeYield(items, servings, cookedWeight ? Number(cookedWeight) : null);
    async function save(e) {
        e.preventDefault();
        if (!items.length)
            return alert('Adicione pelo menos 1 ingrediente.');
        if (await write(supabase.from('custom_recipes').insert({
            name: name.trim(),
            servings: Math.max(1, servings),
            cooked_weight_g: cookedWeight ? Number(cookedWeight) : null,
            items,
        }))) {
            await onSaved();
        }
    }
    return (_jsxs(Modal, { title: "Nova receita", onClose: onClose, children: [_jsxs("form", { onSubmit: save, children: [_jsx(Field, { label: "Nome da receita", children: _jsx("input", { className: "input", placeholder: "Ex.: Panqueca proteica de aveia", value: name, onChange: (e) => setName(e.target.value), required: true, autoFocus: true }) }), _jsxs("div", { className: "grid grid-cols-2 gap-3", children: [_jsx(Field, { label: "Rendimento (por\u00E7\u00F5es)", children: _jsx("input", { className: "input figure", type: "number", min: 1, step: "any", value: servings, onChange: (e) => setServings(Number(e.target.value)), required: true }) }), _jsx(Field, { label: "Peso final cozido g (opcional)", children: _jsx("input", { className: "input figure", type: "number", min: 1, step: "any", placeholder: `${num(yieldInfo.totalRawWeightG)} g cru`, value: cookedWeight, onChange: (e) => setCookedWeight(e.target.value) }) })] }), _jsxs("div", { className: "mb-3", children: [_jsxs("div", { className: "mb-1.5 flex items-center justify-between", children: [_jsxs("span", { className: "label", children: ["Ingredientes (", items.length, ")"] }), _jsxs("button", { type: "button", className: "btn-secondary h-8 px-2.5 text-xs", onClick: () => setPickingFood(true), children: [_jsx(Plus, { ...I }), " Ingrediente"] })] }), _jsxs("ul", { className: "max-h-40 divide-y divide-line overflow-y-auto rounded-lg border border-line px-3 text-sm", children: [items.map((it, idx) => (_jsxs("li", { className: "flex items-center gap-2 py-1.5", children: [_jsxs("span", { className: "mr-auto truncate", children: [it.food_name, " \u00B7 ", _jsxs("span", { className: "figure text-fg3", children: [num(it.quantity_g), " g"] })] }), _jsxs("span", { className: "figure text-xs text-fg3", children: [num(it.kcal), " kcal"] }), _jsx("button", { type: "button", className: "text-fg3 hover:text-negative", onClick: () => setItems(items.filter((_, j) => j !== idx)), children: _jsx(X, { size: 14, strokeWidth: 1.5 }) })] }, idx))), !items.length && _jsx("li", { className: "py-4 text-center text-xs text-fg3", children: "Adicione os ingredientes da receita" })] })] }), items.length > 0 && (_jsxs("div", { className: "mb-4 rounded-xl border border-line bg-raised/40 p-3 text-xs text-fg2", children: [_jsxs("div", { children: [_jsxs("strong", { children: ["Por por\u00E7\u00E3o (", num(yieldInfo.gramsPerServing), " g):"] }), " ", _jsxs("span", { className: "figure", children: [num(yieldInfo.perServing.kcal), " kcal"] }), " \u00B7 P ", num(yieldInfo.perServing.protein_g), " g \u00B7 C ", num(yieldInfo.perServing.carbs_g), " g \u00B7 G ", num(yieldInfo.perServing.fat_g), " g"] }), _jsxs("div", { className: "mt-0.5 text-fg3", children: ["Densidade por 100 g pronto: ", _jsxs("span", { className: "figure", children: [num(yieldInfo.per100g.kcal), " kcal"] })] })] })), _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { type: "button", className: "btn-ghost", onClick: onCancel, children: "Voltar" }), _jsx("button", { className: "btn-primary ml-auto", disabled: !items.length || !name.trim(), children: "Salvar receita" })] })] }), pickingFood && (_jsx(FoodSearch, { title: "Adicionar ingrediente", favoriteIds: h.favoriteIds, onClose: () => setPickingFood(false), onPick: (food, grams, meta) => {
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
                } }))] }));
}
function CreateCustomMealView({ h, defaultMeal, onCancel, onSaved, onClose, }) {
    const [name, setName] = useState('');
    const [meal, setMeal] = useState(defaultMeal);
    const [items, setItems] = useState([]);
    const [pickingFood, setPickingFood] = useState(false);
    async function save(e) {
        e.preventDefault();
        if (!items.length)
            return;
        if (await write(supabase.from('custom_meals').insert({ name: name.trim(), default_meal: meal, items }))) {
            await onSaved();
        }
    }
    return (_jsxs(Modal, { title: "Nova refei\u00E7\u00E3o salva", onClose: onClose, children: [_jsxs("form", { onSubmit: save, children: [_jsxs("div", { className: "grid grid-cols-2 gap-3", children: [_jsx(Field, { label: "Nome", children: _jsx("input", { className: "input", placeholder: "Ex.: Caf\u00E9 padr\u00E3o", value: name, onChange: (e) => setName(e.target.value), required: true, autoFocus: true }) }), _jsx(Field, { label: "Refei\u00E7\u00E3o padr\u00E3o", children: _jsx("select", { className: "input", value: meal, onChange: (e) => setMeal(e.target.value), children: MEALS.map((m) => _jsx("option", { value: m, children: m }, m)) }) })] }), _jsxs("div", { className: "mb-3", children: [_jsxs("div", { className: "mb-1.5 flex items-center justify-between", children: [_jsxs("span", { className: "label", children: ["Itens (", items.length, ")"] }), _jsxs("button", { type: "button", className: "btn-secondary h-8 px-2.5 text-xs", onClick: () => setPickingFood(true), children: [_jsx(Plus, { ...I }), " Adicionar alimento"] })] }), _jsxs("ul", { className: "max-h-44 divide-y divide-line overflow-y-auto rounded-lg border border-line px-3 text-sm", children: [items.map((it, idx) => (_jsxs("li", { className: "flex items-center gap-2 py-1.5", children: [_jsxs("span", { className: "mr-auto truncate", children: [it.food_name, " \u00B7 ", _jsxs("span", { className: "figure text-fg3", children: [num(it.quantity_g), " g"] })] }), _jsxs("span", { className: "figure text-xs text-fg3", children: [num(it.kcal), " kcal"] }), _jsx("button", { type: "button", className: "text-fg3 hover:text-negative", onClick: () => setItems(items.filter((_, j) => j !== idx)), children: _jsx(X, { size: 14, strokeWidth: 1.5 }) })] }, idx))), !items.length && _jsx("li", { className: "py-4 text-center text-xs text-fg3", children: "Nenhum item adicionado" })] })] }), _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { type: "button", className: "btn-ghost", onClick: onCancel, children: "Voltar" }), _jsx("button", { className: "btn-primary ml-auto", disabled: !items.length || !name.trim(), children: "Salvar refei\u00E7\u00E3o" })] })] }), pickingFood && (_jsx(FoodSearch, { title: "Adicionar item \u00E0 refei\u00E7\u00E3o", favoriteIds: h.favoriteIds, onClose: () => setPickingFood(false), onPick: (food, grams, meta) => {
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
                } }))] }));
}
function AddRepeatItemModal({ h, defaultMeal, onClose, onSaved, }) {
    const [meal, setMeal] = useState(defaultMeal);
    const [weekdays, setWeekdays] = useState([0, 1, 2, 3, 4, 5, 6]);
    const [picking, setPicking] = useState(true);
    function toggleDay(d) {
        setWeekdays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));
    }
    if (picking) {
        return (_jsx(FoodSearch, { title: "Escolher item recorrente", favoriteIds: h.favoriteIds, onClose: onClose, onPick: async (food, grams, meta) => {
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
            } }));
    }
    return (_jsxs(Modal, { title: "Dias do item recorrente", onClose: onClose, children: [_jsx(Field, { label: "Refei\u00E7\u00E3o", children: _jsx("select", { className: "input", value: meal, onChange: (e) => setMeal(e.target.value), children: MEALS.map((m) => _jsx("option", { value: m, children: m }, m)) }) }), _jsx("div", { className: "mb-4 flex flex-wrap gap-1.5", children: DAYS_SHORT.map((lbl, idx) => (_jsx("button", { type: "button", onClick: () => toggleDay(idx), className: `rounded-md border px-2.5 py-1 text-xs ${weekdays.includes(idx) ? 'border-brand bg-raised text-fg' : 'border-line text-fg3'}`, children: lbl }, idx))) }), _jsx("button", { type: "button", className: "btn-primary w-full justify-center", onClick: () => setPicking(true), children: "Escolher alimento" })] }));
}
