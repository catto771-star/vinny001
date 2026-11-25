// Cross-Module Intelligence Engine:
// Connects Training & Cardio (calorie burn, muscle symmetry, scheduled routines)
// with Nutrition/Metabolism, Hydration, Intermittent Fasting, Habits, and Agenda/Tasks.
import { searchKey } from './text';
import { num } from './format';
const WORKOUT_HABIT_KEYWORDS = [
    'treino', 'treinar', 'academia', 'musculacao', 'exercicio', 'atividade fisica', 'calistenia', 'crossfit', 'funcional',
];
const CARDIO_HABIT_KEYWORDS = [
    'cardio', 'corrida', 'correr', 'caminhada', 'caminhar', 'aerobico', 'pedal', 'bicicleta', 'natacao',
];
/**
 * Finds active habits that correspond to a strength/modality workout or cardio session,
 * honoring an explicit `linkedHabitId` on `workout_plans` first, plus smart keyword matching.
 */
export function findMatchingTrainingHabits(habits, kind, linkedHabitId) {
    const active = habits.filter((h) => !h.is_archived);
    const out = new Map();
    if (linkedHabitId) {
        const linked = active.find((h) => h.id === linkedHabitId);
        if (linked)
            out.set(linked.id, linked);
    }
    const keywords = kind === 'cardio'
        ? [...CARDIO_HABIT_KEYWORDS, 'exercicio', 'atividade fisica', 'treino', 'treinar']
        : WORKOUT_HABIT_KEYWORDS;
    for (const h of active) {
        const k = searchKey(h.name);
        if (keywords.some((kw) => k === kw || k.startsWith(`${kw} `) || k.endsWith(` ${kw}`) || k.includes(` ${kw} `))) {
            out.set(h.id, h);
        }
    }
    return [...out.values()];
}
/**
 * Synthesizes intelligent cross-module insights linking Training, Diet, Hydration,
 * Fasting, Habits, Muscle Balance, and Daily Task Load.
 */
