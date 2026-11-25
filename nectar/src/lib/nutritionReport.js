// Period Nutrition Report, Dual-Axis Health Comparison Series, and Full CSV Exporter
// inspired by Cronometer's Trends (#charts, #nutrition-report, #print-report, Export Data).
import { addDays } from './dates';
import { sumNutrients } from './nutrition';
import { MICRONUTRIENTS, computeNutritionScores, sumMicronutrients, } from './micronutrients';
import { summarizeFasts } from './fasting';
export function buildPeriodNutritionReport(params) {
    const nDays = Math.max(1, params.days);
    const startDay = addDays(params.endDay, -(nDays - 1));
    const windowDays = [];
    for (let i = 0; i < nDays; i++)
        windowDays.push(addDays(startDay, i));
    const logsInWindow = params.foodLogs.filter((l) => l.date >= startDay && l.date <= params.endDay && (params.includeSupplements || !l.is_supplement));
    const loggedSet = new Set(logsInWindow.map((l) => l.date));
    const activeDays = windowDays.filter((d) => {
        if (params.dayFilter === 'completed_only')
            return params.completedDays.has(d);
        if (params.dayFilter === 'all_logged')
            return loggedSet.has(d);
        return true;
    });
    const denom = Math.max(1, activeDays.length);
    const activeSet = new Set(activeDays);
    const filteredLogs = logsInWindow.filter((l) => activeSet.has(l.date));
    const filteredWater = params.waterLogs.filter((w) => activeSet.has(w.date));
    const sumM = sumNutrients(filteredLogs);
    const sumMicro = sumMicronutrients(filteredLogs);
    const totalWater = filteredWater.reduce((acc, w) => acc + (w.ml || 0), 0);
    const r1 = (n) => Math.round(n * 10) / 10;
    const r2 = (n) => Math.round(n * 100) / 100;
    const averageMacros = activeDays.length === 0
        ? { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, net_carbs_g: 0 }
        : {
            kcal: Math.round(sumM.kcal / denom),
            protein_g: r1(sumM.protein_g / denom),
            carbs_g: r1(sumM.carbs_g / denom),
            fat_g: r1(sumM.fat_g / denom),
            fiber_g: r1(sumM.fiber_g / denom),
            net_carbs_g: r1(Math.max(0, sumM.carbs_g - sumM.fiber_g) / denom),
        };
    const averageMicros = Object.fromEntries(MICRONUTRIENTS.map((m) => [m.key, activeDays.length === 0 ? 0 : r2(sumMicro[m.key] / denom)]));
    return {
        startDay,
        endDay: params.endDay,
        totalCalendarDays: nDays,
        countedDays: activeDays.length,
        averageMacros,
        averageWaterMl: activeDays.length === 0 ? 0 : Math.round(totalWater / denom),
        averageMicros,
        scores: computeNutritionScores(averageMicros, params.sex),
    };
}
export const COMPARISON_METRICS = [
    { id: 'weight_kg', label: 'Peso corporal', unit: 'kg' },
    { id: 'body_fat_pct', label: 'Gordura corporal', unit: '%' },
    { id: 'waist_cm', label: 'Cintura', unit: 'cm' },
    { id: 'kcal', label: 'Calorias consumidas', unit: 'kcal' },
    { id: 'protein_g', label: 'Proteína', unit: 'g' },
    { id: 'carbs_g', label: 'Carboidratos totais', unit: 'g' },
    { id: 'net_carbs_g', label: 'Carboidratos líquidos', unit: 'g' },
    { id: 'fat_g', label: 'Gordura', unit: 'g' },
    { id: 'fiber_g', label: 'Fibras', unit: 'g' },
    { id: 'water_ml', label: 'Água bebida', unit: 'mL' },
    { id: 'fasting_h', label: 'Horas em jejum', unit: 'h' },
    { id: 'tonnage_kg', label: 'Volume de treino', unit: 'kg' },
    { id: 'sodium_mg', label: 'Sódio', unit: 'mg' },
    { id: 'potassium_mg', label: 'Potássio', unit: 'mg' },
];
export function buildHealthComparisonSeries(params) {
    const nDays = Math.max(2, params.days);
    const startDay = addDays(params.endDay, -(nDays - 1));
    const logsByDay = new Map();
    for (const l of params.foodLogs) {
        if (l.date < startDay || l.date > params.endDay)
            continue;
        const arr = logsByDay.get(l.date) ?? [];
        arr.push(l);
        logsByDay.set(l.date, arr);
    }
    const waterByDay = new Map();
    for (const w of params.waterLogs) {
        if (w.date < startDay || w.date > params.endDay)
            continue;
        waterByDay.set(w.date, (waterByDay.get(w.date) ?? 0) + w.ml);
    }
    const measByMetricDay = new Map();
    for (const m of params.measurements) {
        const day = m.measured_at.slice(0, 10);
        if (day < startDay || day > params.endDay)
            continue;
        measByMetricDay.set(`${m.metric}:${day}`, Number(m.value));
    }
    const fastSummary = summarizeFasts(params.fasts);
    const valueOf = (metric, day) => {
        if (metric === 'weight_kg' || metric === 'body_fat_pct' || metric === 'waist_cm') {
            return measByMetricDay.get(`${metric}:${day}`) ?? null;
        }
        if (metric === 'water_ml')
            return waterByDay.get(day) ?? null;
        if (metric === 'fasting_h')
            return fastSummary.hoursByDay.get(day) ?? null;
        if (metric === 'tonnage_kg')
            return params.tonnageByDay.get(day) ?? null;
        const logs = logsByDay.get(day);
        if (!logs || !logs.length)
            return null;
        const mac = sumNutrients(logs);
        if (metric === 'kcal')
            return mac.kcal;
        if (metric === 'protein_g')
            return mac.protein_g;
        if (metric === 'carbs_g')
            return mac.carbs_g;
        if (metric === 'net_carbs_g')
            return Math.round(Math.max(0, mac.carbs_g - mac.fiber_g) * 10) / 10;
        if (metric === 'fat_g')
            return mac.fat_g;
        if (metric === 'fiber_g')
            return mac.fiber_g;
        const mic = sumMicronutrients(logs);
        return mic[metric] ?? null;
    };
    const out = [];
    for (let i = 0; i < nDays; i++) {
        const day = addDays(startDay, i);
        out.push({
            day,
            label: `${day.slice(8)}/${day.slice(5, 7)}`,
            left: valueOf(params.leftMetric, day),
            right: valueOf(params.rightMetric, day),
        });
    }
    return out;
}
function csvCell(v) {
    if (v === null || v === undefined)
        return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
/** Formats all health diary records into a clean CSV string for Cronometer-style data export. */
export function buildFoodLogsCsv(logs) {
    const header = ['data', 'horario', 'refeicao', 'alimento', 'medida', 'qtd_medida', 'gramas', 'kcal', 'proteina_g', 'carboidrato_g', 'gordura_g', 'fibra_g'];
    const rows = logs.map((l) => [
        l.date,
        l.logged_time ?? '',
        l.meal,
        l.food_name,
        l.measure_label ?? 'g',
        l.measure_qty ?? l.quantity_g,
        l.quantity_g,
        l.kcal,
        l.protein_g,
        l.carbs_g,
        l.fat_g,
        l.fiber_g ?? 0,
    ].map(csvCell).join(','));
    return [header.join(','), ...rows].join('\n');
}
