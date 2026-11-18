import { Link } from 'react-router-dom';
import { useTable } from '../lib/useTable';
import { formatDay, formatTime, greeting, toDay } from '../lib/dates';
import { bucketTasks, type Task } from '../lib/tasks';
import { isDone, routineFor, type Habit, type HabitCompletion } from '../lib/habits';
import { reminderPanel, type Reminder } from '../lib/reminders';

export default function Home() {
  const tasks = useTable<Task>('tasks');
  const habits = useTable<Habit>('habits');
  const completions = useTable<HabitCompletion>('habit_completions', 'id,habit_id,completed_date,value');
  const reminders = useTable<Reminder>('reminders', '*', { column: 'datetime' });
  const now = new Date();
  const today = toDay(now);
  const b = bucketTasks(tasks.rows, now);
  const routine = routineFor(habits.rows, today);
  const doneHabits = routine.filter((h) => isDone(h, completions.rows.find((c) => c.habit_id === h.id && c.completed_date === today)));
  const panel = reminderPanel(reminders.rows, now);
  const nextReminders = [...panel.overdue, ...panel.today].slice(0, 5);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-8 mt-4 text-center">
        <div className="label">{greeting(now)}</div>
        <h1 className="text-4xl font-light">{formatDay(today)}</h1>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Link to="/tarefas" className="card hover:border-sky-300">
          <div className="label">Tarefas</div>
          <div className="text-3xl font-semibold">{b.overdue.length + b.today.length}</div>
          <div className="text-sm text-slate-500">para hoje{b.overdue.length > 0 && `, ${b.overdue.length} atrasadas`}</div>
        </Link>
        <Link to="/habitos" className="card hover:border-sky-300">
          <div className="label">Hábitos</div>
          <div className="text-3xl font-semibold">{doneHabits.length}/{routine.length}</div>
          <div className="text-sm text-slate-500">feitos hoje</div>
        </Link>
        <Link to="/lembretes" className="card hover:border-sky-300">
          <div className="label">Lembretes</div>
          <div className="text-3xl font-semibold">{panel.today.length + panel.overdue.length}</div>
          <div className="text-sm text-slate-500">pendentes hoje</div>
        </Link>
      </div>
      {nextReminders.length > 0 && (
        <div className="card mt-4">
          <div className="label mb-2">A seguir</div>
          <ul className="space-y-1 text-sm">
            {nextReminders.map((r) => <li key={r.id}><span className="mr-2 text-slate-500">{formatTime(r.datetime)}</span>{r.title}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
