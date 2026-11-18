// Converts records exported from Néctar into rows of this app's tables.
// Each function takes the export object and the target user's id.

const PRIORITY = { alta: 'high', 'média': 'medium', media: 'medium', baixa: 'low', high: 'high', medium: 'medium', low: 'low' };
const priority = (v) => PRIORITY[String(v ?? '').toLowerCase()] ?? 'medium';

const TASK_STATUS = { feito: 'completed', concluido: 'completed', 'concluído': 'completed', completed: 'completed',
  em_andamento: 'in_progress', fazendo: 'in_progress', in_progress: 'in_progress' };

const HABIT_TYPES = new Set(['boolean', 'quantity', 'duration', 'measurable']);

const pick = (row, keys) => Object.fromEntries(keys.filter((k) => row[k] !== undefined).map((k) => [k, row[k]]));

// Columns that are NOT NULL with a default in the schema. A null coming from
// the export is dropped so the database fills in the default.
const DEFAULTED = new Set(['due_all_day', 'is_archived', 'metric_config', 'monthly_goal', 'color', 'unit', 'completed',
  'alarm_enabled', 'is_pinned', 'is_favorite', 'source_type', 'content', 'content_text', 'tags', 'created_at',
  'measured_at', 'source', 'metadata', 'metric_values', 'importance', 'value']);
const dropNullDefaults = (row) => Object.fromEntries(Object.entries(row).filter(([k, v]) => !(v === null && DEFAULTED.has(k))));

export function mapExport(data, userId) {
  const rows = (t) => (Array.isArray(data[t]) ? data[t] : []);
  const own = (r) => dropNullDefaults({ ...r, user_id: userId });

  const task_tags = rows('task_tags').map((r) => own(pick(r, ['id', 'name', 'color', 'created_at'])));

  const tasks = rows('tasks').map((r) => {
    const status = TASK_STATUS[String(r.status ?? '').toLowerCase()] ?? (r.completed ? 'completed' : 'pending');
    return own({
      ...pick(r, ['id', 'title', 'description', 'due_date', 'due_all_day', 'is_archived', 'created_at', 'completed_at']),
      status,
      completed: Boolean(r.completed) || status === 'completed',
      priority: priority(r.priority),
      tags: Array.isArray(r.tags) ? r.tags.map(String) : [],
    });
  });

  const habits = rows('habits').map((r) => own({
    ...pick(r, ['id', 'name', 'description', 'unit', 'monthly_goal', 'schedule_time', 'color', 'metric_config', 'created_at']),
    habit_type: HABIT_TYPES.has(r.habit_type) ? r.habit_type : 'boolean',
    target_value: r.target_value ?? (r.habit_type === 'measurable' ? null : 1),
    schedule_days: Array.isArray(r.schedule_days) && r.schedule_days.length ? r.schedule_days.map(Number) : null,
    unit: r.unit ?? 'vezes',
    color: r.color ?? '#0ea5e9',
    metric_config: r.metric_config ?? {},
  }));

  const habit_completions = rows('habits').flatMap((h) => (h.habit_completions ?? []).map((c) => {
    // A measured value may live in metric_values.value; otherwise one completion counts as 1.
    const metric = c.metric_values && typeof c.metric_values === 'object' ? Number(c.metric_values.value) : NaN;
    return own({
      ...pick(c, ['id', 'completed_date', 'notes', 'metric_values']),
      habit_id: h.id,
      value: Number.isFinite(metric) ? metric : Number(c.value ?? 1),
    });
  }));

  const reminders = rows('reminders').map((r) => own({
    ...pick(r, ['id', 'title', 'datetime', 'completed', 'alarm_enabled', 'created_at']),
    priority: priority(r.priority),
  }));

  const knowledge_areas = rows('knowledge_areas').map((r) => own(pick(r, ['id', 'name', 'emoji', 'color', 'description', 'created_at'])));
  const knowledge_blocks = rows('knowledge_blocks').map((r) => own({
    ...pick(r, ['id', 'area_id', 'title', 'content', 'content_text', 'summary', 'is_pinned', 'is_favorite', 'source_type', 'created_at']),
    tags: Array.isArray(r.tags) ? r.tags.map(String) : [],
    importance: Math.min(5, Math.max(1, Number(r.importance) || 3)),
  }));

  const body_measurements = rows('body_measurements').map((r) => own(pick(r, ['id', 'measured_at', 'metric', 'value', 'source', 'notes'])));
  const chat_messages = rows('chat_messages').map((r) => own(pick(r, ['id', 'content', 'is_user', 'metadata', 'created_at'])));

  // Insert order respects foreign keys.
  return [
    ['task_tags', task_tags], ['tasks', tasks], ['habits', habits], ['habit_completions', habit_completions],
    ['reminders', reminders], ['knowledge_areas', knowledge_areas], ['knowledge_blocks', knowledge_blocks],
    ['body_measurements', body_measurements], ['chat_messages', chat_messages],
  ];
}
