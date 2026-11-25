import { parseDay } from './dates';
const DAY_MS = 86400000;
const daysBetween = (a, b) => Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / DAY_MS);
/**
 * Smoothed weight trend: an exponential moving average that weighs each new
 * weigh-in by the days since the previous one (10% per day), so gaps between
 * weigh-ins are handled. Several weigh-ins on one day are averaged first.
 */
export function weightTrend(weighIns) {
    const byDay = new Map();
    for (const w of weighIns)
        byDay.set(w.date, [...(byDay.get(w.date) ?? []), w.weight_kg]);
    const days = [...byDay.keys()].sort();
    const out = [];
    let trend = 0;
    days.forEach((day, i) => {
        const values = byDay.get(day);
        const w = values.reduce((a, b) => a + b, 0) / values.length;
        if (i === 0)
            trend = w;
        else {
            const alpha = 1 - 0.9 ** Math.max(1, daysBetween(days[i - 1], day));
            trend += alpha * (w - trend);
        }
        out.push({ date: day, weight_kg: Math.round(w * 10) / 10, trend_kg: Math.round(trend * 100) / 100 });
    });
    return out;
}
/**
 * Rate of weight change in kg per week: least-squares slope of the weigh-ins
 * in the last `windowDays` days up to `today`. Needs at least two weigh-ins
 * at least 7 days apart.
 */
export function weeklyRate(weighIns, today, windowDays = 28) {
    const pts = weighIns.filter((w) => w.date <= today && daysBetween(w.date, today) < windowDays)
        .map((w) => ({ x: daysBetween(today, w.date), y: w.weight_kg }));
    if (pts.length < 2)
        return null;
    const xs = pts.map((p) => p.x);
    if (Math.max(...xs) - Math.min(...xs) < 7)
        return null;
    const mx = xs.reduce((a, b) => a + b, 0) / pts.length;
    const my = pts.reduce((a, p) => a + p.y, 0) / pts.length;
    const num = pts.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0);
    const den = pts.reduce((a, p) => a + (p.x - mx) ** 2, 0);
    return Math.round((num / den) * 7 * 100) / 100;
}
/** kcal stored in 1 kg of body weight change (common approximation). */
export const KCAL_PER_KG = 7700;
/**
 * Crosses intake with the weight trend: estimated maintenance calories are
 * the average intake minus the energy the weight change represents.
 * Needs the average intake of logged days and the weekly rate over the same period.
 */
export function estimatedMaintenance(avgIntakeKcal, rateKgPerWeek) {
    return Math.round(avgIntakeKcal - (rateKgPerWeek * KCAL_PER_KG) / 7);
}
/** Average daily intake over the logged days within the window, and how many days were logged. */
export function averageIntake(dailyKcal, today, windowDays = 28) {
    const values = [...dailyKcal.entries()]
        .filter(([d, k]) => d <= today && daysBetween(d, today) < windowDays && k > 0)
        .map(([, k]) => k);
    if (!values.length)
        return { avg: null, days: 0 };
    return { avg: Math.round(values.reduce((a, b) => a + b, 0) / values.length), days: values.length };
}
