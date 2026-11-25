import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { num } from '../../lib/format';
import { Calendar, Plus, Trash2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { write } from '../../lib/useTable';
import { kcalFromMacros, nutrientsFor, shoppingList, sumNutrients } from '../../lib/nutrition';
import { gramsFromPercent, percentFromGrams } from '../../lib/diary';
import { formatDay, toDay, weekdayShort } from '../../lib/dates';
import { ACTIVITY_LEVELS, KETO_PRESETS, calculateBmr, computeKetoTargets, computeWeightGoalForecast, } from '../../lib/metabolism';
import { Empty, Field, Modal } from '../../components/ui';
import FoodSearch from './FoodSearch';
import { DEFAULT_WEIGHT_KG } from './useHealth';
const VIEWS = ['Metas', 'Metabolismo & Peso', 'Macro Scheduler', 'Refeições do plano', 'Lista de compras'];
export default function DietPlan({ h }) {
    const [view, setView] = useState('Metas');
    if (!h.plan)
        return _jsx(CreatePlan, { h: h });
    return (_jsxs(_Fragment, { children: [_jsx("div", { className: "mb-4 flex flex-wrap gap-1", children: VIEWS.map((v) => _jsx("button", { className: v === view ? 'tab-active' : 'tab', onClick: () => setView(v), children: v }, v)) }), view === 'Metas' && _jsx(Targets, { h: h }), view === 'Metabolismo & Peso' && _jsx(MetabolicProfileView, { h: h }), view === 'Macro Scheduler' && _jsx(MacroSchedulerView, { h: h }), view === 'Refeições do plano' && _jsx(PlanMeals, { h: h }), view === 'Lista de compras' && _jsx(Shopping, { h: h })] }));
}
function CreatePlan({ h }) {
    const [name, setName] = useState('Meu plano');
    return (_jsxs("div", { className: "card max-w-md", children: [_jsx("p", { className: "mb-3 text-sm text-fg2", children: "Cadastre o plano nutricional: metas para dia de treino e de descanso, metabolismo, agenda semanal de macros e refei\u00E7\u00F5es." }), _jsx(Field, { label: "Nome do plano", children: _jsx("input", { className: "input", value: name, onChange: (e) => setName(e.target.value) }) }), _jsx("button", { className: "btn-primary", onClick: async () => {
                    if (await write(supabase.from('diet_plans').insert({ name, is_active: true })))
                        void h.plans.reload();
                }, children: "Criar plano" })] }));
}
function Targets({ h }) {
    const plan = h.plan;
    const get = (t) => h.targets.rows.find((x) => x.plan_id === plan.id && x.day_type === t);
    const [ketoPreset, setKetoPreset] = useState('moderate');
    const [ketoKcal, setKetoKcal] = useState(get('rest')?.kcal || 2000);
    const ketoPreview = useMemo(() => computeKetoTargets({
        kcal: ketoKcal || 2000,
        weightKg: h.latestWeight ?? DEFAULT_WEIGHT_KG,
        bodyFatPct: h.latestBodyFatPct,
        preset: ketoPreset,
    }), [ketoKcal, h.latestWeight, h.latestBodyFatPct, ketoPreset]);
    async function applyKetoToRestAndTraining() {
        const ok1 = await write(supabase.from('diet_day_targets').upsert({ plan_id: plan.id, day_type: 'rest', ...ketoPreview }, { onConflict: 'plan_id,day_type' }));
        const ok2 = await write(supabase.from('diet_day_targets').upsert({ plan_id: plan.id, day_type: 'training', ...ketoPreview }, { onConflict: 'plan_id,day_type' }));
        if (ok1 || ok2)
            await h.targets.reload();
    }
    return (_jsxs("div", { className: "grid gap-4 md:grid-cols-2", children: [_jsx(TargetForm, { h: h, dayType: "rest", current: get('rest') }), _jsx(TargetForm, { h: h, dayType: "training", current: get('training') }), _jsxs("section", { className: "card md:col-span-2", children: [_jsx("div", { className: "mb-1 font-medium", children: "Calculadora Cetog\u00EAnica / Low-Carb" }), _jsxs("p", { className: "mb-3 text-[13px] text-fg3", children: ["Calcula prote\u00EDna pela sua massa magra (", num(h.latestWeight ?? DEFAULT_WEIGHT_KG), " kg", h.latestBodyFatPct ? ` · ${num(h.latestBodyFatPct)}% BF` : '', "), limita carboidratos l\u00EDquidos e completa a energia com gorduras."] }), _jsxs("div", { className: "grid gap-3 sm:grid-cols-3", children: [_jsx(Field, { label: "N\u00EDvel Low-Carb / Keto", children: _jsx("select", { className: "input", value: ketoPreset, onChange: (e) => setKetoPreset(e.target.value), children: Object.keys(KETO_PRESETS).map((k) => (_jsx("option", { value: k, children: KETO_PRESETS[k].label }, k))) }) }), _jsx(Field, { label: "Calorias alvo", children: _jsx("input", { className: "input figure", type: "number", min: 1000, max: 6000, value: ketoKcal, onChange: (e) => setKetoKcal(Number(e.target.value)) }) }), _jsx("div", { className: "flex items-end pb-4", children: _jsxs("button", { type: "button", className: "btn-secondary w-full justify-center", onClick: () => void applyKetoToRestAndTraining(), children: ["Aplicar (", ketoPreview.protein_g, "P / ", ketoPreview.carbs_g, "C / ", ketoPreview.fat_g, "G)"] }) })] })] }), _jsx(WeekdayTargets, { h: h }), _jsxs("div", { className: "card md:col-span-2", children: [_jsx("div", { className: "label mb-2", children: "Meta nos dias de treino" }), _jsxs("label", { className: "mb-1 flex items-start gap-2 text-sm", children: [_jsx("input", { type: "radio", name: "mode", checked: plan.training_target_mode === 'fixed', onChange: () => setMode(h, 'fixed') }), _jsxs("span", { children: [_jsx("strong", { children: "Fixa:" }), " usa a meta de dia de treino como cadastrada."] })] }), _jsxs("label", { className: "flex items-start gap-2 text-sm", children: [_jsx("input", { type: "radio", name: "mode", checked: plan.training_target_mode === 'dynamic', onChange: () => setMode(h, 'dynamic') }), _jsxs("span", { children: [_jsx("strong", { children: "Ajustada pelo treino:" }), " parte da meta de descanso e soma as calorias gastas no treino e no cardio do dia, convertidas em carboidrato."] })] })] })] }));
}
/** Metabolic Profile (BMR Mifflin/Katch-McArdle, Baseline Activity, TEF, Hydration) + Weight Goal Forecast. */
function MetabolicProfileView({ h }) {
    const p = h.profile;
    const [sex, setSex] = useState(p?.sex ?? 'M');
    const [heightCm, setHeightCm] = useState(String(p?.height_cm ?? '175'));
    const [birthDate, setBirthDate] = useState(p?.birth_date ?? '1996-01-01');
    const [activityLevel, setActivityLevel] = useState(p?.activity_level ?? 'lightly_active');
    const [customBmr, setCustomBmr] = useState(p?.custom_bmr ? String(p.custom_bmr) : '');
    const [includeTef, setIncludeTef] = useState(p?.include_tef ?? true);
    const [netCarbsMode, setNetCarbsMode] = useState(p?.net_carbs_mode ?? false);
    const [waterGoalMl, setWaterGoalMl] = useState(String(p?.water_goal_ml ?? 2500));
    const [waterCupMl, setWaterCupMl] = useState(String(p?.water_cup_ml ?? 250));
    const [targetWeightKg, setTargetWeightKg] = useState(p?.target_weight_kg ? String(p.target_weight_kg) : '');
    const [weeklyRateKg, setWeeklyRateKg] = useState(p?.weekly_rate_kg ? String(p.weekly_rate_kg) : '-0.5');
    const [savedMsg, setSavedMsg] = useState(null);
    const today = toDay(new Date());
    const currentWeight = h.latestWeight ?? DEFAULT_WEIGHT_KG;
    const bmrInfo = useMemo(() => calculateBmr({
        weightKg: currentWeight,
        heightCm: Number(heightCm) || null,
        sex,
        birthDate,
        bodyFatPct: h.latestBodyFatPct,
        customBmr: customBmr ? Number(customBmr) : null,
        asOfDate: today,
    }), [currentWeight, heightCm, sex, birthDate, h.latestBodyFatPct, customBmr, today]);
    const baselineKcal = Math.round(bmrInfo.bmr * ACTIVITY_LEVELS[activityLevel].factor);
    const maintenanceKcal = bmrInfo.bmr + baselineKcal;
    const forecast = useMemo(() => {
        const tw = Number(targetWeightKg);
        if (!tw || tw < 25)
            return null;
        return computeWeightGoalForecast({
            currentWeightKg: currentWeight,
            targetWeightKg: tw,
            weeklyRateKg: Number(weeklyRateKg) || -0.5,
            maintenanceKcal,
            today,
        });
    }, [currentWeight, targetWeightKg, weeklyRateKg, maintenanceKcal, today]);
    async function saveProfile(e) {
        e.preventDefault();
        setSavedMsg(null);
        const { data: auth } = await supabase.auth.getUser();
        if (!auth.user)
            return;
        const payload = {
            user_id: auth.user.id,
            sex,
            height_cm: Number(heightCm) || null,
            birth_date: birthDate || null,
            activity_level: activityLevel,
            custom_bmr: customBmr ? Number(customBmr) : null,
            include_tef: includeTef,
            net_carbs_mode: netCarbsMode,
            water_goal_ml: Math.max(500, Number(waterGoalMl) || 2500),
            water_cup_ml: Math.max(50, Number(waterCupMl) || 250),
            target_weight_kg: targetWeightKg ? Number(targetWeightKg) : null,
            weekly_rate_kg: weeklyRateKg ? Number(weeklyRateKg) : null,
        };
        if (await write(supabase.from('user_settings').upsert(payload, { onConflict: 'user_id' }))) {
            await h.userSettings.reload();
            setSavedMsg('Perfil metabólico salvo.');
        }
    }
    async function applySuggestedCalories() {
        if (!forecast || !h.plan)
            return;
        const kcal = forecast.suggestedTargetKcal;
        const protein_g = Math.round(currentWeight * 1.8);
        const fat_g = Math.round((kcal * 0.27) / 9);
        const carbs_g = Math.max(30, Math.round((kcal - protein_g * 4 - fat_g * 9) / 4));
        if (await write(supabase.from('diet_day_targets').upsert({ plan_id: h.plan.id, day_type: 'rest', kcal, protein_g, carbs_g, fat_g }, { onConflict: 'plan_id,day_type' }))) {
            await h.targets.reload();
            setSavedMsg(`Meta de ${kcal} kcal aplicada ao Dia de Descanso.`);
        }
    }
    return (_jsxs("form", { onSubmit: saveProfile, className: "grid gap-4 lg:grid-cols-2", children: [_jsxs("section", { className: "card space-y-3", children: [_jsxs("div", { children: [_jsx("h3", { className: "font-medium text-fg", children: "Taxa Metab\u00F3lica Basal (TMB) & Gasto Di\u00E1rio" }), _jsxs("p", { className: "text-xs text-fg3", children: ["Usa ", _jsx("strong", { children: "Katch-McArdle" }), " automaticamente quando voc\u00EA tem % de gordura em Corpo, ou ", _jsx("strong", { children: "Mifflin-St Jeor" }), "."] })] }), _jsxs("div", { className: "grid grid-cols-3 gap-2 rounded-xl border border-line bg-raised/40 p-3 text-center", children: [_jsxs("div", { children: [_jsxs("div", { className: "text-[11px] text-fg3", children: ["TMB (", bmrInfo.formula === 'katch_mcardle' ? 'Katch-McArdle' : bmrInfo.formula === 'custom' ? 'Manual' : 'Mifflin', ")"] }), _jsxs("div", { className: "figure mt-0.5 text-base font-medium text-fg", children: [num(bmrInfo.bmr), " kcal"] })] }), _jsxs("div", { className: "border-x border-line", children: [_jsx("div", { className: "text-[11px] text-fg3", children: "Atividade basal" }), _jsxs("div", { className: "figure mt-0.5 text-base font-medium text-fg", children: ["+", num(baselineKcal), " kcal"] })] }), _jsxs("div", { children: [_jsx("div", { className: "text-[11px] text-fg3", children: "Manuten\u00E7\u00E3o base" }), _jsxs("div", { className: "figure mt-0.5 text-base font-medium text-fg", children: [num(maintenanceKcal), " kcal"] })] })] }), _jsxs("div", { className: "grid grid-cols-3 gap-2", children: [_jsx(Field, { label: "Sexo biol\u00F3gico", children: _jsxs("select", { className: "input", value: sex, onChange: (e) => setSex(e.target.value), children: [_jsx("option", { value: "M", children: "Masculino" }), _jsx("option", { value: "F", children: "Feminino" })] }) }), _jsx(Field, { label: "Altura (cm)", children: _jsx("input", { className: "input figure", type: "number", min: 100, max: 250, value: heightCm, onChange: (e) => setHeightCm(e.target.value) }) }), _jsx(Field, { label: "Nascimento", children: _jsx("input", { className: "input", type: "date", value: birthDate, onChange: (e) => setBirthDate(e.target.value) }) })] }), _jsx(Field, { label: "N\u00EDvel de atividade fora dos treinos", children: _jsx("select", { className: "input", value: activityLevel, onChange: (e) => setActivityLevel(e.target.value), children: Object.keys(ACTIVITY_LEVELS).map((lvl) => (_jsxs("option", { value: lvl, children: [ACTIVITY_LEVELS[lvl].label, " \u2014 ", ACTIVITY_LEVELS[lvl].description] }, lvl))) }) }), _jsx(Field, { label: "TMB manual kcal (opcional \u2014 deixe vazio para c\u00E1lculo autom\u00E1tico)", children: _jsx("input", { className: "input figure", type: "number", min: 800, max: 5000, placeholder: `${bmrInfo.bmr} kcal`, value: customBmr, onChange: (e) => setCustomBmr(e.target.value) }) }), _jsxs("label", { className: "flex items-center gap-2 text-xs text-fg2", children: [_jsx("input", { type: "checkbox", checked: includeTef, onChange: (e) => setIncludeTef(e.target.checked) }), "Somar Efeito T\u00E9rmico dos Alimentos (TEF) no gasto cal\u00F3rico di\u00E1rio"] }), _jsxs("label", { className: "flex items-center gap-2 text-xs text-fg2", children: [_jsx("input", { type: "checkbox", checked: netCarbsMode, onChange: (e) => setNetCarbsMode(e.target.checked) }), "Rastrear Carboidratos L\u00EDquidos (Total \u2212 Fibras) por padr\u00E3o no Di\u00E1rio"] })] }), _jsxs("section", { className: "card flex flex-col space-y-3", children: [_jsxs("div", { children: [_jsx("h3", { className: "font-medium text-fg", children: "Meta de Peso, Previs\u00E3o (`Goal Forecast`) & \u00C1gua" }), _jsxs("p", { className: "text-xs text-fg3", children: ["Peso atual: ", _jsxs("strong", { className: "figure text-fg2", children: [num(currentWeight), " kg"] }), bmrInfo.leanMassKg ? ` · Massa magra: ${num(bmrInfo.leanMassKg)} kg` : ''] })] }), _jsxs("div", { className: "grid grid-cols-2 gap-3", children: [_jsx(Field, { label: "Peso meta (kg)", children: _jsx("input", { className: "input figure", type: "number", min: 30, max: 350, step: "0.1", placeholder: "Ex.: 94.0", value: targetWeightKg, onChange: (e) => setTargetWeightKg(e.target.value) }) }), _jsx(Field, { label: "Ritmo semanal (kg/sem)", children: _jsx("input", { className: "input figure", type: "number", min: -2, max: 2, step: "0.1", value: weeklyRateKg, onChange: (e) => setWeeklyRateKg(e.target.value) }) })] }), forecast && (_jsxs("div", { className: "rounded-xl border border-line bg-raised/50 p-3.5 text-sm", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("span", { className: "inline-flex items-center gap-1.5 text-xs text-fg3", children: [_jsx(Calendar, { size: 14, strokeWidth: 1.5 }), " Previs\u00E3o da meta"] }), _jsx("span", { className: "font-medium text-fg", children: forecast.forecastDate ? formatDay(forecast.forecastDate) : 'Meta atingida' })] }), _jsxs("div", { className: "mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-fg2", children: [_jsxs("span", { children: ["Varia\u00E7\u00E3o: ", _jsxs("strong", { className: "figure", children: [forecast.deltaKg > 0 ? '+' : '', num(forecast.deltaKg), " kg"] }), " (", forecast.daysToGoal, " dias \u00B7 ", forecast.dailyKcalAdjustment > 0 ? '+' : '', num(forecast.dailyKcalAdjustment), " kcal/dia)"] }), _jsxs("button", { type: "button", className: "btn-secondary h-7 px-2.5 text-xs", onClick: () => void applySuggestedCalories(), children: ["Usar ", num(forecast.suggestedTargetKcal), " kcal"] })] })] })), _jsxs("div", { className: "grid grid-cols-2 gap-3 pt-2", children: [_jsx(Field, { label: "Meta di\u00E1ria de \u00E1gua (mL)", children: _jsx("input", { className: "input figure", type: "number", min: 500, max: 10000, step: 100, value: waterGoalMl, onChange: (e) => setWaterGoalMl(e.target.value) }) }), _jsx(Field, { label: "Tamanho de 1 copo r\u00E1pido (mL)", children: _jsx("input", { className: "input figure", type: "number", min: 50, max: 1500, step: 50, value: waterCupMl, onChange: (e) => setWaterCupMl(e.target.value) }) })] }), savedMsg && _jsx("p", { className: "text-xs text-positive", children: savedMsg }), _jsx("button", { className: "btn-primary mt-auto w-full justify-center", children: "Salvar configura\u00E7\u00F5es metab\u00F3licas" })] })] }));
}
/** Named Macro Scheduler templates assigned to specific weekdays. */
function MacroSchedulerView({ h }) {
    const [creating, setCreating] = useState(false);
    const [name, setName] = useState('');
    const [macros, setMacros] = useState({ kcal: 2200, protein_g: 160, carbs_g: 240, fat_g: 65 });
    const [weekdays, setWeekdays] = useState([]);
    function toggleWd(wd) {
        setWeekdays((prev) => (prev.includes(wd) ? prev.filter((x) => x !== wd) : [...prev, wd].sort()));
    }
    async function saveTemplate(e) {
        e.preventDefault();
        const kcal = macros.kcal > 0 ? macros.kcal : kcalFromMacros(macros);
        if (await write(supabase.from('macro_templates').insert({ name: name.trim(), ...macros, kcal, weekdays }))) {
            setCreating(false);
            setName('');
            setWeekdays([]);
            await h.macroTemplates.reload();
        }
    }
    return (_jsxs("div", { className: "space-y-4", children: [_jsxs("section", { className: "card", children: [_jsxs("div", { className: "mb-3 flex flex-wrap items-center justify-between gap-2", children: [_jsxs("div", { children: [_jsx("h3", { className: "font-medium text-fg", children: "Macro Scheduler \u00B7 Templates da Semana" }), _jsxs("p", { className: "text-xs text-fg3", children: ["Crie perfis reutiliz\u00E1veis (ex.: ", _jsx("em", { children: "High Carb / Pernas" }), ", ", _jsx("em", { children: "Low Carb / Descanso" }), ", ", _jsx("em", { children: "Refeed S\u00E1bado" }), ") e vincule aos dias da semana."] })] }), _jsxs("button", { type: "button", className: "btn-primary text-xs", onClick: () => setCreating(true), children: [_jsx(Plus, { size: 16, strokeWidth: 1.5 }), " Novo template"] })] }), !h.macroTemplates.rows.length ? (_jsx(Empty, { children: "Nenhum template criado. Clique em Novo template para agendar macros na semana." })) : (_jsx("ul", { className: "divide-y divide-line text-sm", children: h.macroTemplates.rows.map((t) => (_jsxs("li", { className: "flex flex-wrap items-center gap-3 py-3", children: [_jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("div", { className: "font-medium text-fg", children: t.name }), _jsxs("div", { className: "figure text-xs text-fg3", children: [num(t.kcal), " kcal \u00B7 P ", t.protein_g, " g \u00B7 C ", t.carbs_g, " g \u00B7 G ", t.fat_g, " g"] })] }), _jsx("div", { className: "flex flex-wrap gap-1", children: [1, 2, 3, 4, 5, 6, 0].map((wd) => {
                                        const active = t.weekdays?.includes(wd);
                                        return (_jsx("button", { type: "button", onClick: async () => {
                                                const next = active ? t.weekdays.filter((x) => x !== wd) : [...(t.weekdays ?? []), wd];
                                                if (await write(supabase.from('macro_templates').update({ weekdays: next }).eq('id', t.id))) {
                                                    void h.macroTemplates.reload();
                                                }
                                            }, className: `rounded border px-2 py-0.5 text-xs ${active ? 'border-brand bg-raised font-medium text-fg' : 'border-line text-fg3 hover:text-fg2'}`, children: weekdayShort(wd) }, wd));
                                    }) }), _jsx("button", { type: "button", className: "text-fg3 hover:text-negative", "aria-label": `Excluir template ${t.name}`, onClick: async () => {
                                        if (await write(supabase.from('macro_templates').delete().eq('id', t.id))) {
                                            void h.macroTemplates.reload();
                                        }
                                    }, children: _jsx(Trash2, { size: 15, strokeWidth: 1.5 }) })] }, t.id))) }))] }), creating && (_jsx(Modal, { title: "Novo template de macros", onClose: () => setCreating(false), children: _jsxs("form", { onSubmit: saveTemplate, children: [_jsx(Field, { label: "Nome do template", children: _jsx("input", { className: "input", placeholder: "Ex.: High Carb \u00B7 Treino Inferior", value: name, onChange: (e) => setName(e.target.value), required: true, autoFocus: true }) }), _jsx(MacroEditor, { value: macros, onChange: setMacros, idSuffix: "template" }), _jsxs("div", { className: "mb-4", children: [_jsx("div", { className: "label mb-1.5", children: "Dias da semana ativos" }), _jsx("div", { className: "flex flex-wrap gap-1.5", children: [1, 2, 3, 4, 5, 6, 0].map((wd) => (_jsx("button", { type: "button", onClick: () => toggleWd(wd), className: `rounded-md border px-2.5 py-1 text-xs ${weekdays.includes(wd) ? 'border-brand bg-raised text-fg font-medium' : 'border-line text-fg3'}`, children: WEEKDAY_FULL[wd] }, wd))) })] }), _jsx("button", { className: "btn-primary w-full justify-center", children: "Salvar template" })] }) }))] }));
}
async function setMode(h, mode) {
    h.plans.setRows((rows) => rows.map((p) => (p.id === h.plan.id ? { ...p, training_target_mode: mode } : p)));
    if (await write(supabase.from('diet_plans').update({ training_target_mode: mode }).eq('id', h.plan.id)))
        void h.plans.reload();
}
/** Calories and macros, entered in grams or as a percentage of the calories. */
export function MacroEditor({ value, onChange, idSuffix }) {
    const [mode, setMode] = useState('g');
    const pct = percentFromGrams(value);
    const [p, setP] = useState(pct);
    const fromMacros = kcalFromMacros(value);
    const setPct = (next) => { setP(next); onChange({ ...value, ...gramsFromPercent(value.kcal, next) }); };
    const g = (k, label) => (_jsx(Field, { label: label, children: _jsx("input", { className: "input", type: "number", min: 0, "aria-label": `${label} (${idSuffix})`, value: value[k], onChange: (e) => onChange({ ...value, [k]: Number(e.target.value) }) }) }));
    const pc = (k, label) => (_jsx(Field, { label: `${label} (%)`, children: _jsx("input", { className: "input", type: "number", min: 0, max: 100, "aria-label": `${label} % (${idSuffix})`, value: p[k], onChange: (e) => setPct({ ...p, [k]: Number(e.target.value) }) }) }));
    return (_jsxs(_Fragment, { children: [_jsxs("div", { className: "mb-3 flex items-end gap-3", children: [_jsx("div", { className: "flex-1", children: _jsx(Field, { label: "Calorias", children: _jsx("input", { className: "input", type: "number", min: 0, "aria-label": `Calorias (${idSuffix})`, value: value.kcal, onChange: (e) => onChange({ ...value, kcal: Number(e.target.value), ...(mode === '%' ? gramsFromPercent(Number(e.target.value), p) : {}) }) }) }) }), _jsx("div", { className: "segmented mb-4", children: ['g', '%'].map((m) => _jsx("button", { type: "button", className: m === mode ? 'tab-active' : 'tab', onClick: () => { setMode(m); if (m === '%')
                                setP(percentFromGrams(value)); }, children: m === 'g' ? 'Gramas' : '%' }, m)) })] }), _jsx("div", { className: "grid grid-cols-3 gap-2", children: mode === 'g'
                    ? _jsxs(_Fragment, { children: [g('protein_g', 'Proteína (g)'), g('carbs_g', 'Carboidrato (g)'), g('fat_g', 'Gordura (g)')] })
                    : _jsxs(_Fragment, { children: [pc('protein', 'Proteína'), pc('carbs', 'Carboidrato'), pc('fat', 'Gordura')] }) }), _jsx("p", { className: "mb-3 text-xs text-fg3", children: mode === '%' ? `${value.protein_g} g de proteína, ${value.carbs_g} g de carboidrato e ${value.fat_g} g de gordura${p.protein + p.carbs + p.fat !== 100 ? ` · os percentuais somam ${p.protein + p.carbs + p.fat}%` : ''}`
                    : `Os macros somam ${num(fromMacros)} kcal${value.kcal && Math.abs(value.kcal - fromMacros) > 50 ? `, diferente das ${num(value.kcal)} kcal informadas` : ''}` })] }));
}
function TargetForm({ h, dayType, current }) {
    const [v, setV] = useState({ kcal: current?.kcal ?? 0, protein_g: current?.protein_g ?? 0, carbs_g: current?.carbs_g ?? 0, fat_g: current?.fat_g ?? 0 });
    useEffect(() => { if (current)
        setV({ kcal: current.kcal, protein_g: current.protein_g, carbs_g: current.carbs_g, fat_g: current.fat_g }); }, [current?.kcal, current?.protein_g, current?.carbs_g, current?.fat_g]);
    async function save() {
        const kcal = v.kcal > 0 ? v.kcal : kcalFromMacros(v);
        if (kcal <= 0)
            return alert('Informe as calorias ou os macros');
        if (await write(supabase.from('diet_day_targets').upsert({ plan_id: h.plan.id, day_type: dayType, ...v, kcal }, { onConflict: 'plan_id,day_type' })))
            void h.targets.reload();
    }
    return (_jsxs("div", { className: "card", children: [_jsx("div", { className: "mb-3 font-medium", children: dayType === 'rest' ? 'Dia de descanso' : 'Dia de treino' }), _jsx(MacroEditor, { value: v, onChange: setV, idSuffix: dayType === 'rest' ? 'descanso' : 'treino' }), _jsx("button", { className: "btn-primary", onClick: save, children: "Salvar meta" })] }));
}
const WEEKDAY_FULL = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
function WeekdayTargets({ h }) {
    const [editing, setEditing] = useState(null);
    const plan = h.plan;
    const rows = h.weekdayTargets.rows.filter((t) => t.plan_id === plan.id);
    return (_jsxs("section", { className: "card md:col-span-2", children: [_jsx("div", { className: "mb-1 font-medium", children: "Metas fixas por dia da semana" }), _jsx("p", { className: "mb-4 text-[13px] text-fg3", children: "Opcional. Um dia com meta pr\u00F3pria ignora a de treino ou descanso; os outros seguem as metas acima" }), _jsx("ul", { className: "divide-y divide-line", children: [1, 2, 3, 4, 5, 6, 0].map((wd) => {
                    const t = rows.find((r) => r.weekday === wd);
                    return (_jsxs("li", { className: "flex items-center gap-3 py-2.5 text-sm", children: [_jsx("span", { className: "w-24", children: WEEKDAY_FULL[wd] }), _jsx("span", { className: "mr-auto text-fg3", children: t ? _jsxs(_Fragment, { children: [_jsx("span", { className: "figure text-fg", children: num(t.kcal) }), " kcal \u00B7 P ", t.protein_g, " \u00B7 C ", t.carbs_g, " \u00B7 G ", t.fat_g] }) : 'segue treino ou descanso' }), _jsx("button", { className: "btn-ghost", onClick: () => setEditing(wd), "aria-label": `Editar meta de ${WEEKDAY_FULL[wd]}`, children: t ? 'Editar' : 'Definir' })] }, wd));
                }) }), editing !== null && _jsx(WeekdayForm, { h: h, weekday: editing, current: rows.find((r) => r.weekday === editing), onClose: () => setEditing(null) })] }));
}
function WeekdayForm({ h, weekday, current, onClose }) {
    const fallback = h.targets.rows.find((t) => t.plan_id === h.plan.id && t.day_type === 'rest');
    const [v, setV] = useState(current ?? (fallback ? { kcal: fallback.kcal, protein_g: fallback.protein_g, carbs_g: fallback.carbs_g, fat_g: fallback.fat_g } : { kcal: 2000, protein_g: 150, carbs_g: 200, fat_g: 65 }));
    async function save() {
        const kcal = v.kcal > 0 ? v.kcal : kcalFromMacros(v);
        if (await write(supabase.from('diet_weekday_targets').upsert({ plan_id: h.plan.id, weekday, ...v, kcal }, { onConflict: 'plan_id,weekday' }))) {
            await h.weekdayTargets.reload();
            onClose();
        }
    }
    async function clear() {
        if (await write(supabase.from('diet_weekday_targets').delete().eq('plan_id', h.plan.id).eq('weekday', weekday))) {
            await h.weekdayTargets.reload();
            onClose();
        }
    }
    return (_jsxs(Modal, { title: `Meta de ${WEEKDAY_FULL[weekday].toLowerCase()} (${weekdayShort(weekday)})`, onClose: onClose, children: [_jsx(MacroEditor, { value: v, onChange: setV, idSuffix: WEEKDAY_FULL[weekday].toLowerCase() }), _jsxs("div", { className: "flex gap-2", children: [current && _jsx("button", { className: "btn-ghost", onClick: clear, children: "Remover meta do dia" }), _jsx("button", { className: "btn-primary ml-auto", onClick: save, children: "Salvar" })] })] }));
}
function PlanMeals({ h }) {
    const plan = h.plan;
    const meals = h.meals.rows.filter((m) => m.plan_id === plan.id);
    const [adding, setAdding] = useState(null);
    const [newMeal, setNewMeal] = useState(false);
    const day = sumNutrients(h.items.rows.filter((i) => meals.some((m) => m.id === i.meal_id) && i.food).map((i) => nutrientsFor(i.food, i.quantity_g)));
    return (_jsxs(_Fragment, { children: [_jsxs("div", { className: "mb-3 flex items-center gap-2", children: [_jsxs("span", { className: "text-sm text-fg3", children: ["Plano por dia: ", num(day.kcal), " kcal \u00B7 P ", num(day.protein_g), " g \u00B7 C ", num(day.carbs_g), " g \u00B7 G ", num(day.fat_g), " g"] }), _jsxs("button", { className: "btn-primary ml-auto", onClick: () => setNewMeal(true), children: [_jsx(Plus, { size: 16, strokeWidth: 1.5 }), "Refei\u00E7\u00E3o"] })] }), !meals.length && _jsx("div", { className: "card", children: _jsx(Empty, { children: "Nenhuma refei\u00E7\u00E3o no plano ainda." }) }), meals.map((m) => {
                const items = h.items.rows.filter((i) => i.meal_id === m.id);
                return (_jsxs("section", { className: "card mb-3", children: [_jsxs("div", { className: "mb-2 flex items-baseline gap-2", children: [_jsx("h3", { className: "font-medium", children: m.name }), m.time_of_day && _jsx("span", { className: "text-xs text-fg3", children: m.time_of_day.slice(0, 5) }), _jsxs("button", { className: "btn-ghost ml-auto", onClick: () => setAdding(m.id), children: [_jsx(Plus, { size: 16, strokeWidth: 1.5 }), "Alimento"] }), _jsx("button", { className: "text-xs text-negative", onClick: async () => {
                                        if (confirm(`Excluir a refeição ${m.name}?`) && await write(supabase.from('diet_plan_meals').delete().eq('id', m.id))) {
                                            void h.meals.reload();
                                            void h.items.reload();
                                        }
                                    }, children: "excluir" })] }), _jsx("ul", { className: "text-sm", children: items.map((i) => (_jsxs("li", { className: "flex gap-2 border-t border-line py-1.5", children: [_jsxs("span", { className: "mr-auto", children: [i.food?.name, " ", _jsxs("span", { className: "text-fg3", children: ["\u00B7 ", num(i.quantity_g), " g"] })] }), i.food && _jsxs("span", { className: "text-xs text-fg3", children: [nutrientsFor(i.food, i.quantity_g).kcal, " kcal"] }), _jsx("button", { className: "text-fg3 hover:text-negative", "aria-label": `Remover ${i.food?.name}`, onClick: async () => {
                                            if (await write(supabase.from('diet_plan_items').delete().eq('id', i.id)))
                                                void h.items.reload();
                                        }, children: _jsx(X, { size: 16, strokeWidth: 1.5 }) })] }, i.id))) })] }, m.id));
            }), adding && (_jsx(FoodSearch, { title: "Adicionar ao plano", favoriteIds: h.favoriteIds, onClose: () => setAdding(null), onPick: async (food, grams) => {
                    if (await write(supabase.from('diet_plan_items').insert({ meal_id: adding, food_id: food.id, quantity_g: grams }))) {
                        setAdding(null);
                        void h.items.reload();
                    }
                } })), newMeal && _jsx(MealForm, { onClose: () => setNewMeal(false), onSave: async (name, time) => {
                    if (await write(supabase.from('diet_plan_meals').insert({ plan_id: plan.id, name, time_of_day: time || null, order_index: meals.length }))) {
                        setNewMeal(false);
                        void h.meals.reload();
                    }
                } })] }));
}
function MealForm({ onClose, onSave }) {
    const [name, setName] = useState('');
    const [time, setTime] = useState('');
    return (_jsx(Modal, { title: "Nova refei\u00E7\u00E3o do plano", onClose: onClose, children: _jsxs("form", { onSubmit: (e) => { e.preventDefault(); onSave(name, time); }, children: [_jsx(Field, { label: "Nome", children: _jsx("input", { className: "input", value: name, onChange: (e) => setName(e.target.value), placeholder: "Caf\u00E9 da manh\u00E3", required: true, autoFocus: true }) }), _jsx(Field, { label: "Hor\u00E1rio (opcional)", children: _jsx("input", { className: "input", type: "time", value: time, onChange: (e) => setTime(e.target.value) }) }), _jsx("button", { className: "btn-primary w-full justify-center", children: "Salvar" })] }) }));
}
const CHECKS_KEY = 'painel.shopping.checked';
function Shopping({ h }) {
    const [days, setDays] = useState(7);
    const [checked, setChecked] = useState(() => {
        try {
            return new Set(JSON.parse(localStorage.getItem(CHECKS_KEY) ?? '[]'));
        }
        catch {
            return new Set();
        }
    });
    const meals = new Set(h.meals.rows.filter((m) => m.plan_id === h.plan.id).map((m) => m.id));
    const items = h.items.rows.filter((i) => meals.has(i.meal_id));
    const foods = new Map(items.filter((i) => i.food).map((i) => [i.food_id, { id: i.food_id, name: i.food.name }]));
    const list = shoppingList(items, foods, days);
    function toggle(id) {
        const next = new Set(checked);
        if (next.has(id))
            next.delete(id);
        else
            next.add(id);
        setChecked(next);
        try {
            localStorage.setItem(CHECKS_KEY, JSON.stringify([...next]));
        }
        catch { /* storage unavailable */ }
    }
    const fmt = (g) => (g >= 1000 ? `${num(g / 1000, 2)} kg` : `${num(g)} g`);
    return (_jsxs(_Fragment, { children: [_jsxs("div", { className: "mb-3 flex flex-wrap items-center gap-2", children: [_jsx("span", { className: "text-sm", children: "Comprar para" }), _jsx("input", { className: "input w-20", type: "number", min: 1, max: 60, value: days, onChange: (e) => setDays(Math.max(1, Number(e.target.value))), "aria-label": "Dias" }), _jsx("span", { className: "text-sm", children: "dias" }), _jsx("button", { className: "btn-ghost ml-auto", onClick: () => { setChecked(new Set()); try {
                            localStorage.removeItem(CHECKS_KEY);
                        }
                        catch { /* ignore */ } }, children: "desmarcar tudo" })] }), !list.length ? _jsx("div", { className: "card", children: _jsx(Empty, { children: "Monte as refei\u00E7\u00F5es do plano para gerar a lista." }) }) : (_jsx("ul", { className: "card divide-y divide-line p-0", children: list.map((i) => (_jsxs("li", { className: "flex items-center gap-3 px-4 py-2 text-sm", children: [_jsx("input", { type: "checkbox", className: "h-4 w-4", checked: checked.has(i.food_id), onChange: () => toggle(i.food_id), "aria-label": `Comprado: ${i.name}` }), _jsx("span", { className: `mr-auto ${checked.has(i.food_id) ? 'text-fg3 line-through' : ''}`, children: i.name }), _jsx("span", { className: "text-fg3", children: fmt(i.grams) })] }, i.food_id))) })), _jsx("p", { className: "mt-2 text-xs text-fg3", children: "Quantidades em peso dos alimentos como cadastrados no plano (cru ou cozido, conforme a tabela escolhida)." })] }));
}