export function computeCrossModuleSynergy(input) {
    const nowMs = input.nowMs ?? Date.now();
    // Sweat loss adjustment: +500 mL per 60 minutes of training (rounded to nearest 50 mL)
    const rawBonus = input.trainingMinutesToday > 0 ? Math.round(((input.trainingMinutesToday / 60) * 500) / 50) * 50 : 0;
    const sweatBonusMl = Math.min(1500, Math.max(0, rawBonus));
    const adjustedWaterGoalMl = input.baseWaterGoalMl + sweatBonusMl;
    const proteinFloor = input.targetProteinG ?? Math.round(input.weightKg * 1.8);
    const proteinGapG = Math.max(0, Math.round(proteinFloor - input.consumedProteinG));
    const calorieBalanceKcal = Math.round(input.consumedKcal - input.totalExpenditureKcal);
    let fastedHoursAtWorkout = null;
    if (input.activeFastStartedAt) {
        const elapsedH = (nowMs - Date.parse(input.activeFastStartedAt)) / 3_600_000;
        if (Number.isFinite(elapsedH) && elapsedH > 0) {
            fastedHoursAtWorkout = Math.round(elapsedH * 10) / 10;
        }
    }
    const insights = [];
    // 1. Training <-> Nutrition & Dynamic Burn
    if (input.trainedToday && input.burnedKcalToday > 0) {
        if (proteinGapG >= 35) {
            insights.push({
                id: 'post-workout-protein',
                domain: 'nutricao',
                tone: 'brand',
                title: `Pós-treino: +${num(input.burnedKcalToday)} kcal gastas · faltam ${num(proteinGapG)} g de proteína`,
                detail: `O treino elevou seu gasto diário para ${num(input.totalExpenditureKcal)} kcal. Priorize uma refeição rica em leucina/proteína para síntese muscular.`,
                actionLabel: 'Sugerir pós-treino (IA)',
                actionTab: 'Oráculo',
                aiPrompt: `Acabei de treinar (gastei cerca de ${Math.round(input.burnedKcalToday)} kcal em ${input.trainingMinutesToday} min) e ainda faltam ${proteinGapG} g de proteína hoje. Use sugerir_alimentos_dia para montar meu pós-treino ideal.`,
            });
        }
        else {
            insights.push({
                id: 'post-workout-fueled',
                domain: 'nutricao',
                tone: 'positive',
                title: `Sinergia Treino × Dieta alinhada (+${num(input.burnedKcalToday)} kcal ativas)`,
                detail: `Ingestão proteica encaminhada (${num(input.consumedProteinG)} g) frente ao gasto total de ${num(input.totalExpenditureKcal)} kcal.`,
                actionLabel: 'Ver Dieta',
                actionTab: 'Dieta',
                aiPrompt: 'Analise meu balanço energético de hoje cruzando o gasto do treino com minhas refeições registradas.',
            });
        }
    }
    else if (input.scheduledSessionLabel) {
        insights.push({
            id: 'scheduled-routine-ready',
            domain: 'agenda',
            tone: 'neutral',
            title: `Divisão prevista hoje: ${input.scheduledSessionLabel}`,
            detail: input.dueTasksTodayCount && input.dueTasksTodayCount >= 5
                ? `Você tem ${input.dueTasksTodayCount} tarefas pendentes hoje — considere um treino objetivo ou supersets para ganhar tempo.`
                : 'Sua ficha do dia já está pronta com cargas sugeridas da última sessão.',
            actionLabel: 'Abrir Ficha',
            actionTab: 'Treino',
            aiPrompt: `Hoje tenho "${input.scheduledSessionLabel}" previsto e ${input.dueTasksTodayCount ?? 0} tarefas no dia. Organize o melhor horário e estratégia para encaixar meu treino.`,
        });
    }
    // 2. Training <-> Hydration (sweat compensation)
    if (sweatBonusMl >= 200 && input.drunkWaterMl < adjustedWaterGoalMl * 0.75) {
        const remMl = Math.max(0, adjustedWaterGoalMl - input.drunkWaterMl);
        insights.push({
            id: 'sweat-hydration',
            domain: 'hidratacao',
            tone: 'warning',
            title: `Meta hídrica ajustada pelo treino: +${num(sweatBonusMl)} mL`,
            detail: `Pelos ${input.trainingMinutesToday} min de atividade, sua meta subiu para ${num(adjustedWaterGoalMl)} mL (faltam ${num(remMl)} mL).`,
            actionLabel: 'Ajustar hidratação',
            actionTab: 'Dieta',
            aiPrompt: `Treinei por ${input.trainingMinutesToday} min hoje e bebi ${input.drunkWaterMl} mL de água até agora (meta ajustada ${adjustedWaterGoalMl} mL). Registre +500 mL ou me oriente sobre reposição de eletrólitos.`,
        });
    }
    // 3. Training <-> Intermittent Fasting
    if (fastedHoursAtWorkout !== null && fastedHoursAtWorkout >= 12 && (input.trainedToday || input.scheduledSessionLabel)) {
        insights.push({
            id: 'fasted-training',
            domain: 'jejum',
            tone: 'brand',
            title: `Treino em jejum (${num(fastedHoursAtWorkout, 1)}h acumuladas)`,
            detail: input.trainedToday
                ? 'Sessão realizada em janela de jejum prolongado: capriche em água/sódio e planeje uma quebra de jejum rica em proteína.'
                : 'Você está em jejum há mais de 12h com treino previsto hoje: mantenha hidratação/eletrólitos e alinhe a janela alimentar pós-sessão.',
            actionLabel: 'Ver Jejum',
            actionTab: 'Jejum',
            aiPrompt: `Estou com ${fastedHoursAtWorkout}h de jejum hoje e ${input.trainedToday ? 'já treinei' : 'vou treinar'}. Como otimizar minha quebra de jejum e recuperação?`,
        });
    }
    // 4. Training <-> Habits Synchronization
    if (input.trainedToday && (input.completedTrainingHabitsCount ?? 0) > 0) {
        insights.push({
            id: 'habit-synced',
            domain: 'habitos',
            tone: 'positive',
            title: 'Hábito diário sincronizado com o treino',
            detail: 'Seu registro em Saúde mantém sua constância de hábitos em dia automaticamente.',
            actionLabel: 'Ver Hábitos',
            actionRoute: '/habitos',
            aiPrompt: 'Verifique meus hábitos e metas ativos e me diga como minha constância de treinos está impactando minhas metas.',
        });
    }
    else if (input.trainedToday && (input.pendingTrainingHabitsCount ?? 0) > 0) {
        insights.push({
            id: 'habit-pending-sync',
            domain: 'habitos',
            tone: 'warning',
            title: 'Hábito de exercício pendente hoje',
            detail: 'Você já registrou atividade em Saúde hoje — marque o hábito correspondente para manter o streak.',
            actionLabel: 'Abrir Hábitos',
            actionRoute: '/habitos',
            aiPrompt: 'Já treinei hoje! Marque meu hábito de treino/exercício como concluído hoje.',
        });
    }
    // 5. Weekly Muscle Symmetry diagnostic
    if (input.pushPullRatio != null && input.pushPullRatio > 1.55) {
        insights.push({
            id: 'muscle-imbalance',
            domain: 'simetria',
            tone: 'warning',
            title: `Desequilíbrio semanal Empurrar/Puxar (${num(input.pushPullRatio, 2)}×)`,
            detail: 'Volume de peito/ombros/tríceps está bem acima de costas/bíceps nesta semana — inclua remadas ou face pulls.',
            actionLabel: 'Ajustar Ficha (IA)',
            actionTab: 'Treino',
            aiPrompt: `Minha proporção semanal de séries Empurrar/Puxar está em ${input.pushPullRatio}x. Analise minha evolução de treino e sugira ajustes na minha ficha para equilibrar costas e posterior de ombro.`,
        });
    }
    else if ((input.upperSetsWeek ?? 0) >= 8 && (input.legsSetsWeek ?? 0) === 0) {
        insights.push({
            id: 'legs-gap',
            domain: 'simetria',
            tone: 'neutral',
            title: 'Membros inferiores sem estímulo nesta semana',
            detail: `${num(input.upperSetsWeek ?? 0, 1)} séries ponderadas de superiores registradas e 0 de pernas até agora.`,
            actionLabel: 'Ver Anatomia',
            actionTab: 'Treino',
            aiPrompt: 'Ainda não treinei pernas nesta semana. Monte ou sugira uma sessão eficiente de membros inferiores para encaixar nos próximos dias.',
        });
    }
    // Compute composite 0..100 synergy score
    const hydrationRatio = Math.min(1, input.drunkWaterMl / Math.max(1, adjustedWaterGoalMl));
    const proteinRatio = Math.min(1, input.consumedProteinG / Math.max(1, proteinFloor));
    const activityScore = input.trainedToday ? 1 : input.scheduledSessionLabel ? 0.5 : 0.8;
    const symmetryScore = input.pushPullRatio != null && (input.pushPullRatio > 1.7 || input.pushPullRatio < 0.55) ? 0.65 : 1;
    const synergyScore = Math.round((hydrationRatio * 25 + proteinRatio * 35 + activityScore * 25 + symmetryScore * 15));
    return {
        synergyScore: Math.max(0, Math.min(100, synergyScore)),
        adjustedWaterGoalMl,
        sweatBonusMl,
        fastedHoursAtWorkout,
        proteinGapG,
        calorieBalanceKcal,
        insights,
    };
}
