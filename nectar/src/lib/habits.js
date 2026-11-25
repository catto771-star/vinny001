import { addDays, daysInMonth, monthDays, toDay, weekday } from './dates';
import { weekOf } from './calendar';
export const isWeekly = (h) => h.frequency === 'weekly';
/** A habit with no schedule_days is due every day. */
export function isScheduledOn(habit, day) {
    const days = habit.schedule_days;
    return !days || days.length === 0 || days.includes(weekday(day));
}
export function isDone(habit, completion) {
    if (!completion)
        return false;
    return habit.target_value == null ? completion.value > 0 : completion.value >= habit.target_value;
}
/** First day a habit counts: its creation day, or an earlier day logged for it. Null when unknown. */
export function startDay(habit, completions) {
    if (!habit.created_at)
        return null;
    let start = toDay(new Date(habit.created_at));
    for (const c of completions)
        if (c.habit_id === habit.id && c.completed_date < start)
            start = c.completed_date;
    return start;
}
const later = (a, b) => (b && b > a ? b : a);
export function completionsByDay(completions) {
    return new Map(completions.map((c) => [c.completed_date, c]));
}
/**
 * Consecutive scheduled days the habit was done, counting back from today.
 * Today counts only once it is done, so an unfinished today does not break
 * the streak. Unscheduled days are skipped.
 */
export function currentStreak(habit, completions, today) {
    if (isWeekly(habit))
        return weeklyStreak(habit, completions, today);
    const done = completionsByDay(completions.filter((c) => c.habit_id === habit.id));
    let streak = 0;
    let day = today;
    for (let guard = 0; guard < 3660; guard++) {
        if (isScheduledOn(habit, day)) {
            const ok = isDone(habit, done.get(day));
            if (ok)
                streak++;
            else if (day !== today)
                break;
        }
        day = addDays(day, -1);
    }
    return streak;
}
/** Share of scheduled days so far this month that were done (0..1). */
export function monthConsistency(habit, completions, year, month, today) {
    if (isWeekly(habit)) {
        // Expected so far: the weekly target spread over the days of the month that have passed.
        const first = later(monthDays(year, month)[0], startDay(habit, completions));
        const last = monthDays(year, month)[daysInMonth(year, month) - 1];
        const end = today < last ? today : last;
        if (end < first)
            return { done: 0, scheduled: 0, rate: 0 };
        const elapsed = Number(end.slice(8, 10)) - Number(first.slice(8, 10)) + 1;
        const count = completions.filter((c) => c.habit_id === habit.id && c.completed_date >= first && c.completed_date <= end && isDone(habit, c)).length;
        const scheduled = Math.max(1, Math.round(((habit.times_per_week ?? 1) * elapsed) / 7));
        return { done: count, scheduled, rate: Math.min(1, count / scheduled) };
    }
    const done = completionsByDay(completions.filter((c) => c.habit_id === habit.id));
    const start = startDay(habit, completions);
    let scheduled = 0;
    let count = 0;
    for (const day of monthDays(year, month)) {
        if (day > today)
            break;
        if (start && day < start)
            continue;
        if (!isScheduledOn(habit, day))
            continue;
        scheduled++;
        if (isDone(habit, done.get(day)))
            count++;
    }
    return { done: count, scheduled, rate: scheduled ? count / scheduled : 0 };
}
/**
 * Habits on a day's routine, ordered by their scheduled time (untimed last).
 * Fixed-day habits appear on their days; a weekly habit appears every day
 * until its weekly target is met, and on the days it was done.
 */
