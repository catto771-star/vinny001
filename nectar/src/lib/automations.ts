import { addDays, formatDay, sentence, toDay, weekday, weekdayShort } from './dates';

export type Action = 'ai' | 'task' | 'reminder' | 'briefing';
export const ACTION_LABEL: Record<Action, string> = { briefing: 'Resumo do dia', task: 'Criar tarefa', reminder: 'Criar lembrete', ai: 'Pedido à IA' };

export interface Automation {
  id: string;
  title: string;
  prompt: string;
  action: Action;
  weekdays: number[];
  time_of_day: string;
  is_active: boolean;
  last_run_at: string | null;
  payload: { priority?: 'low' | 'medium' | 'high' };
  created_at: string;
}

export interface Run { id: string; automation_id: string; ran_at: string; status: 'ok' | 'waiting_ai' | 'running' | 'error'; output: string }

/** "Todo dia às 07:00", "Dias úteis às 08:30", "Dom às 19:00", "Seg, qua e sex às 07:00". */
export function scheduleText(a: Pick<Automation, 'weekdays' | 'time_of_day'>): string {
  const time = a.time_of_day.slice(0, 5);
  const days = [...(a.weekdays ?? [])].sort();
  const key = days.join();
  const when = !days.length || days.length === 7 ? 'Todo dia'
    : key === '1,2,3,4,5' ? 'Dias úteis'
      : key === '0,6' ? 'Fins de semana'
        : (() => {
          const names = days.map(weekdayShort);
          const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
          return list.charAt(0).toUpperCase() + list.slice(1);
        })();
  return `${when} às ${time}`;
}

/**
 * When it runs next, in local time, following the same rule as the database:
 * once a day on its weekdays, at or after its time. A run that is due and has
 * not happened yet today returns now (the next check, within 5 minutes).
 */
export function nextRun(a: Pick<Automation, 'weekdays' | 'time_of_day' | 'is_active' | 'last_run_at'>, now: Date): Date | null {
  if (!a.is_active) return null;
  const today = toDay(now);
  const ranToday = !!a.last_run_at && toDay(new Date(a.last_run_at)) === today;
  const [hh, mm] = a.time_of_day.split(':').map(Number);
  for (let i = 0; i <= 7; i++) {
    const day = addDays(today, i);
    if (a.weekdays?.length && !a.weekdays.includes(weekday(day))) continue;
    if (i === 0 && ranToday) continue;
    const [y, m, d] = day.split('-').map(Number);
    const at = new Date(y, m - 1, d, hh, mm);
    if (i === 0 && at <= now) return now;
    return at;
  }
  return null;
}

/** Ready-made automations to start from. */
export const PRESETS: { title: string; action: Action; prompt: string; weekdays: number[]; time_of_day: string }[] = [
  { title: 'Resumo da manhã', action: 'briefing', prompt: '', weekdays: [], time_of_day: '07:00' },
  { title: 'Revisão semanal das finanças', action: 'task', prompt: 'Revisar gastos da semana e faturas', weekdays: [0], time_of_day: '19:00' },
  { title: 'Pesagem semanal', action: 'reminder', prompt: 'Pesar em jejum', weekdays: [1], time_of_day: '07:00' },
  { title: 'Planejar a semana', action: 'ai', prompt: 'Olhe minhas tarefas, metas e agenda e monte um plano para a semana.', weekdays: [0], time_of_day: '20:00' },
];

/** When a run happened or will happen, in words: a run moments ago is "agora há pouco", a due one "na próxima verificação". */
export function runTimeText(date: Date, now: Date): string {
  const diff = date.getTime() - now.getTime();
  if (diff < 0 && diff > -60000) return 'agora há pouco';
  if (diff >= 0 && diff < 60000) return 'na próxima verificação';
  const day = toDay(date);
  const hm = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  return `${day === toDay(now) ? 'hoje' : sentence(formatDay(day))}, ${hm}`;
}
