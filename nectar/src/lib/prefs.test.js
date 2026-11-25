import { describe, expect, it } from 'vitest';
import { EXPORT_TABLES, NOT_EXPORTED, OWN_ROWS_ONLY, exportFileName, modelLabel, resolveStart, tzLabel } from './prefs';
describe('preferences', () => {
    it('opens on a known screen, never on settings', () => {
        const paths = ['inicio', 'agenda', 'tarefas', 'configuracoes'];
        expect(resolveStart('agenda', paths)).toBe('agenda');
        expect(resolveStart('configuracoes', paths)).toBe('inicio');
        expect(resolveStart('sumiu', paths)).toBe('inicio');
        expect(resolveStart(null, paths)).toBe('inicio');
    });
    it('names time zones with their offset', () => {
        const at = new Date('2026-07-01T12:00:00Z');
        expect(tzLabel('America/Sao_Paulo', at)).toBe('Sao Paulo (UTC−03:00)');
        expect(tzLabel('Europe/Lisbon', at)).toBe('Lisbon (UTC+01:00)');
        expect(tzLabel('UTC', at)).toBe('UTC');
    });
    it('exports every table once, with a dated file name', () => {
        expect(new Set(EXPORT_TABLES).size).toBe(EXPORT_TABLES.length);
        for (const t of ['tasks', 'transactions', 'knowledge_blocks', 'body_photos', 'goal_entries', 'assistant_memories'])
            expect(EXPORT_TABLES).toContain(t);
        expect(exportFileName(new Date(2026, 10, 9))).toBe('painel-dados-2026-11-09.json');
    });
    it('covers every table of the database, apart from the ones left out on purpose', () => {
        // The public tables of the project (information_schema).
        const all = 'assistant_memories,automation_runs,automations,banks,body_assessments,body_measurements,body_photos,brain_entries,card_invoice_payments,cardio_sessions,cards,category_budgets,chat_messages,diary_entries,diet_day_overrides,diet_day_targets,diet_plan_items,diet_plan_meals,diet_plans,diet_weekday_targets,events,exercise_settings,exercises,food_logs,foods,fx_rates,goal_entries,goals,habit_completions,habits,installment_purchases,knowledge_areas,knowledge_blocks,knowledge_connections,meal_photos,notification_log,project_steps,project_tags,project_tasks,projects,push_subscriptions,reminder_recurring_templates,reminders,set_types,task_recurrences,task_recurring_templates,task_tags,tasks,transaction_recurring_skips,transaction_recurring_templates,transactions,transfers,user_settings,workout_plan_exercises,workout_plan_sessions,workout_plans,workout_sets,workouts'.split(',');
        expect([...EXPORT_TABLES, ...NOT_EXPORTED].sort()).toEqual(all.sort());
        for (const t of OWN_ROWS_ONLY)
            expect(EXPORT_TABLES).toContain(t);
    });
    it('formats known and unknown AI model ids cleanly', () => {
        expect(modelLabel('anthropic/claude-sonnet-4')).toBe('Claude Sonnet 4');
        expect(modelLabel('custom/my-model')).toBe('my-model');
    });
});
