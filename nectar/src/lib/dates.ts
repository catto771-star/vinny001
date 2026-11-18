// Date helpers. Calendar days are handled as 'YYYY-MM-DD' strings in the
// user's local time zone, so a day never shifts when converted to UTC.

export type Day = string; // 'YYYY-MM-DD'

export function toDay(date: Date): Day {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseDay(day: Day): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(day: Day, n: number): Day {
  const date = parseDay(day);
  date.setDate(date.getDate() + n);
  return toDay(date);
}

/** 0 = Sunday ... 6 = Saturday. */
export function weekday(day: Day): number {
  return parseDay(day).getDay();
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function monthDays(year: number, month: number): Day[] {
  const n = daysInMonth(year, month);
  return Array.from({ length: n }, (_, i) => toDay(new Date(year, month - 1, i + 1)));
}

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho',
  'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export function weekdayShort(n: number): string {
  return WEEKDAYS[n];
}

export function monthName(month: number): string {
  return MONTHS[month - 1];
}

export function formatDay(day: Day): string {
  const d = parseDay(day);
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} de ${MONTHS[d.getMonth()]}`;
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function greeting(now: Date): string {
  const h = now.getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

/** First letter in upper case, the rest as is: 'qua, 18 de novembro' -> 'Qua, 18 de novembro'. */
export function sentence(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
