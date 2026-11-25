import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { Bot, Plus, Search, Sparkles } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { write } from '../../lib/useTable';
import { toDay } from '../../lib/dates';
import { num } from '../../lib/format';
import { MEALS, nutrientsFor, sumNutrients } from '../../lib/nutrition';
import { MICRONUTRIENTS, buildOracleAiPrompt, micronutrientsPer100g, rankFoodsByNutrient, rdaFor, scaleMicronutrients, sumMicronutrients, } from '../../lib/micronutrients';
import { openAssistantDrawer } from '../../components/AssistantDrawer';
import { energyForDay } from './energyForDay';
const I = { size: 16, strokeWidth: 1.5, 'aria-hidden': true };
const DIETS = ['Nenhuma', 'Vegetariana', 'Vegana', 'Pescetariana', 'Sem Glúten', 'Low-Carb / Keto'];
const EXCLUSIONS = ['Laticínios', 'Ovos', 'Peixe', 'Amendoim', 'Soja', 'Castanhas'];
const COLUMNS = 'id,name,brand,source,country,kcal,protein_g,carbs_g,fat_g,fiber_g,default_serving_g,nutrients,measures,is_supplement';
export default function OraclePanel({ h }) {
    const today = toDay(new Date());
    const [catalog, setCatalog] = useState([]);
    const [loadingCatalog, setLoadingCatalog] = useState(true);
    // AI Suggester state
    const [meal, setMeal] = useState('Jantar');
    const [diet, setDiet] = useState('Nenhuma');
    const [exclusions, setExclusions] = useState([]);
    // Nutrient Oracle ranking state
    const [nutrient, setNutrient] = useState('potassium_mg');
    const [rankMode, setRankMode] = useState('oracle');
    const [filterText, setFilterText] = useState('');
    useEffect(() => {
        let active = true;
        supabase
            .from('foods')
            .select(COLUMNS)
            .limit(400)
            .then(({ data }) => {
            if (active) {
                setCatalog((data ?? []));
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
    function toggleExclusion(item) {
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
    async function quickLogFood(food) {
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
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("section", { className: "card", children: [_jsxs("div", { className: "mb-4 flex flex-wrap items-start gap-3", children: [_jsxs("div", { className: "mr-auto", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Sparkles, { ...I, className: "text-brand" }), _jsx("h2", { className: "text-base font-medium text-fg", children: "Sugest\u00E3o Inteligente de Alimentos \u00B7 Agente IA" })] }), _jsx("p", { className: "mt-0.5 text-[13px] text-fg3", children: "Cruza seus macros restantes e as lacunas de micronutrientes de hoje diretamente com o Assistente IA da plataforma, que pode montar e registrar a refei\u00E7\u00E3o para voc\u00EA." })] }), _jsxs("button", { type: "button", className: "btn-primary", onClick: askAiOracle, children: [_jsx(Bot, { ...I }), " Pedir sugest\u00E3o ao Agente IA"] })] }), _jsxs("div", { className: "mb-4 grid gap-3 rounded-xl border border-line bg-raised/40 p-3.5 sm:grid-cols-2 lg:grid-cols-5", children: [_jsxs("div", { children: [_jsx("div", { className: "text-[11px] text-fg3", children: "Calorias restantes" }), _jsxs("div", { className: "figure mt-0.5 text-base font-medium text-fg", children: [num(remaining.kcal), " kcal"] })] }), _jsxs("div", { children: [_jsx("div", { className: "text-[11px] text-fg3", children: "Prote\u00EDna restante" }), _jsxs("div", { className: "figure mt-0.5 text-base font-medium text-fg", children: [num(remaining.protein_g), " g"] })] }), _jsxs("div", { children: [_jsx("div", { className: "text-[11px] text-fg3", children: "Carbo restante" }), _jsxs("div", { className: "figure mt-0.5 text-base font-medium text-fg", children: [num(remaining.carbs_g), " g"] })] }), _jsxs("div", { children: [_jsx("div", { className: "text-[11px] text-fg3", children: "Gordura restante" }), _jsxs("div", { className: "figure mt-0.5 text-base font-medium text-fg", children: [num(remaining.fat_g), " g"] })] }), _jsxs("div", { children: [_jsx("div", { className: "text-[11px] text-fg3", children: "Maiores lacunas micro" }), _jsx("div", { className: "mt-0.5 truncate text-xs text-fg2", children: lowestMicronutrients.map((m) => `${m.shortLabel} (${m.pct}%)`).join(' · ') })] })] }), _jsxs("div", { className: "grid gap-4 md:grid-cols-3", children: [_jsxs("div", { children: [_jsx("div", { className: "label mb-1.5", children: "Refei\u00E7\u00E3o alvo" }), _jsx("select", { className: "input", value: meal, onChange: (e) => setMeal(e.target.value), children: MEALS.map((m) => _jsx("option", { value: m, children: m }, m)) })] }), _jsxs("div", { children: [_jsx("div", { className: "label mb-1.5", children: "Padr\u00E3o alimentar" }), _jsx("select", { className: "input", value: diet, onChange: (e) => setDiet(e.target.value), children: DIETS.map((d) => _jsx("option", { value: d, children: d }, d)) })] }), _jsxs("div", { children: [_jsx("div", { className: "label mb-1.5", children: "Exclus\u00F5es / Al\u00E9rgenos" }), _jsx("div", { className: "flex flex-wrap gap-1.5", children: EXCLUSIONS.map((ex) => {
                                            const active = exclusions.includes(ex);
                                            return (_jsx("button", { type: "button", onClick: () => toggleExclusion(ex), className: `rounded-md border px-2.5 py-1 text-xs transition-colors ${active ? 'border-brand bg-raised text-fg font-medium' : 'border-line text-fg3 hover:text-fg2'}`, children: ex }, ex));
                                        }) })] })] }), smartMatches.length > 0 && (_jsxs("div", { className: "mt-5 border-t border-line pt-4", children: [_jsx("div", { className: "mb-2.5 flex items-center justify-between", children: _jsxs("span", { className: "text-xs text-fg3", children: ["Destaques r\u00E1pidos do cat\u00E1logo para repor ", _jsx("strong", { className: "font-medium text-fg2", children: lowestMicronutrients[0]?.label })] }) }), _jsx("div", { className: "grid gap-2 sm:grid-cols-2 lg:grid-cols-3", children: smartMatches.map((hit) => (_jsxs("div", { className: "flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm", children: [_jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("div", { className: "truncate font-medium text-fg", children: hit.food.name }), _jsxs("div", { className: "figure text-[11px] text-fg3", children: [num(hit.amountPer100g), " ", hit.unit, "/100g \u00B7 ", num(hit.food.kcal), " kcal"] })] }), _jsxs("button", { type: "button", className: "btn-ghost h-8 shrink-0 px-2 text-xs", onClick: () => quickLogFood(hit.food), title: `Adicionar em ${meal}`, children: [_jsx(Plus, { size: 14, strokeWidth: 1.5 }), " ", meal.split(' ')[0]] })] }, hit.food.id))) })] }))] }), _jsxs("section", { className: "card", children: [_jsxs("div", { className: "mb-4 flex flex-wrap items-end gap-3", children: [_jsxs("div", { className: "mr-auto", children: [_jsx("h2", { className: "text-base font-medium text-fg", children: "Pergunte ao Or\u00E1culo \u00B7 Ranking por Nutriente" }), _jsx("p", { className: "text-[13px] text-fg3", children: "Descubra os alimentos mais densos em qualquer vitamina, mineral, prote\u00EDna ou fibra por caloria ou por peso." })] }), _jsx("div", { className: "segmented", children: [
                                    ['oracle', 'Oráculo'],
                                    ['per_100kcal', 'Por 100 kcal'],
                                    ['per_100g', 'Por 100 g'],
                                ].map(([id, lbl]) => (_jsx("button", { type: "button", className: rankMode === id ? 'tab-active' : 'tab', onClick: () => setRankMode(id), children: lbl }, id))) })] }), _jsxs("div", { className: "mb-4 grid gap-3 sm:grid-cols-2", children: [_jsxs("div", { children: [_jsx("label", { className: "label mb-1.5 block", children: "Nutriente pesquisado" }), _jsxs("select", { className: "input", "aria-label": "Nutriente pesquisado", value: nutrient, onChange: (e) => setNutrient(e.target.value), children: [_jsxs("optgroup", { label: "Macronutrientes", children: [_jsx("option", { value: "protein_g", children: "Prote\u00EDna (g)" }), _jsx("option", { value: "fiber_g", children: "Fibras (g)" })] }), ['Minerais', 'Vitaminas', 'Lipídios & Outros'].map((cat) => (_jsx("optgroup", { label: cat, children: MICRONUTRIENTS.filter((m) => m.category === cat).map((m) => (_jsxs("option", { value: m.key, children: [m.label, " (", m.unit, ")"] }, m.key))) }, cat)))] })] }), _jsxs("div", { children: [_jsx("label", { className: "label mb-1.5 block", children: "Filtrar nome do alimento" }), _jsxs("div", { className: "relative", children: [_jsx(Search, { size: 15, strokeWidth: 1.5, className: "pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg3" }), _jsx("input", { className: "input pl-9", placeholder: "Ex.: frango, aveia, espinafre\u2026", value: filterText, onChange: (e) => setFilterText(e.target.value) })] })] })] }), loadingCatalog ? (_jsx("p", { className: "py-6 text-center text-sm text-fg3", children: "Carregando cat\u00E1logo nutricional\u2026" })) : oracleHits.length === 0 ? (_jsx("p", { className: "py-6 text-center text-sm text-fg3", children: "Nenhum alimento com esse nutriente mapeado para o filtro atual." })) : (_jsx("ul", { className: "divide-y divide-line text-sm", children: oracleHits.map((hit, idx) => (_jsxs("li", { className: "flex items-center gap-3 py-2.5", children: [_jsxs("span", { className: "figure w-6 text-xs text-fg3", children: [idx + 1, "."] }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsxs("div", { className: "flex items-baseline justify-between gap-2", children: [_jsx("span", { className: "truncate font-medium text-fg", children: hit.food.name }), _jsxs("span", { className: "figure shrink-0 text-xs text-fg2", children: [_jsxs("strong", { children: [num(hit.amountPer100g), " ", hit.unit] }), " / 100g \u00B7 ", num(hit.amountPer100Kcal), " ", hit.unit, " / 100 kcal"] })] }), _jsx("div", { className: "mt-1.5 h-1.5 rounded-full bg-raised", children: _jsx("div", { className: "h-1.5 rounded-full", style: {
                                                    width: `${Math.max(4, (hit.score / maxScore) * 100)}%`,
                                                    background: idx < 3 ? 'var(--brand)' : 'var(--chart-neutral)',
                                                } }) })] }), _jsxs("button", { type: "button", className: "btn-secondary h-8 shrink-0 px-2.5 text-xs", onClick: () => quickLogFood(hit.food), children: [_jsx(Plus, { size: 14, strokeWidth: 1.5 }), " Di\u00E1rio"] })] }, hit.food.id))) }))] })] }));
}
