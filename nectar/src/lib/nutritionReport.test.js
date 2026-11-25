import { describe, expect, it } from 'vitest';
import { buildFoodLogsCsv, buildHealthComparisonSeries, buildPeriodNutritionReport, } from './nutritionReport';
describe('nutritionReport & dual-axis comparison engine', () => {
    const logs = [
        {
            id: 'l1',
            date: '2026-11-24',
            meal: 'Almoço',
            food_id: 'f1',
            food_name: 'Salmão grelhado',
            quantity_g: 200,
            kcal: 416,
            protein_g: 41,
            carbs_g: 0,
            fat_g: 27,
            fiber_g: 0,
            is_supplement: false,
        },
        {
            id: 'l2',
            date: '2026-11-24',
            meal: 'Café da manhã',
            food_id: 'f2',
            food_name: 'Vitamina C 1000mg',
            quantity_g: 2,
            kcal: 0,
            protein_g: 0,
            carbs_g: 0,
            fat_g: 0,
            fiber_g: 0,
            nutrients: { vitamin_c_mg: 1000 },
            is_supplement: true,
        },
        {
            id: 'l3',
            date: '2026-11-25',
            meal: 'Jantar',
            food_id: 'f3',
            food_name: 'Aveia em flocos',
            quantity_g: 100,
            kcal: 380,
            protein_g: 14,
            carbs_g: 66,
            fat_g: 7,
            fiber_g: 10,
            is_supplement: false,
        },
    ];
    it('filters Period Nutrition Report by completed days and supplement toggle', () => {
        const withSupp = buildPeriodNutritionReport({
            endDay: '2026-11-25',
            days: 7,
            foodLogs: logs,
            waterLogs: [{ date: '2026-11-24', ml: 2500 }, { date: '2026-11-25', ml: 2000 }],
            completedDays: new Set(['2026-11-24']),
            dayFilter: 'completed_only',
            includeSupplements: true,
            sex: 'M',
        });
        expect(withSupp.countedDays).toBe(1);
        expect(withSupp.averageMacros.kcal).toBe(416);
        expect(withSupp.averageMicros.vitamin_c_mg).toBe(1000);
        expect(withSupp.averageWaterMl).toBe(2500);
        const noSupp = buildPeriodNutritionReport({
            endDay: '2026-11-25',
            days: 7,
            foodLogs: logs,
            waterLogs: [],
            completedDays: new Set(['2026-11-24']),
            dayFilter: 'completed_only',
            includeSupplements: false,
            sex: 'M',
        });
        expect(noSupp.averageMicros.vitamin_c_mg).toBe(0);
    });
    it('aligns dual-axis comparison series and exports CSV cleanly', () => {
        const series = buildHealthComparisonSeries({
            endDay: '2026-11-25',
            days: 3,
            leftMetric: 'weight_kg',
            rightMetric: 'net_carbs_g',
            foodLogs: logs,
            waterLogs: [],
            measurements: [{ measured_at: '2026-11-25T08:00:00Z', metric: 'weight_kg', value: 99.4 }],
            fasts: [],
            tonnageByDay: new Map(),
        });
        expect(series).toHaveLength(3);
        expect(series[2].left).toBe(99.4);
        expect(series[2].right).toBe(56); // 66g carbs - 10g fiber
        const csv = buildFoodLogsCsv(logs);
        expect(csv.split('\n')).toHaveLength(4);
        expect(csv).toContain('Salmão grelhado');
    });
});
