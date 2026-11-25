// Intermittent Fasting protocols, live countdown/count-up status, expected end preview,
// metabolic stages, and daily fasted-hours aggregation.
import { toDay } from './dates';
export const FASTING_PROTOCOLS = [
    { id: '14:10', label: '14:10', fastHours: 14, eatHours: 10, subtitle: 'Iniciante · 14h jejum, 10h alimentação' },
    { id: '16:8', label: '16:8', fastHours: 16, eatHours: 8, subtitle: 'Leangains · 16h jejum, 8h alimentação' },
    { id: '18:6', label: '18:6', fastHours: 18, eatHours: 6, subtitle: 'Intermediário · 18h jejum, 6h alimentação' },
    { id: '20:4', label: '20:4', fastHours: 20, eatHours: 4, subtitle: 'Warrior · 20h jejum, 4h alimentação' },
    { id: '23:1', label: 'OMAD (23:1)', fastHours: 23, eatHours: 1, subtitle: 'Uma refeição ao dia · 23h jejum' },
    { id: '24h', label: '24h', fastHours: 24, eatHours: 0, subtitle: 'Dia completo · Eat-Stop-Eat' },
    { id: '36h', label: '36h', fastHours: 36, eatHours: 0, subtitle: 'Jejum prolongado · 36 horas' },
];
export const METABOLIC_STAGES = [
    { id: 'fed', label: 'Digestão e absorção', minHours: 0, description: 'Glicose e insulina elevadas após a última refeição' },
    { id: 'post_absorptive', label: 'Queda de insulina', minHours: 4, description: 'Uso gradual do glicogênio hepático' },
    { id: 'fat_burning', label: 'Lipólise ativa', minHours: 12, description: 'Transição metabólica para oxidação de gordura' },
    { id: 'ketosis', label: 'Cetose leve e autofagia inicial', minHours: 16, description: 'Produção de corpos cetônicos e reciclagem celular' },
    { id: 'deep_ketosis', label: 'Cetose profunda e autofagia', minHours: 24, description: 'Estoque de glicogênio esgotado; cetose acentuada' },
];
export function metabolicStageForHours(hours) {
    let current = METABOLIC_STAGES[0];
    for (const s of METABOLIC_STAGES) {
        if (hours >= s.minHours)
            current = s;
    }
    return current;
}
/** Computes live or completed status of a fasting session, including exact expected end timestamp. */
export function computeFastingStatus(session, now = new Date()) {
    const startMs = new Date(session.started_at).getTime();
    const endRefMs = session.ended_at ? new Date(session.ended_at).getTime() : now.getTime();
    const elapsedMs = Math.max(0, endRefMs - startMs);
    const elapsedHours = Math.round((elapsedMs / 3_600_000) * 100) / 100;
    const targetMs = Math.max(1, Number(session.target_hours) * 3_600_000);
    const remainingMs = Math.max(0, targetMs - elapsedMs);
    const pct = Math.min(100, Math.round((elapsedMs / targetMs) * 100));
    const expectedEndAt = new Date(startMs + targetMs);
    return {
        isActive: session.ended_at === null,
        elapsedMs,
        elapsedHours,
        targetMs,
        remainingMs,
        pct,
        goalReached: elapsedMs >= targetMs,
        expectedEndAt,
        stage: metabolicStageForHours(elapsedHours),
    };
}
/** Formats milliseconds into `HHh MMm` or `HH:MM:SS` for live timers. */
export function formatFastingDuration(ms, withSeconds = false) {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const pad = (n) => String(n).padStart(2, '0');
    if (withSeconds)
        return `${pad(h)}:${pad(m)}:${pad(s)}`;
    return `${h}h ${pad(m)}min`;
}
/** Summarizes fasting history and maps completed/active fast hours per calendar day (for charts). */
export function summarizeFasts(sessions, now = new Date()) {
    const completed = sessions.filter((s) => s.ended_at !== null);
    let sumH = 0;
    let maxH = 0;
    const hoursByDay = new Map();
    for (const s of sessions) {
        const st = computeFastingStatus(s, now);
        const day = toDay(new Date(s.ended_at ?? s.started_at));
        hoursByDay.set(day, Math.round(((hoursByDay.get(day) ?? 0) + st.elapsedHours) * 10) / 10);
        if (!st.isActive) {
            sumH += st.elapsedHours;
            if (st.elapsedHours > maxH)
                maxH = st.elapsedHours;
        }
    }
    return {
        completedCount: completed.length,
        averageHours: completed.length ? Math.round((sumH / completed.length) * 10) / 10 : 0,
        longestHours: Math.round(maxH * 10) / 10,
        hoursByDay,
    };
}
