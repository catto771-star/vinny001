import { num, plural } from './format';

/** "3 tarefas, 2 hábitos e 1.471 kcal pela frente." — the Início headline. */
export function dayHeadline({ tasksLeft, habitsLeft, kcalLeft }: { tasksLeft: number; habitsLeft: number; kcalLeft: number | null }): string {
  const parts: string[] = [];
  if (tasksLeft > 0) parts.push(`${tasksLeft} ${plural(tasksLeft, 'tarefa', 'tarefas')}`);
  if (habitsLeft > 0) parts.push(`${habitsLeft} ${plural(habitsLeft, 'hábito', 'hábitos')}`);
  if (kcalLeft !== null && kcalLeft > 0) parts.push(`${num(kcalLeft)} kcal`);
  if (!parts.length) return 'Tudo em dia por hoje.';
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} e ${parts.at(-1)}`;
  return `${list} pela frente.`;
}

export function greeting(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Bom dia';
  if (hour >= 12 && hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

export type CalorieState = 'empty' | 'deficit' | 'goal' | 'surplus';

const pctText = (n: number) => `${num(n, 1)}%`;

/**
 * The calorie summary in four plain lines: how complete the day is, what is
 * left (or over), and a verdict. Below the goal is a deficit, above is a
 * surplus. The share is cut down, never rounded up, so "100% completo" always
 * means the goal was reached.
 */
export function calorieStatus(eaten: number, target: number): { state: CalorieState; pct: number; done: string; rest: string; verdict: string } {
  const eatenKcal = Math.round(eaten);
  const goalKcal = Math.round(target);
  const diff = goalKcal - eatenKcal;
  const pct = goalKcal > 0 ? Math.floor((eatenKcal / goalKcal) * 1000) / 10 : 0;
  if (eatenKcal <= 0) return { state: 'empty', pct: 0, done: '0% completo', rest: '100% restante', verdict: 'Nada registrado hoje' };
  if (diff === 0) return { state: 'goal', pct: 100, done: '100% completo', rest: '0% restante', verdict: 'Meta batida' };
  if (diff > 0) {
    const rest = Math.round((100 - pct) * 10) / 10;
    return { state: 'deficit', pct, done: `${pctText(pct)} completo`, rest: `${pctText(rest)} restante`, verdict: `Você está em déficit de ${num(diff)} kcal` };
  }
  const over = Math.round((pct - 100) * 10) / 10;
  return { state: 'surplus', pct, done: `${pctText(pct)} da meta`, rest: `${pctText(over)} acima`, verdict: `Você está em superávit de ${num(-diff)} kcal` };
}
