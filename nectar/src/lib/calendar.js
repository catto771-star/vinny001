import { addDays, parseDay, toDay, weekday } from './dates';
/**
 * The weeks shown for a month, Sunday first: whole weeks from the one that
 * holds the 1st to the one that holds the last day.
 */
export function monthGrid(year, month) {
    const first = toDay(new Date(year, month - 1, 1));
    const last = toDay(new Date(year, month, 0));
    let day = addDays(first, -weekday(first));
    const end = addDays(last, 6 - weekday(last));
    const weeks = [];
    while (day <= end) {
        weeks.push(Array.from({ length: 7 }, (_, i) => addDays(day, i)));
        day = addDays(day, 7);
    }
    return weeks;
}
/** The 7 days of the week (Sunday first) that holds a day. */
export function weekOf(day) {
    const start = addDays(day, -weekday(day));
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}
/** Moves a date-time to another day, keeping its local time of day. */
export function moveToDay(iso, day) {
    const d = new Date(iso);
    const target = parseDay(day);
    target.setHours(d.getHours(), d.getMinutes(), d.getSeconds(), 0);
    return target.toISOString();
}