export function routineFor(habits, day, completions = []) {
    return habits
        .filter((h) => {
        if (h.is_archived)
            return false;
        const start = startDay(h, completions);
        if (start && day < start)
            return false;
        if (!isWeekly(h))
            return isScheduledOn(h, day);
        const doneToday = isDone(h, completions.find((c) => c.habit_id === h.id && c.completed_date === day));
        return doneToday || weeklyProgress(h, completions, day, true).done < (h.times_per_week ?? 1);
    })
        .sort((a, b) => (a.schedule_time ?? '99').localeCompare(b.schedule_time ?? '99') || (a.sort_order ?? 0) - (b.sort_order ?? 0));
}
/** A day is perfect when every fixed-day habit due on it was done. Weekly habits are measured by week instead. */
export function isPerfectDay(habits, completions, day) {
    const due = routineFor(habits.filter((h) => !isWeekly(h)), day, completions);
    if (due.length === 0)
        return false;
    return due.every((h) => isDone(h, completions.find((c) => c.habit_id === h.id && c.completed_date === day)));
}
// ---------------------------------------------------------------------------
// Weekly habits (weeks start on Sunday, like the calendar)
// ---------------------------------------------------------------------------
/** Times a weekly habit was done in the week of a day; `beforeDay` counts only earlier days of that week. */
export function weeklyProgress(habit, completions, day, beforeDay = false) {
    const week = weekOf(day);
    const done = completions.filter((c) => c.habit_id === habit.id && c.completed_date >= week[0] && c.completed_date <= week[6] &&
        (!beforeDay || c.completed_date < day) && isDone(habit, c)).length;
    return { done, target: habit.times_per_week ?? 1 };
}
/** Consecutive weeks that met the target. The current week counts once it is met. */
function weeklyStreak(habit, completions, today) {
    let streak = 0;
    let day = today;
    for (let guard = 0; guard < 520; guard++) {
        const { done, target } = weeklyProgress(habit, completions, day);
        const current = day === today;
        if (done >= target)
            streak++;
        else if (!current)
            break;
        day = addDays(weekOf(day)[0], -1);
    }
    return streak;
}
/** Longest run ever: days for fixed-day habits, weeks for weekly ones. */
export function bestStreak(habit, completions, today) {
    const mine = completions.filter((c) => c.habit_id === habit.id && isDone(habit, c)).map((c) => c.completed_date).sort();
    if (!mine.length)
        return 0;
    let best = 0;
    let run = 0;
    if (isWeekly(habit)) {
        for (let day = weekOf(mine[0])[0]; day <= today; day = addDays(day, 7)) {
            run = weeklyProgress(habit, completions, day).done >= (habit.times_per_week ?? 1) ? run + 1 : 0;
            best = Math.max(best, run);
        }
        return best;
    }
    const done = new Set(mine);
    for (let day = mine[0]; day <= today; day = addDays(day, 1)) {
        if (!isScheduledOn(habit, day))
            continue;
        run = done.has(day) ? run + 1 : 0;
        best = Math.max(best, run);
    }
    return best;
}
/** Share (0..1) of the last `days` days, today included, that met the habit's schedule. */
export function completionRate(habit, completions, today, days = 30) {
    const from = later(addDays(today, -(days - 1)), startDay(habit, completions));
    if (from > today)
        return 0;
    const done = completions.filter((c) => c.habit_id === habit.id && c.completed_date >= from && c.completed_date <= today && isDone(habit, c));
    if (isWeekly(habit)) {
        let span = 0;
        for (let d = from; d <= today; d = addDays(d, 1))
            span++;
        return Math.min(1, done.length / Math.max(1, ((habit.times_per_week ?? 1) * span) / 7));
    }
    let due = 0;
    for (let d = from; d <= today; d = addDays(d, 1))
        if (isScheduledOn(habit, d))
            due++;
    const doneDays = new Set(done.map((c) => c.completed_date));
    let hit = 0;
    for (let d = from; d <= today; d = addDays(d, 1))
        if (isScheduledOn(habit, d) && doneDays.has(d))
            hit++;
    return due ? hit / due : 0;
}
/** For each weekday (0 = Sunday), the share of fixed-day habits due that were done over the last weeks. */
export function weekdayRates(habits, completions, today, weeks = 8) {
    const due = Array(7).fill(0);
    const hit = Array(7).fill(0);
    const fixed = habits.filter((h) => !h.is_archived && !isWeekly(h)).map((h) => ({ h, start: startDay(h, completions) }));
    for (let d = addDays(today, -(weeks * 7 - 1)); d <= today; d = addDays(d, 1)) {
        for (const { h, start } of fixed) {
            if (!isScheduledOn(h, d) || (start && d < start))
                continue;
            due[weekday(d)]++;
            if (isDone(h, completions.find((c) => c.habit_id === h.id && c.completed_date === d)))
                hit[weekday(d)]++;
        }
    }
    return due.map((n, i) => ({ weekday: i, rate: n ? hit[i] / n : null }));
}
/** Habits on today's routine, not done yet, whose streak of at least 2 would break. */
export function atRisk(habits, completions, today) {
    return routineFor(habits, today, completions).filter((h) => !isDone(h, completions.find((c) => c.habit_id === h.id && c.completed_date === today)) &&
        (isWeekly(h) ? weeklyStreak(h, completions, addDays(weekOf(today)[0], -1)) >= 2 : currentStreak(h, completions, today) >= 2));
}
export const PARTS = ['Manhã', 'Tarde', 'Noite', 'Qualquer hora'];
/** Morning before 12:00, afternoon before 18:00, night after; no time means any time. */
export function partOfDay(time) {
    if (!time)
        return 'Qualquer hora';
    const h = Number(time.slice(0, 2));
    return h < 12 ? 'Manhã' : h < 18 ? 'Tarde' : 'Noite';
}
/** Whole weeks (Sunday first) ending in today's week, each day with its state for the habit. */
export function heatmap(habit, completions, today, weeks = 26) {
    const doneDays = new Set(completions.filter((c) => c.habit_id === habit.id && isDone(habit, c)).map((c) => c.completed_date));
    const start = addDays(weekOf(today)[0], -7 * (weeks - 1));
    const began = startDay(habit, completions);
    return Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, i) => {
        const day = addDays(start, w * 7 + i);
        const state = day > today ? 'future' : doneDays.has(day) ? 'done'
            : isWeekly(habit) || !isScheduledOn(habit, day) || (began && day < began) ? 'off' : 'missed';
        return { day, state };
    }));
}
/** 12-week overall habit consistency grid (Sunday-first weeks), intensity 0..4 per day. */
export function overallHeatmap(habits, completions, today, weeks = 12) {
    const active = habits.filter((h) => !h.is_archived);
    const start = addDays(weekOf(today)[0], -7 * (weeks - 1));
    const compByKey = new Map();
    for (const c of completions)
        compByKey.set(`${c.habit_id}|${c.completed_date}`, c);
    return Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, i) => {
        const day = addDays(start, w * 7 + i);
        if (day > today)
            return { day, done: 0, due: 0, level: 0, future: true };
        const dueList = routineFor(active, day, completions);
        const due = dueList.length;
        const doneCount = dueList.filter((h) => isDone(h, compByKey.get(`${h.id}|${day}`))).length;
        const ratio = due > 0 ? doneCount / due : 0;
        const level = doneCount === 0 ? 0 : ratio >= 1 ? 4 : ratio >= 0.7 ? 3 : ratio >= 0.35 ? 2 : 1;
        return { day, done: doneCount, due, level, future: false };
    }));
}
