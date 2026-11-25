import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { num } from '../../lib/format';
import { Camera, CheckCircle2, ChefHat, ChevronDown, ChevronLeft, ChevronRight, Copy, Droplets, Plus, Repeat, Sparkles, Split, Undo2, X, } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { write } from '../../lib/useTable';
import { addDays, formatDay, toDay } from '../../lib/dates';
import { MEALS, netCarbsG, nutrientsFor, sumNutrients } from '../../lib/nutrition';
import { copyLogs, frequentFoods, recentFoods, rescaleLog } from '../../lib/diary';
import { HIGHLIGHTED_KEYS, MICRONUTRIENTS, computeNutrientBalances, computeNutritionScores, rdaFor, sumMicronutrients, } from '../../lib/micronutrients';
import { computeEnergySummary } from '../../lib/metabolism';
import { NutrientRing, TargetBar } from '../../components/Charts';
import { Field, Modal } from '../../components/ui';
import FoodSearch from './FoodSearch';
import RecipesAndMealsModal from './RecipesAndMealsModal';
import { energyForDay } from './energyForDay';
import { DEFAULT_WEIGHT_KG } from './useHealth';
const I = { size: 16, strokeWidth: 1.5, 'aria-hidden': true };
export default function Diet({ h, onOpenOracle }) {
    const [day, setDay] = useState(toDay(new Date()));
    const [adding, setAdding] = useState(null);
    const [recipesModalMeal, setRecipesModalMeal] = useState(null);
    const [adjusting, setAdjusting] = useState(false);
    const [editingLog, setEditingLog] = useState(null);
    const [copying, setCopying] = useState(null);
    const [customWaterModal, setCustomWaterModal] = useState(false);
    const [customWaterMl, setCustomWaterMl] = useState('350');
    const [showAllMicros, setShowAllMicros] = useState(false);
    const [netCarbsToggle, setNetCarbsToggle] = useState(null);
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
    const energySummary = useMemo(() => computeEnergySummary({
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
    }), [totals, h.latestWeight, h.profile, h.latestBodyFatPct, day, burned, effectiveTarget?.kcal]);
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
        return h.repeatItems.rows.filter((ri) => ri.active
            && ri.weekdays?.includes(weekdayNum)
            && !logs.some((l) => l.meal === ri.meal && l.food_name === ri.food_name));
    }, [h.repeatItems.rows, weekdayNum, logs]);
    async function toggleFavorite(foodId) {
        if (h.favoriteIds.has(foodId)) {
            if (await write(supabase.from('favorite_foods').delete().eq('food_id', foodId))) {
                await h.favorites.reload();
            }
        }
        else {
            if (await write(supabase.from('favorite_foods').insert({ food_id: foodId }))) {
                await h.favorites.reload();
            }
        }
    }
    async function upsertDayMeta(patch) {
        const ok = await write(supabase.from('diet_day_overrides').upsert({
            date: day,
            day_type: patch.day_type !== undefined ? patch.day_type : (override?.day_type ?? null),
            kcal: override?.kcal ?? null,
            protein_g: override?.protein_g ?? null,
            carbs_g: override?.carbs_g ?? null,
            fat_g: override?.fat_g ?? null,
            completed: patch.completed !== undefined ? patch.completed : (override?.completed ?? false),
            notes: patch.notes !== undefined ? patch.notes : (override?.notes ?? null),
        }, { onConflict: 'user_id,date' }));
        if (ok)
            void h.overrides.reload();
    }
    async function addWater(ml) {
        const nowTime = new Date().toTimeString().slice(0, 5);
        if (await write(supabase.from('water_logs').insert({ date: day, ml: Math.round(ml), logged_time: nowTime }))) {
            await h.waterLogs.reload();
        }
    }
    async function undoLastWater() {
        const last = dayWaterLogs[dayWaterLogs.length - 1];
        if (!last)
            return;
        if (await write(supabase.from('water_logs').delete().eq('id', last.id))) {
            await h.waterLogs.reload();
        }
    }
    async function applyPendingRepeats() {
        if (!pendingRepeats.length)
            return;
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
    async function explodeEntry(log) {
        if (!log.group_name)
            return;
        const [kind, id, multRaw] = log.group_name.split(':');
        const mult = Number(multRaw || 1) || 1;
        let expandedRows = [];
        if (kind === 'meal') {
            const cm = h.customMeals.rows.find((x) => x.id === id);
            if (!cm?.items?.length)
                return alert('Os itens originais desta refeição não foram encontrados.');
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
        }
        else if (kind === 'recipe') {
            const rec = h.customRecipes.rows.find((x) => x.id === id);
            if (!rec?.items?.length)
                return alert('Os ingredientes originais desta receita não foram encontrados.');
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
        if (!expandedRows.length)
            return;
        if (await write(supabase.from('food_logs').insert(expandedRows))) {
            await write(supabase.from('food_logs').delete().eq('id', log.id));
            await h.foodLogs.reload();
        }
    }
    return (_jsxs(_Fragment, { children: [_jsxs("div", { className: "mb-4 flex flex-wrap items-center gap-2", children: [_jsx("button", { className: "btn-ghost", onClick: () => setDay(addDays(day, -1)), "aria-label": "Dia anterior", children: _jsx(ChevronLeft, { ...I }) }), _jsx("span", { className: "min-w-44 text-center font-medium", children: formatDay(day) }), _jsx("button", { className: "btn-ghost", onClick: () => setDay(addDays(day, 1)), "aria-label": "Pr\u00F3ximo dia", children: _jsx(ChevronRight, { ...I }) }), day !== toDay(new Date()) && (_jsx("button", { className: "btn-ghost", onClick: () => setDay(toDay(new Date())), children: "Hoje" })), _jsxs("button", { type: "button", className: `btn-secondary text-xs ${override?.completed ? 'border-positive text-positive' : ''}`, onClick: () => void upsertDayMeta({ completed: !override?.completed }), children: [_jsx(CheckCircle2, { ...I }), override?.completed ? 'Dia completo' : 'Marcar dia completo'] }), _jsxs("div", { className: "ml-auto flex flex-wrap items-center gap-2", children: [_jsxs("button", { type: "button", className: "btn-secondary text-xs", onClick: () => setRecipesModalMeal('Almoço'), children: [_jsx(ChefHat, { ...I }), " Receitas & Refei\u00E7\u00F5es"] }), onOpenOracle && (_jsxs("button", { type: "button", className: "btn-secondary text-xs", onClick: onOpenOracle, children: [_jsx(Sparkles, { ...I }), " Or\u00E1culo IA"] })), _jsxs("button", { type: "button", className: "btn-secondary text-xs", onClick: () => setCopying({}), children: [_jsx(Copy, { ...I }), " Copiar dia"] })] })] }), pendingRepeats.length > 0 && (_jsxs("div", { className: "mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-raised/50 px-4 py-2.5 text-sm", children: [_jsxs("span", { className: "inline-flex items-center gap-2 text-fg2", children: [_jsx(Repeat, { size: 15, strokeWidth: 1.5, className: "text-brand" }), "Voc\u00EA tem ", _jsx("strong", { children: pendingRepeats.length }), " ", pendingRepeats.length === 1 ? 'item recorrente agendado' : 'itens recorrentes agendados', " para hoje (", pendingRepeats.map((p) => p.food_name).join(', '), ")."] }), _jsx("button", { type: "button", className: "btn-primary h-8 px-3 text-xs", onClick: () => void applyPendingRepeats(), children: "Lan\u00E7ar recorrentes" })] })), _jsxs("div", { className: "grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]", children: [_jsxs("div", { className: "min-w-0 space-y-3", children: [_jsxs("section", { className: "card", children: [_jsxs("div", { className: "mb-2.5 flex flex-wrap items-center gap-2", children: [_jsx(Droplets, { ...I, className: "text-info" }), _jsxs("div", { className: "mr-auto", children: [_jsx("span", { className: "font-medium text-fg", children: "\u00C1gua" }), _jsxs("span", { className: "figure ml-2 text-xs text-fg2", children: [num(drunkMl), " / ", num(waterGoalMl), " mL"] }), micros.water_g > 0 && (_jsxs("span", { className: "figure ml-2 text-xs text-fg3", children: ["(Total c/ alimentos: ", num(totalWaterMl), " mL)"] }))] }), dayWaterLogs.length > 0 && (_jsx("button", { type: "button", className: "btn-ghost h-7 px-2 text-xs text-fg3", onClick: () => void undoLastWater(), title: "Desfazer \u00FAltimo copo", children: _jsx(Undo2, { size: 14, strokeWidth: 1.5 }) })), _jsxs("button", { type: "button", className: "btn-ghost h-7 px-2 text-xs", onClick: () => setCustomWaterModal(true), children: [_jsx(Plus, { size: 14, strokeWidth: 1.5 }), " Outro valor"] })] }), _jsx("div", { className: "mb-2.5 h-1.5 rounded-full bg-raised", children: _jsx("div", { className: "h-1.5 rounded-full transition-[width] duration-300", style: { width: `${Math.min(100, (drunkMl / waterGoalMl) * 100)}%`, background: 'var(--info)' } }) }), _jsx("div", { className: "flex flex-wrap items-center gap-1.5", children: Array.from({ length: totalCups }).map((_, idx) => {
                                            const filled = idx < filledCups;
                                            return (_jsxs("button", { type: "button", onClick: () => void addWater(waterCupMl), className: `inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-xs transition-colors ${filled
                                                    ? 'border-info/50 bg-raised text-fg'
                                                    : 'border-line text-fg3 hover:border-line-strong hover:text-fg2'}`, title: `Adicionar +${waterCupMl} mL`, children: [_jsx(Droplets, { size: 13, strokeWidth: 1.5, className: filled ? 'text-info' : 'text-fg3' }), _jsxs("span", { className: "figure", children: ["+", waterCupMl] })] }, idx));
                                        }) })] }), MEALS.map((meal) => {
                                const items = logs.filter((l) => l.meal === meal);
                                const sub = sumNutrients(items);
                                return (_jsxs("section", { className: "card", children: [_jsxs("div", { className: "mb-2 flex items-start gap-2", children: [_jsxs("div", { className: "min-w-0", children: [_jsx("h3", { className: "font-medium", children: meal }), items.length > 0 && (_jsxs("div", { className: "text-xs text-fg3", children: [_jsx("span", { className: "figure", children: num(sub.kcal) }), " kcal \u00B7 P ", num(sub.protein_g), " \u00B7 C ", num(useNetCarbs ? netCarbsG(sub.carbs_g, sub.fiber_g) : sub.carbs_g), " \u00B7 G ", num(sub.fat_g)] }))] }), _jsx("button", { className: "icon-btn ml-auto", onClick: () => setCopying({ meal }), "aria-label": `Copiar ${meal} de outro dia`, title: "Copiar de outro dia", children: _jsx(Copy, { ...I }) }), _jsx("button", { type: "button", className: "btn-ghost h-8 px-2 text-xs", onClick: () => setRecipesModalMeal(meal), title: "Lan\u00E7ar receita ou refei\u00E7\u00E3o salva", children: _jsx(ChefHat, { size: 15, strokeWidth: 1.5 }) }), _jsxs("button", { className: "btn-ghost", onClick: () => setAdding(meal), children: [_jsx(Plus, { ...I }), "Alimento"] })] }), _jsx("ul", { className: "text-sm", children: items.map((l) => {
                                                const canExplode = !!l.group_name && (l.group_name.startsWith('meal:') || l.group_name.startsWith('recipe:'));
                                                const measureDesc = l.measure_label && l.measure_label !== 'Gramas (g)' && l.measure_label !== 'g'
                                                    ? `${num(l.measure_qty ?? 1)} × ${l.measure_label} (${num(l.quantity_g)} g)`
                                                    : `${num(l.quantity_g)} g`;
                                                return (_jsxs("li", { className: "flex items-center gap-2 border-t border-line", children: [_jsxs("button", { className: "flex min-w-0 flex-1 items-center gap-2 py-2 text-left", onClick: () => setEditingLog(l), "aria-label": `Editar ${l.food_name}`, children: [l.logged_time && (_jsx("span", { className: "figure shrink-0 rounded bg-raised px-1.5 py-0.5 text-[11px] text-fg3", children: l.logged_time.slice(0, 5) })), _jsxs("span", { className: "mr-auto truncate", children: [l.food_name, " ", _jsxs("span", { className: "text-fg3", children: ["\u00B7 ", measureDesc] })] }), _jsxs("span", { className: "figure shrink-0 text-xs text-fg3", children: [num(l.kcal), " kcal"] })] }), canExplode && (_jsxs("button", { type: "button", className: "rounded border border-line px-1.5 py-0.5 text-[11px] text-fg2 hover:bg-raised hover:text-fg", title: "Explodir em ingredientes individuais", onClick: () => void explodeEntry(l), children: [_jsx(Split, { size: 12, strokeWidth: 1.5, className: "mr-0.5 inline" }), "Explodir"] })), _jsx("button", { className: "text-fg3 hover:text-negative", "aria-label": `Remover ${l.food_name}`, onClick: async () => {
                                                                if (await write(supabase.from('food_logs').delete().eq('id', l.id)))
                                                                    void h.foodLogs.reload();
                                                            }, children: _jsx(X, { ...I }) })] }, l.id));
                                            }) }), _jsx(MealPhotos, { day: day, meal: meal })] }, meal));
                            }), _jsxs("section", { className: "card", children: [_jsxs("div", { className: "mb-2 flex items-center justify-between", children: [_jsxs("span", { className: "label", children: ["Nota do di\u00E1rio (", formatDay(day).split(',')[0], ")"] }), noteDraft !== (override?.notes ?? '') && (_jsx("button", { type: "button", className: "btn-secondary h-7 px-2.5 text-xs", onClick: () => void upsertDayMeta({ notes: noteDraft.trim() || null }), children: "Salvar nota" }))] }), _jsx("textarea", { rows: 2, className: "input resize-none text-sm", placeholder: "Registre digest\u00E3o, energia, fome, refei\u00E7\u00E3o livre ou sintomas do dia\u2026", value: noteDraft, onChange: (e) => setNoteDraft(e.target.value) })] })] }), _jsxs("aside", { className: "space-y-4", children: [_jsxs("section", { className: "card", children: [_jsxs("div", { className: "mb-3 flex items-center gap-2", children: [_jsx("div", { className: "label mr-auto", children: "Resumo Energ\u00E9tico" }), _jsxs("select", { className: "input w-auto py-1 text-xs", "aria-label": "Tipo do dia", value: override?.day_type ?? 'auto', onChange: (e) => void upsertDayMeta({ day_type: e.target.value === 'auto' ? null : e.target.value }), children: [_jsxs("option", { value: "auto", children: ["autom\u00E1tico (", dayType === 'training' ? 'treino' : 'descanso', ")"] }), _jsx("option", { value: "training", children: "dia de treino" }), _jsx("option", { value: "rest", children: "dia de descanso" })] })] }), _jsxs("div", { className: "mb-4 grid grid-cols-3 gap-2 rounded-xl border border-line bg-raised/40 p-3 text-center", children: [_jsxs("div", { children: [_jsx("div", { className: "text-[11px] text-fg3", children: "Consumido" }), _jsx("div", { className: "figure mt-0.5 text-base font-medium text-fg", children: num(energySummary.consumed) }), _jsx("div", { className: "text-[10px] text-fg3", children: "kcal" })] }), _jsxs("div", { className: "border-x border-line px-1", children: [_jsx("div", { className: "text-[11px] text-fg3", children: "Gasto total" }), _jsx("div", { className: "figure mt-0.5 text-base font-medium text-fg", children: num(energySummary.totalExpenditure) }), _jsx("div", { className: "text-[10px] text-fg3", children: "TMB+Ativ+TEF" })] }), _jsxs("div", { children: [_jsx("div", { className: "text-[11px] text-fg3", children: energySummary.remainingToTarget !== null ? 'Restante' : 'Balanço' }), _jsx("div", { className: `figure mt-0.5 text-base font-medium ${(energySummary.remainingToTarget ?? -energySummary.netBalance) < 0 ? 'text-negative' : 'text-positive'}`, children: num(energySummary.remainingToTarget ?? energySummary.netBalance) }), _jsx("div", { className: "text-[10px] text-fg3", children: "kcal" })] })] }), _jsxs("div", { className: "mb-4 flex flex-wrap justify-between gap-x-2 gap-y-1 text-[11px] text-fg3", children: [_jsxs("span", { children: ["TMB: ", _jsx("strong", { className: "figure text-fg2", children: num(energySummary.bmr) })] }), _jsxs("span", { children: ["Ativ.: ", _jsx("strong", { className: "figure text-fg2", children: num(energySummary.baselineActivity) })] }), _jsxs("span", { children: ["Treino: ", _jsxs("strong", { className: "figure text-fg2", children: [num(burned), estimated && burned > 0 ? '*' : ''] })] }), _jsxs("span", { children: ["TEF: ", _jsx("strong", { className: "figure text-fg2", children: num(energySummary.tef) })] })] }), _jsxs("div", { className: "mb-2 flex items-center justify-between", children: [_jsx("span", { className: "text-xs font-medium text-fg2", children: "Metas de Macronutrientes" }), _jsx("button", { type: "button", className: "text-[11px] text-fg3 underline hover:text-fg", onClick: () => setNetCarbsToggle(!useNetCarbs), children: useNetCarbs ? 'Usando Carbo Líquido' : 'Usar Carbo Líquido' })] }), effectiveTarget ? (_jsxs(_Fragment, { children: [_jsx(TargetBar, { label: "Calorias", consumed: totals.kcal, target: effectiveTarget.kcal, unit: "kcal" }), _jsx(TargetBar, { label: "Prote\u00EDna", consumed: totals.protein_g, target: effectiveTarget.protein_g, unit: "g" }), _jsx(TargetBar, { label: useNetCarbs ? 'Carboidratos Líquidos' : 'Carboidrato', consumed: displayedCarbs, target: effectiveTarget.carbs_g, unit: "g" }), _jsx(TargetBar, { label: "Gordura", consumed: totals.fat_g, target: effectiveTarget.fat_g, unit: "g" }), _jsxs("p", { className: "text-xs text-fg3", children: ["Base: ", effectiveTarget.basis, " \u00B7 fibra ", _jsxs("span", { className: "figure", children: [num(totals.fiber_g), " g"] })] }), _jsxs("div", { className: "mt-3 flex flex-wrap gap-2", children: [_jsx("button", { className: "btn-ghost h-8 px-2 text-xs", onClick: () => setAdjusting(true), children: "Ajustar macros deste dia" }), onOpenOracle && (_jsxs("button", { type: "button", className: "btn-secondary ml-auto h-8 px-2.5 text-xs", onClick: onOpenOracle, children: [_jsx(Sparkles, { size: 13, strokeWidth: 1.5 }), " Sugerir alimentos"] }))] })] })) : (_jsxs("p", { className: "text-sm text-fg3", children: ["Cadastre suas metas na aba Plano para comparar o dia. Total at\u00E9 agora: ", num(totals.kcal), " kcal \u00B7 P ", num(totals.protein_g), " g \u00B7 C ", num(displayedCarbs), " g \u00B7 G ", num(totals.fat_g), " g."] }))] }), _jsxs("section", { className: "card", children: [_jsx("div", { className: "label mb-3", children: "Nutrientes em Destaque" }), _jsx("div", { className: "grid grid-cols-4 gap-y-4 gap-x-2", children: HIGHLIGHTED_KEYS.map((key) => {
                                            const meta = MICRONUTRIENTS.find((m) => m.key === key);
                                            const rda = rdaFor(meta, h.profile?.sex);
                                            const val = micros[key] ?? 0;
                                            const pct = rda > 0 ? Math.round((val / rda) * 100) : 0;
                                            const over = meta.ul !== undefined && val > meta.ul;
                                            return (_jsx(NutrientRing, { label: meta.shortLabel, pct: pct, sublabel: `${num(val, val < 10 ? 1 : 0)}${meta.unit}`, size: 58, overLimit: over }, key));
                                        }) })] }), _jsxs("section", { className: "card", children: [_jsx("div", { className: "label mb-3", children: "Nutrition Scores" }), _jsx("div", { className: "space-y-2.5", children: scores.map((s) => (_jsxs("div", { title: s.detail, children: [_jsxs("div", { className: "mb-1 flex items-baseline justify-between text-xs", children: [_jsx("span", { className: "text-fg2", children: s.label }), _jsxs("span", { className: "figure font-medium text-fg", children: [s.pct, "%"] })] }), _jsx("div", { className: "h-1.5 rounded-full bg-raised", children: _jsx("div", { className: "h-1.5 rounded-full transition-[width] duration-300", style: { width: `${s.pct}%`, background: s.pct >= 80 ? 'var(--positive)' : 'var(--brand)' } }) })] }, s.id))) })] }), _jsxs("section", { className: "card", children: [_jsx("div", { className: "label mb-2.5", children: "Equil\u00EDbrio Nutricional" }), _jsx("ul", { className: "divide-y divide-line text-xs", children: balances.map((b) => (_jsxs("li", { className: "flex items-center justify-between py-2", children: [_jsxs("div", { children: [_jsx("div", { className: "font-medium text-fg2", children: b.label }), _jsxs("div", { className: "text-[11px] text-fg3", children: ["Ideal: ", b.idealRange] })] }), _jsx("span", { className: `figure font-medium ${b.status === 'optimal' ? 'text-positive' : b.status === 'empty' ? 'text-fg3' : 'text-warning'}`, children: b.valueLabel })] }, b.id))) })] }), _jsxs("section", { className: "card", children: [_jsxs("button", { type: "button", className: "flex w-full items-center justify-between text-left", onClick: () => setShowAllMicros(!showAllMicros), children: [_jsxs("span", { className: "label", children: ["Tabela Completa de Micronutrientes (", MICRONUTRIENTS.length, ")"] }), _jsx(ChevronDown, { size: 16, strokeWidth: 1.5, className: `text-fg3 transition-transform ${showAllMicros ? 'rotate-180' : ''}` })] }), showAllMicros && (_jsx("div", { className: "mt-3 space-y-4 border-t border-line pt-3", children: ['Minerais', 'Vitaminas', 'Lipídios & Outros'].map((cat) => (_jsxs("div", { children: [_jsx("div", { className: "mb-1.5 text-xs font-medium text-fg", children: cat }), _jsx("ul", { className: "divide-y divide-line text-xs", children: MICRONUTRIENTS.filter((m) => m.category === cat).map((m) => {
                                                        const val = micros[m.key] ?? 0;
                                                        const rda = rdaFor(m, h.profile?.sex);
                                                        const pct = rda > 0 ? Math.round((val / rda) * 100) : 0;
                                                        const overUl = m.ul !== undefined && val > m.ul;
                                                        return (_jsxs("li", { className: "py-1.5", children: [_jsxs("div", { className: "flex items-baseline justify-between", children: [_jsx("span", { className: "text-fg2", children: m.label }), _jsxs("span", { className: `figure ${overUl ? 'text-negative font-medium' : 'text-fg'}`, children: [num(val, val > 0 && val < 10 ? 1 : 0), " / ", num(rda), " ", m.unit, " (", pct, "%)"] })] }), _jsx("div", { className: "mt-1 h-1 rounded-full bg-raised", children: _jsx("div", { className: "h-1 rounded-full", style: {
                                                                            width: `${Math.min(100, pct)}%`,
                                                                            background: overUl ? 'var(--negative)' : pct >= 100 ? 'var(--positive)' : 'var(--brand)',
                                                                        } }) })] }, m.key));
                                                    }) })] }, cat))) }))] })] })] }), adding && (_jsx(FoodSearch, { title: `Adicionar em ${adding}`, recent: recent, frequent: frequent, favoriteIds: h.favoriteIds, onToggleFavorite: toggleFavorite, allowTimestamp: true, onClose: () => setAdding(null), onPick: async (food, grams, meta) => {
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
                } })), recipesModalMeal && (_jsx(RecipesAndMealsModal, { h: h, day: day, defaultMeal: recipesModalMeal, onClose: () => setRecipesModalMeal(null) })), customWaterModal && (_jsx(Modal, { title: "Registrar \u00E1gua", onClose: () => setCustomWaterModal(false), children: _jsxs("form", { onSubmit: async (e) => {
                        e.preventDefault();
                        await addWater(Number(customWaterMl));
                        setCustomWaterModal(false);
                    }, children: [_jsx(Field, { label: "Volume (mL)", children: _jsx("input", { className: "input figure", type: "number", min: 10, max: 5000, step: 10, value: customWaterMl, onChange: (e) => setCustomWaterMl(e.target.value), autoFocus: true, required: true }) }), _jsx("button", { className: "btn-primary w-full justify-center", children: "Adicionar \u00E1gua" })] }) })), adjusting && effectiveTarget && _jsx(AdjustDay, { h: h, day: day, current: effectiveTarget, onClose: () => setAdjusting(false) }), editingLog && _jsx(EditLog, { h: h, log: editingLog, onClose: () => setEditingLog(null) }), copying && _jsx(CopyFrom, { h: h, toDay: day, meal: copying.meal, onClose: () => setCopying(null) })] }));
}
function EditLog({ h, log, onClose }) {
    const [grams, setGrams] = useState(log.quantity_g);
    const [meal, setMeal] = useState(log.meal);
    const [loggedTime, setLoggedTime] = useState(log.logged_time ?? '');
    const preview = rescaleLog(log, grams || 0);
    async function save() {
        const ratio = log.quantity_g > 0 ? (grams || 0) / log.quantity_g : 1;
        const scaledMicros = {};
        if (log.nutrients) {
            for (const [k, v] of Object.entries(log.nutrients)) {
                if (typeof v === 'number')
                    scaledMicros[k] = Math.round(v * ratio * 100) / 100;
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
    return (_jsxs(Modal, { title: log.food_name, onClose: onClose, children: [_jsxs("div", { className: "grid grid-cols-3 gap-3", children: [_jsx(Field, { label: "Quantidade (g)", children: _jsx("input", { className: "input", type: "number", min: 1, step: "any", value: grams, onChange: (e) => setGrams(Number(e.target.value)), autoFocus: true }) }), _jsx(Field, { label: "Refei\u00E7\u00E3o", children: _jsx("select", { className: "input", value: meal, onChange: (e) => setMeal(e.target.value), children: MEALS.map((m) => _jsx("option", { value: m, children: m }, m)) }) }), _jsx(Field, { label: "Hor\u00E1rio", children: _jsx("input", { className: "input", type: "time", value: loggedTime, onChange: (e) => setLoggedTime(e.target.value) }) })] }), _jsxs("p", { className: "mb-5 text-sm text-fg2", children: [_jsx("span", { className: "figure", children: num(preview.kcal) }), " kcal \u00B7 Prote\u00EDna ", num(preview.protein_g), " g \u00B7 Carboidrato ", num(preview.carbs_g), " g \u00B7 Gordura ", num(preview.fat_g), " g"] }), _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { className: "btn-ghost text-negative", onClick: remove, children: "Excluir" }), _jsx("button", { className: "btn-primary ml-auto", onClick: save, disabled: !grams, children: "Salvar" })] })] }));
}
function CopyFrom({ h, toDay: target, meal, onClose }) {
    const [from, setFrom] = useState(addDays(target, -1));
    const [fromMeal, setFromMeal] = useState(meal ?? '');
    const rows = copyLogs(h.foodLogs.rows, { day: from, meal: fromMeal || undefined }, { day: target, meal });
    async function copy() {
        if (!rows.length)
            return;
        const clean = rows.map(({ date, meal: m, food_id, food_name, quantity_g, kcal, protein_g, carbs_g, fat_g, fiber_g, nutrients, measure_label, measure_qty, is_supplement }) => ({ date, meal: m, food_id, food_name, quantity_g, kcal, protein_g, carbs_g, fat_g, fiber_g, nutrients: nutrients ?? {}, measure_label, measure_qty, is_supplement: !!is_supplement }));
        if (await write(supabase.from('food_logs').insert(clean))) {
            await h.foodLogs.reload();
            onClose();
        }
    }
    return (_jsxs(Modal, { title: meal ? `Copiar para ${meal}` : `Copiar para ${formatDay(target)}`, onClose: onClose, children: [_jsxs("div", { className: "grid grid-cols-2 gap-3", children: [_jsx(Field, { label: "Do dia", children: _jsx("input", { className: "input", type: "date", value: from, onChange: (e) => setFrom(e.target.value) }) }), _jsx(Field, { label: "Refei\u00E7\u00E3o de origem", children: _jsxs("select", { className: "input", value: fromMeal, onChange: (e) => setFromMeal(e.target.value), children: [!meal && _jsx("option", { value: "", children: "Dia inteiro" }), MEALS.map((m) => _jsx("option", { value: m, children: m }, m))] }) })] }), _jsxs("ul", { className: "mb-5 max-h-48 overflow-y-auto text-sm", children: [rows.map((r, i) => _jsxs("li", { className: "flex gap-2 border-t border-line py-1.5", children: [_jsx("span", { className: "mr-auto", children: r.food_name }), _jsxs("span", { className: "figure text-fg3", children: [num(r.quantity_g), " g"] })] }, i)), !rows.length && _jsx("li", { className: "py-4 text-center text-fg3", children: "Nada registrado nessa origem" })] }), _jsxs("button", { className: "btn-primary w-full justify-center", onClick: copy, disabled: !rows.length, children: ["Copiar ", rows.length, " ", rows.length === 1 ? 'item' : 'itens'] })] }));
}
function AdjustDay({ h, day, current, onClose }) {
    const o = h.overrides.rows.find((x) => x.date === day);
    const [v, setV] = useState({ kcal: String(o?.kcal ?? ''), protein_g: String(o?.protein_g ?? ''), carbs_g: String(o?.carbs_g ?? ''), fat_g: String(o?.fat_g ?? '') });
    const toNum = (s) => (s === '' ? null : Number(s));
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
    const field = (k, label, placeholder) => (_jsx(Field, { label: label, children: _jsx("input", { className: "input", type: "number", min: 0, value: v[k], placeholder: String(placeholder), onChange: (e) => setV({ ...v, [k]: e.target.value }) }) }));
    return (_jsxs(Modal, { title: `Ajuste de ${formatDay(day)}`, onClose: onClose, children: [_jsx("p", { className: "mb-3 text-xs text-fg3", children: "Deixe em branco o que deve seguir o plano. Os valores em cinza s\u00E3o os atuais." }), _jsxs("div", { className: "grid grid-cols-2 gap-2", children: [field('kcal', 'Calorias', current.kcal), field('protein_g', 'Proteína (g)', current.protein_g), field('carbs_g', 'Carboidrato (g)', current.carbs_g), field('fat_g', 'Gordura (g)', current.fat_g)] }), _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { className: "btn-ghost", onClick: () => save(true), children: "Voltar ao plano" }), _jsx("button", { className: "btn-primary ml-auto", onClick: () => save(), children: "Salvar ajuste" })] })] }));
}
function MealPhotos({ day, meal }) {
    const [photos, setPhotos] = useState([]);
    const [busy, setBusy] = useState(false);
    async function load() {
        const { data } = await supabase.from('meal_photos').select('id,storage_path').eq('date', day).eq('meal', meal);
        const rows = (data ?? []);
        if (!rows.length)
            return setPhotos([]);
        const { data: urls } = await supabase.storage.from('meal-photos').createSignedUrls(rows.map((r) => r.storage_path), 3600);
        setPhotos(rows.map((r, i) => ({ ...r, url: urls?.[i]?.signedUrl ?? '' })));
    }
    useEffect(() => { void load(); }, [day, meal]);
    async function upload(file) {
        setBusy(true);
        const { data: auth } = await supabase.auth.getUser();
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
        const path = `${auth.user?.id}/${day}-${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from('meal-photos').upload(path, file, { contentType: file.type });
        if (error)
            alert(`Não foi possível enviar a foto: ${error.message}`);
        else if (await write(supabase.from('meal_photos').insert({ date: day, meal, storage_path: path })))
            await load();
        setBusy(false);
    }
    async function remove(p) {
        if (!confirm('Excluir esta foto?'))
            return;
        await supabase.storage.from('meal-photos').remove([p.storage_path]);
        if (await write(supabase.from('meal_photos').delete().eq('id', p.id)))
            await load();
    }
    return (_jsxs("div", { className: "mt-2 flex flex-wrap items-center gap-2", children: [photos.map((p) => (_jsxs("figure", { className: "relative", children: [_jsx("img", { src: p.url, alt: `Foto de ${meal}`, className: "h-16 w-16 rounded-lg object-cover" }), _jsx("button", { className: "absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-md border border-line bg-surface text-fg2", "aria-label": "Excluir foto", onClick: () => remove(p), children: _jsx(X, { size: 14, strokeWidth: 1.5 }) })] }, p.id))), _jsxs("label", { className: `btn-ghost cursor-pointer text-xs ${busy ? 'opacity-50' : ''}`, children: [_jsx(Camera, { size: 16, strokeWidth: 1.5 }), busy ? 'Enviando…' : 'Foto do prato', _jsx("input", { type: "file", accept: "image/*", capture: "environment", className: "hidden", disabled: busy, onChange: (e) => { const f = e.target.files?.[0]; if (f)
                            void upload(f); e.target.value = ''; } })] })] }));
}
