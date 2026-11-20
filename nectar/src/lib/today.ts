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
