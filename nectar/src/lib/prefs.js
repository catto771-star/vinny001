// Device and account preferences shown in Configurações.
/** The screen the app opens on; kept on this device. Anything unknown opens Início. */
export const START_KEY = 'painel.start';
export function resolveStart(saved, paths) {
    return saved && saved !== 'configuracoes' && paths.includes(saved) ? saved : 'inicio';
}
export function readStart(paths) {
    try {
        return resolveStart(localStorage.getItem(START_KEY), paths);
    }
    catch {
        return 'inicio';
    }
}
/** Time zones offered first; the device's own zone is added when missing. */
export const TIMEZONES = [
    'America/Sao_Paulo', 'America/Manaus', 'America/Cuiaba', 'America/Belem', 'America/Fortaleza', 'America/Recife',
    'America/Rio_Branco', 'America/Noronha', 'Europe/Lisbon', 'Europe/London', 'Europe/Madrid', 'Europe/Paris',
    'America/New_York', 'America/Los_Angeles', 'UTC',
];
/** "São Paulo (UTC−03:00)": the city and its offset at a moment. */
export function tzLabel(tz, at = new Date()) {
    const city = tz === 'UTC' ? 'UTC' : tz.split('/').pop().replace(/_/g, ' ');
    const name = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' }).formatToParts(at).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
    const offset = name === 'GMT' ? '+00:00' : name.replace('GMT', '');
    return tz === 'UTC' ? 'UTC' : `${city} (UTC${offset.replace('-', '−')})`;
}
/** Tables of a user's data, in the order a backup would restore them. */
export const EXPORT_TABLES = [
    'user_settings', 'assistant_memories', 'task_tags', 'tasks', 'task_recurring_templates', 'task_recurrences', 'habits', 'habit_completions', 'reminders',
    'reminder_recurring_templates', 'events', 'projects', 'project_steps', 'project_tasks', 'project_tags', 'goals', 'goal_entries',
    'knowledge_areas', 'knowledge_blocks', 'knowledge_connections', 'diary_entries', 'brain_entries', 'chat_messages',
    'automations', 'automation_runs', 'banks', 'cards', 'transaction_recurring_templates', 'installment_purchases',
    'transactions', 'transaction_recurring_skips', 'transfers', 'card_invoice_payments', 'category_budgets', 'foods', 'exercises', 'set_types',
    'exercise_settings', 'workout_plans', 'workout_plan_sessions', 'workout_plan_exercises', 'workouts', 'workout_sets',
    'cardio_sessions', 'diet_plans', 'diet_plan_meals', 'diet_plan_items', 'diet_day_targets', 'diet_weekday_targets',
    'diet_day_overrides', 'food_logs', 'meal_photos', 'body_assessments', 'body_measurements', 'body_photos',
];
/** Catalogs that mix built-in rows (no owner) with the user's own: only the user's go in the export. */
export const OWN_ROWS_ONLY = ['foods', 'exercises', 'set_types'];
/** Left out on purpose: device keys and send log (per device), and the public exchange-rate cache. */
export const NOT_EXPORTED = ['push_subscriptions', 'notification_log', 'fx_rates'];
export const AI_MODELS = [
    { id: 'anthropic/claude-sonnet-4', label: 'Claude Sonnet 4', note: 'Mais autônomo e preciso (recomendado)' },
    { id: 'anthropic/claude-3.7-sonnet', label: 'Claude 3.7 Sonnet', note: 'Alternativa Anthropic rápida e estável' },
    { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro', note: 'Contexto longo e forte em fotos/análises' },
    { id: 'openai/gpt-4.1-mini', label: 'GPT-4.1 mini', note: 'Rápido e econômico para comandos diários' },
    { id: 'deepseek/deepseek-chat-v3.1', label: 'DeepSeek V3.1', note: 'Econômico' },
];
export function modelLabel(id) {
    const known = AI_MODELS.find((m) => m.id === id);
    if (known)
        return known.label;
    return id.split('/').pop() ?? id;
}
export function exportFileName(now) {
    const p = (n) => String(n).padStart(2, '0');
    return `painel-dados-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.json`;
}
