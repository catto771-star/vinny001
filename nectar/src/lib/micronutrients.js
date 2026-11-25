// Micronutrients, household serving measures, Nutrition Scores, Nutrient Balances,
// and the Oracle nutrient ranking & AI prompt builder (inspired by Cronometer).
export const MICRONUTRIENTS = [
    // Vitaminas
    { key: 'vitamin_a_ug', label: 'Vitamina A', shortLabel: 'Vit. A', unit: 'µg', category: 'Vitaminas', rdaM: 900, rdaF: 700, ul: 3000 },
    { key: 'vitamin_c_mg', label: 'Vitamina C', shortLabel: 'Vit. C', unit: 'mg', category: 'Vitaminas', rdaM: 90, rdaF: 75, ul: 2000 },
    { key: 'vitamin_d_iu', label: 'Vitamina D', shortLabel: 'Vit. D', unit: 'UI', category: 'Vitaminas', rdaM: 600, rdaF: 600, ul: 4000 },
    { key: 'vitamin_e_mg', label: 'Vitamina E', shortLabel: 'Vit. E', unit: 'mg', category: 'Vitaminas', rdaM: 15, rdaF: 15, ul: 1000 },
    { key: 'vitamin_k_ug', label: 'Vitamina K', shortLabel: 'Vit. K', unit: 'µg', category: 'Vitaminas', rdaM: 120, rdaF: 90 },
    { key: 'b1_mg', label: 'B1 (Tiamina)', shortLabel: 'Vit. B1', unit: 'mg', category: 'Vitaminas', rdaM: 1.2, rdaF: 1.1 },
    { key: 'b2_mg', label: 'B2 (Riboflavina)', shortLabel: 'Vit. B2', unit: 'mg', category: 'Vitaminas', rdaM: 1.3, rdaF: 1.1 },
    { key: 'b3_mg', label: 'B3 (Niacina)', shortLabel: 'Vit. B3', unit: 'mg', category: 'Vitaminas', rdaM: 16, rdaF: 14, ul: 35 },
    { key: 'b6_mg', label: 'B6 (Piridoxina)', shortLabel: 'Vit. B6', unit: 'mg', category: 'Vitaminas', rdaM: 1.3, rdaF: 1.3, ul: 100 },
    { key: 'folate_ug', label: 'Folato (B9)', shortLabel: 'Folato', unit: 'µg', category: 'Vitaminas', rdaM: 400, rdaF: 400, ul: 1000 },
    { key: 'b12_ug', label: 'B12 (Cobalamina)', shortLabel: 'Vit. B12', unit: 'µg', category: 'Vitaminas', rdaM: 2.4, rdaF: 2.4 },
    // Minerais
    { key: 'calcium_mg', label: 'Cálcio', shortLabel: 'Cálcio', unit: 'mg', category: 'Minerais', rdaM: 1000, rdaF: 1000, ul: 2500 },
    { key: 'iron_mg', label: 'Ferro', shortLabel: 'Ferro', unit: 'mg', category: 'Minerais', rdaM: 8, rdaF: 18, ul: 45 },
    { key: 'magnesium_mg', label: 'Magnésio', shortLabel: 'Magnésio', unit: 'mg', category: 'Minerais', rdaM: 420, rdaF: 320 },
    { key: 'potassium_mg', label: 'Potássio', shortLabel: 'Potássio', unit: 'mg', category: 'Minerais', rdaM: 3400, rdaF: 2600 },
    { key: 'sodium_mg', label: 'Sódio', shortLabel: 'Sódio', unit: 'mg', category: 'Minerais', rdaM: 1500, rdaF: 1500, ul: 2300 },
    { key: 'zinc_mg', label: 'Zinco', shortLabel: 'Zinco', unit: 'mg', category: 'Minerais', rdaM: 11, rdaF: 8, ul: 40 },
    { key: 'selenium_ug', label: 'Selênio', shortLabel: 'Selênio', unit: 'µg', category: 'Minerais', rdaM: 55, rdaF: 55, ul: 400 },
    { key: 'copper_mg', label: 'Cobre', shortLabel: 'Cobre', unit: 'mg', category: 'Minerais', rdaM: 0.9, rdaF: 0.9, ul: 10 },
    { key: 'phosphorus_mg', label: 'Fósforo', shortLabel: 'Fósforo', unit: 'mg', category: 'Minerais', rdaM: 700, rdaF: 700, ul: 4000 },
    // Lipídios & Outros
    { key: 'omega3_g', label: 'Ômega-3', shortLabel: 'Ômega-3', unit: 'g', category: 'Lipídios & Outros', rdaM: 1.6, rdaF: 1.1 },
    { key: 'omega6_g', label: 'Ômega-6', shortLabel: 'Ômega-6', unit: 'g', category: 'Lipídios & Outros', rdaM: 17, rdaF: 12 },
    { key: 'cholesterol_mg', label: 'Colesterol', shortLabel: 'Colesterol', unit: 'mg', category: 'Lipídios & Outros', rdaM: 300, rdaF: 300, ul: 300 },
    { key: 'sugars_g', label: 'Açúcares', shortLabel: 'Açúcares', unit: 'g', category: 'Lipídios & Outros', rdaM: 36, rdaF: 25, ul: 50 },
    { key: 'caffeine_mg', label: 'Cafeína', shortLabel: 'Cafeína', unit: 'mg', category: 'Lipídios & Outros', rdaM: 200, rdaF: 200, ul: 400 },
    { key: 'water_g', label: 'Água dos alimentos', shortLabel: 'Água (alim.)', unit: 'mL', category: 'Lipídios & Outros', rdaM: 1000, rdaF: 800 },
];
export const HIGHLIGHTED_KEYS = [
    'iron_mg',
    'calcium_mg',
    'potassium_mg',
    'magnesium_mg',
    'vitamin_c_mg',
    'vitamin_d_iu',
    'b12_ug',
    'omega3_g',
];
const r2 = (n) => Math.round(n * 100) / 100;
function norm(s) {
    return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
/**
 * Household serving measures for a food: merges stored `food.measures` with
 * sensible Brazilian/UK household portions inferred from the food's name and default serving.
 */
export function measuresForFood(food) {
    const out = [];
    const seen = new Set();
    const add = (label, grams) => {
        const g = Math.round(grams * 10) / 10;
        if (g <= 0)
            return;
        const key = `${label.toLowerCase()}:${g}`;
        if (seen.has(key))
            return;
        seen.add(key);
        out.push({ label, grams: g });
    };
    if (Array.isArray(food.measures)) {
        for (const m of food.measures) {
            if (m && typeof m.label === 'string' && typeof m.grams === 'number')
                add(m.label, m.grams);
        }
    }
    const n = norm(food.name);
    if (/\bclara\b|\begg white/.test(n)) {
        add('1 clara', 33);
    }
    else if (/\bovo|\begg\b/.test(n)) {
        add('1 unidade média', 50);
        add('1 unidade grande', 60);
    }
    if (/\bpao|\bbread|\btorrada|\btoast/.test(n)) {
        add('1 fatia', 25);
        add('1 unidade (pão francês)', 50);
    }
    if (/\bqueijo|\bcheese|\bpresunto|\bpeito de peru/.test(n)) {
        add('1 fatia', 20);
        add('1 fatia grossa', 30);
    }
    if (/\bwhey|\bprotein|\bproteina|\bhipercalorico/.test(n)) {
        add('1 scoop', 30);
    }
    if (/\bcreatina|\bcreatine|\bbcaa|\bglutamina/.test(n)) {
        add('1 dosador (5 g)', 5);
    }
    if (/\bbanana/.test(n)) {
        add('1 unidade média', 90);
        add('1 unidade grande', 120);
    }
    else if (/\bmaca|\bapple|\blaranja|\borange|\bpera|\bpear|\bpessego/.test(n)) {
        add('1 unidade média', 130);
    }
    else if (/\babacate|\bavocado/.test(n)) {
        add('1/2 unidade', 100);
        add('1 colher de sopa', 20);
    }
    else if (/\bmorango|\bmirtilo|\buva/.test(n)) {
        add('1 xícara', 140);
    }
    if (/\barroz|\brice|\bquinoa|\bmacarrao|\bpasta/.test(n)) {
        add('1 colher de sopa cheia', 25);
        add('1 escumadeira / colher de servir', 80);
        add('1 xícara cozida', 150);
    }
    if (/\bfeijao|\bbeans|\blentilha|\bgrao de bico/.test(n)) {
        add('1 concha média', 85);
        add('1 colher de sopa', 20);
    }
    if (/\baveia|\boats|\bgranola|\bfarinha|\btapioca/.test(n)) {
        add('1 colher de sopa', 15);
        add('1/2 xícara', 45);
    }
    if (/\bazeite|\boil|\boleo|\bmanteiga|\bbutter|\bmel\b|\bhoney|\bpasta de amendoim|\bpeanut butter/.test(n)) {
        add('1 colher de sopa', 13);
        add('1 colher de chá', 5);
    }
    if (/\bleite|\bmilk|\biogurte|\byogurt|\bsuco|\bjuice|\bbebida/.test(n)) {
        add('1 copo (200 mL)', 200);
        add('1 xícara (240 mL)', 240);
    }
    if (/\bcafe|\bcoffee|\bcha\b|\btea\b/.test(n)) {
        add('1 xícara (150 mL)', 150);
        add('1 xícara pequena (50 mL)', 50);
    }
    if (/\bfrango|\bchicken|\bcarne|\bbeef|\bpatinho|\balcatra|\bpeixe|\bsalmao|\btilapia|\batum/.test(n)) {
        add('1 filé médio', 120);
        add('1 filé grande', 160);
    }
    if (/\bcastanha|\bamendoa|\bnoz|\bchia|\blinhaca|\bamendoim/.test(n)) {
        add('1 colher de sopa', 12);
        add('1 punhado (30 g)', 30);
    }
    if (food.default_serving_g && food.default_serving_g !== 100 && food.default_serving_g !== 1) {
        add(`Porção padrão (${food.default_serving_g} g)`, food.default_serving_g);
    }
    add('100 g', 100);
    add('Gramas (g)', 1);
    return out;
}
// Reference USDA/TACO micronutrient profiles per 100 g for common food families
// when `food.nutrients` is empty, so Built-in TACO/CoFID foods immediately expose
// rich micronutrient data for Nutrition Scores, Balances, and The Oracle.
const REFERENCE_PROFILES = [
    {
        match: /\bespinafre|\bspinach|\bcouve|\bkale|\brucula|\bagriao/,
        per100g: { vitamin_a_ug: 469, vitamin_c_mg: 28, vitamin_k_ug: 483, folate_ug: 194, iron_mg: 2.7, calcium_mg: 99, magnesium_mg: 79, potassium_mg: 558, sodium_mg: 79, vitamin_e_mg: 2.0, water_g: 91 },
    },
    {
        match: /\bbrocolis|\bbroccoli|\bcouve-flor|\bcauliflower/,
        per100g: { vitamin_c_mg: 65, vitamin_k_ug: 102, folate_ug: 63, potassium_mg: 316, calcium_mg: 47, magnesium_mg: 21, iron_mg: 0.7, phosphorus_mg: 66, sodium_mg: 33, water_g: 89 },
    },
    {
        match: /\bcenoura|\bcarrot|\babobora|\bpumpkin|\bbatata-doce|\bbatata doce|\bsweet potato/,
        per100g: { vitamin_a_ug: 709, vitamin_c_mg: 12, potassium_mg: 337, magnesium_mg: 25, calcium_mg: 30, b6_mg: 0.21, copper_mg: 0.15, sodium_mg: 55, water_g: 77 },
    },
    {
        match: /\bbatata|\bpotato|\bmandioca|\baipim|\binhame/,
        per100g: { potassium_mg: 425, vitamin_c_mg: 13, b6_mg: 0.3, magnesium_mg: 23, iron_mg: 0.8, phosphorus_mg: 57, sodium_mg: 6, water_g: 79 },
    },
    {
        match: /\bovo|\begg\b/,
        per100g: { b12_ug: 1.1, vitamin_d_iu: 82, vitamin_a_ug: 160, b2_mg: 0.46, folate_ug: 47, selenium_ug: 31, iron_mg: 1.75, zinc_mg: 1.29, phosphorus_mg: 198, calcium_mg: 56, potassium_mg: 138, sodium_mg: 142, cholesterol_mg: 372, omega3_g: 0.1, omega6_g: 1.4, water_g: 76 },
    },
    {
        match: /\bsalmao|\bsalmon|\bsardinha|\bsardine|\batum|\btuna|\bcavala/,
        per100g: { omega3_g: 2.2, omega6_g: 0.2, vitamin_d_iu: 526, b12_ug: 3.2, b3_mg: 8.5, b6_mg: 0.8, selenium_ug: 41, potassium_mg: 490, phosphorus_mg: 252, magnesium_mg: 30, sodium_mg: 61, cholesterol_mg: 63, water_g: 68 },
    },
    {
        match: /\btilapia|\bpescada|\bmerluza|\bbacalhau|\bcod\b|\bpeixe/,
        per100g: { b12_ug: 1.8, selenium_ug: 45, phosphorus_mg: 204, potassium_mg: 380, magnesium_mg: 34, omega3_g: 0.25, sodium_mg: 56, cholesterol_mg: 57, water_g: 78 },
    },
    {
        match: /\bcarne|\bbeef|\bpatinho|\balcatra|\bacem|\bcontrafile|\bpicanha|\bfigado|\bliver/,
        per100g: { b12_ug: 2.6, iron_mg: 2.7, zinc_mg: 5.8, selenium_ug: 26, b3_mg: 5.4, b6_mg: 0.5, phosphorus_mg: 215, potassium_mg: 340, magnesium_mg: 22, copper_mg: 0.1, sodium_mg: 66, cholesterol_mg: 78, water_g: 65 },
    },
    {
        match: /\bfrango|\bchicken|\bperu|\bturkey/,
        per100g: { b3_mg: 11.2, b6_mg: 0.6, b12_ug: 0.34, selenium_ug: 28, phosphorus_mg: 228, potassium_mg: 310, magnesium_mg: 29, zinc_mg: 1.0, iron_mg: 0.7, sodium_mg: 74, cholesterol_mg: 85, water_g: 66 },
    },
    {
        match: /\bleite|\bmilk|\biogurte|\byogurt|\bcoalhada|\bkefir/,
        per100g: { calcium_mg: 125, b12_ug: 0.45, b2_mg: 0.18, phosphorus_mg: 95, potassium_mg: 150, magnesium_mg: 11, zinc_mg: 0.4, vitamin_d_iu: 40, vitamin_a_ug: 46, sodium_mg: 44, sugars_g: 4.7, cholesterol_mg: 10, water_g: 88 },
    },
    {
        match: /\bqueijo|\bcheese|\bricota|\bcottage|\bmussarela|\bminas/,
        per100g: { calcium_mg: 650, phosphorus_mg: 450, b12_ug: 1.5, vitamin_a_ug: 240, zinc_mg: 3.1, selenium_ug: 15, sodium_mg: 520, potassium_mg: 90, cholesterol_mg: 85, water_g: 45 },
    },
    {
        match: /\bfeijao|\bbeans|\blentilha|\blentil|\bgrao de bico|\bchickpea|\bervilha/,
        per100g: { iron_mg: 2.4, magnesium_mg: 52, potassium_mg: 360, folate_ug: 140, zinc_mg: 1.1, copper_mg: 0.25, phosphorus_mg: 140, b1_mg: 0.18, calcium_mg: 28, sodium_mg: 5, water_g: 70 },
    },
    {
        match: /\baveia|\boats/,
        per100g: { magnesium_mg: 138, iron_mg: 4.2, zinc_mg: 3.6, phosphorus_mg: 410, b1_mg: 0.55, copper_mg: 0.39, potassium_mg: 362, selenium_ug: 28, calcium_mg: 52, sodium_mg: 4, water_g: 10 },
    },
    {
        match: /\barroz integral|\bbrown rice|\bquinoa/,
        per100g: { magnesium_mg: 44, phosphorus_mg: 103, potassium_mg: 86, zinc_mg: 0.6, b1_mg: 0.1, b3_mg: 1.5, iron_mg: 0.5, selenium_ug: 10, sodium_mg: 4, water_g: 72 },
    },
    {
        match: /\barroz|\brice/,
        per100g: { magnesium_mg: 12, phosphorus_mg: 43, potassium_mg: 35, iron_mg: 0.3, selenium_ug: 7, b3_mg: 0.4, sodium_mg: 2, water_g: 70 },
    },
    {
        match: /\bbanana/,
        per100g: { potassium_mg: 358, b6_mg: 0.37, vitamin_c_mg: 8.7, magnesium_mg: 27, folate_ug: 20, copper_mg: 0.08, sugars_g: 12.2, sodium_mg: 1, water_g: 75 },
    },
    {
        match: /\blaranja|\borange|\btangerina|\bmexerica|\bacerola|\bkiwi|\bmorango|\bgoiaba|\bmamao|\babacaxi|\bmanga/,
        per100g: { vitamin_c_mg: 58, folate_ug: 30, potassium_mg: 185, calcium_mg: 32, magnesium_mg: 12, vitamin_a_ug: 35, sugars_g: 9.0, sodium_mg: 2, water_g: 86 },
    },
    {
        match: /\babacate|\bavocado/,
        per100g: { potassium_mg: 485, folate_ug: 81, vitamin_e_mg: 2.1, vitamin_k_ug: 21, vitamin_c_mg: 10, magnesium_mg: 29, b6_mg: 0.26, copper_mg: 0.19, omega3_g: 0.11, omega6_g: 1.7, sodium_mg: 7, water_g: 73 },
    },
    {
        match: /\bchia|\blinhaca|\bflax/,
        per100g: { omega3_g: 17.8, omega6_g: 5.8, calcium_mg: 631, magnesium_mg: 335, iron_mg: 7.7, phosphorus_mg: 860, zinc_mg: 4.6, potassium_mg: 407, copper_mg: 0.9, selenium_ug: 55, water_g: 6 },
    },
    {
        match: /\bcastanha-do-para|\bcastanha do para|\bbrazil nut/,
        per100g: { selenium_ug: 1917, magnesium_mg: 376, phosphorus_mg: 725, potassium_mg: 659, zinc_mg: 4.1, copper_mg: 1.7, vitamin_e_mg: 5.7, calcium_mg: 160, omega6_g: 24.0, water_g: 3 },
    },
    {
        match: /\bamendoa|\balmond|\bnoz|\bwalnut|\bcastanha|\bamendoim|\bpeanut|\bpasta de amendoim/,
        per100g: { vitamin_e_mg: 15.0, magnesium_mg: 240, phosphorus_mg: 450, potassium_mg: 650, calcium_mg: 180, iron_mg: 3.2, zinc_mg: 3.1, copper_mg: 0.9, omega3_g: 1.5, omega6_g: 12.0, water_g: 5 },
    },
    {
        match: /\bazeite|\bolive oil/,
        per100g: { vitamin_e_mg: 14.4, vitamin_k_ug: 60.2, omega3_g: 0.76, omega6_g: 9.8, water_g: 0 },
    },
    {
        match: /\bcafe|\bcoffee|\bespresso/,
        per100g: { caffeine_mg: 65, potassium_mg: 49, magnesium_mg: 3, b2_mg: 0.08, b3_mg: 0.2, water_g: 99 },
    },
];
/** Returns per-100g micronutrients for a food (explicit JSONB wins over reference profile). */
export function micronutrientsPer100g(food) {
    const n = norm(food.name);
    const base = {};
    for (const ref of REFERENCE_PROFILES) {
        if (ref.match.test(n)) {
            Object.assign(base, ref.per100g);
            break;
        }
    }
    if (food.nutrients && typeof food.nutrients === 'object') {
        for (const [k, v] of Object.entries(food.nutrients)) {
            if (typeof v === 'number' && Number.isFinite(v) && v >= 0) {
                base[k] = v;
            }
        }
    }
    return base;
}
/** Scales per-100g micronutrients to `grams`. */
export function scaleMicronutrients(per100g, grams) {
    const f = Math.max(0, grams) / 100;
    const out = {};
    for (const [k, v] of Object.entries(per100g)) {
        if (typeof v === 'number' && Number.isFinite(v)) {
            out[k] = r2(v * f);
        }
    }
    return out;
}
/** Sums micronutrients across logged items; falls back to name-inferred profile when `nutrients` was empty on legacy rows. */
export function sumMicronutrients(logs) {
    const totals = Object.fromEntries(MICRONUTRIENTS.map((m) => [m.key, 0]));
    for (const l of logs) {
        const hasExplicit = l.nutrients && Object.keys(l.nutrients).length > 0;
        const map = hasExplicit
            ? l.nutrients
            : l.food_name && l.quantity_g
                ? scaleMicronutrients(micronutrientsPer100g({ name: l.food_name }), l.quantity_g)
                : {};
        for (const m of MICRONUTRIENTS) {
            const v = map[m.key];
            if (typeof v === 'number' && Number.isFinite(v))
                totals[m.key] += v;
        }
    }
    for (const m of MICRONUTRIENTS)
        totals[m.key] = r2(totals[m.key]);
    return totals;
}
export function rdaFor(meta, sex) {
    return sex === 'F' ? meta.rdaF : meta.rdaM;
}
/** Computes Cronometer-style composite Nutrition Scores (0–100%). */
export function computeNutritionScores(micros, sex) {
    const pctOf = (key) => {
        const meta = MICRONUTRIENTS.find((m) => m.key === key);
        const target = rdaFor(meta, sex);
        return target > 0 ? Math.min(100, (micros[key] / target) * 100) : 0;
    };
    const avg = (keys) => Math.round(keys.reduce((s, k) => s + pctOf(k), 0) / keys.length);
    const beneficial = MICRONUTRIENTS
        .filter((m) => !['sodium_mg', 'cholesterol_mg', 'sugars_g', 'caffeine_mg', 'water_g'].includes(m.key))
        .map((m) => m.key);
    return [
        { id: 'all', label: 'Todas as Metas', pct: avg(beneficial), detail: 'Média de vitaminas, minerais e ômegas essenciais' },
        { id: 'immunity', label: 'Imunidade', pct: avg(['vitamin_a_ug', 'vitamin_c_mg', 'vitamin_d_iu', 'vitamin_e_mg', 'b6_mg', 'b12_ug', 'folate_ug', 'zinc_mg', 'selenium_ug', 'iron_mg']), detail: 'Vit A, C, D, E, B6, B12, Folato, Zinco, Selênio e Ferro' },
        { id: 'electrolytes', label: 'Eletrólitos', pct: avg(['potassium_mg', 'magnesium_mg', 'calcium_mg']), detail: 'Potássio, Magnésio e Cálcio para hidratação e contração' },
        { id: 'bone', label: 'Saúde Óssea', pct: avg(['calcium_mg', 'vitamin_d_iu', 'vitamin_k_ug', 'magnesium_mg', 'phosphorus_mg']), detail: 'Cálcio, Vitamina D, Vitamina K, Magnésio e Fósforo' },
        { id: 'antioxidants', label: 'Antioxidantes', pct: avg(['vitamin_c_mg', 'vitamin_e_mg', 'vitamin_a_ug', 'selenium_ug', 'zinc_mg']), detail: 'Vitamina C, E, A, Selênio e Zinco' },
    ];
}
/** Computes Cronometer's key Nutrient Balance ratios + PRAL renal acid load. */
export function computeNutrientBalances(micros, protein_g) {
    const ratio = (id, label, numVal, denVal, minIdeal, maxIdeal, idealRange) => {
        if (numVal <= 0 || denVal <= 0) {
            return { id, label, valueLabel: '—', status: 'empty', idealRange };
        }
        const r = r2(numVal / denVal);
        const status = r < minIdeal ? 'low' : r > maxIdeal ? 'high' : 'optimal';
        return { id, label, valueLabel: `${r} : 1`, status, idealRange };
    };
    // Remer & Manz PRAL equation (mEq/day)
    const hasMineralData = protein_g > 0 || micros.potassium_mg > 0 || micros.magnesium_mg > 0;
    const pral = r2(0.49 * protein_g
        + 0.037 * micros.phosphorus_mg
        - 0.021 * micros.potassium_mg
        - 0.026 * micros.magnesium_mg
        - 0.013 * micros.calcium_mg);
    const pralBalance = !hasMineralData
        ? { id: 'pral', label: 'Carga Ácida (PRAL)', valueLabel: '—', status: 'empty', idealRange: '≤ 0 mEq (alcalino/neutro)' }
        : {
            id: 'pral',
            label: 'Carga Ácida (PRAL)',
            valueLabel: `${pral > 0 ? '+' : ''}${pral} mEq`,
            status: pral <= 5 ? 'optimal' : 'high',
            idealRange: '≤ +5 mEq (vegetais/potássio equilibram proteína)',
        };
    return [
        ratio('k_na', 'Potássio : Sódio', micros.potassium_mg, micros.sodium_mg, 1.5, 5.0, '1.5 – 5.0 : 1'),
        ratio('ca_mg', 'Cálcio : Magnésio', micros.calcium_mg, micros.magnesium_mg, 1.5, 2.6, '1.5 – 2.6 : 1'),
        ratio('zn_cu', 'Zinco : Cobre', micros.zinc_mg, micros.copper_mg, 8, 15, '8 – 15 : 1'),
        ratio('o6_o3', 'Ômega-6 : Ômega-3', micros.omega6_g, micros.omega3_g, 1, 4, '1 – 4 : 1'),
        pralBalance,
    ];
}
/** Ranks foods for a chosen nutrient using Cronometer's 3 Oracle modes. */
export function rankFoodsByNutrient(foods, nutrient, mode = 'oracle', limit = 20) {
    const unit = nutrient === 'protein_g' || nutrient === 'fiber_g'
        ? 'g'
        : (MICRONUTRIENTS.find((m) => m.key === nutrient)?.unit ?? '');
    const hits = [];
    for (const food of foods) {
        const amountPer100g = nutrient === 'protein_g'
            ? food.protein_g
            : nutrient === 'fiber_g'
                ? (food.fiber_g ?? 0)
                : (micronutrientsPer100g(food)[nutrient] ?? 0);
        if (!amountPer100g || amountPer100g <= 0)
            continue;
        const kcal = Math.max(15, food.kcal || 100);
        const amountPer100Kcal = r2((amountPer100g / kcal) * 100);
        const score = mode === 'per_100g'
            ? amountPer100g
            : mode === 'per_100kcal'
                ? amountPer100Kcal
                : r2(Math.sqrt(amountPer100g * amountPer100Kcal));
        hits.push({ food, amountPer100g: r2(amountPer100g), amountPer100Kcal, score, unit });
    }
    return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}
/** Builds a contextual prompt linking the Nutrition Oracle directly to Painel's AI Assistant. */
export function buildOracleAiPrompt(input) {
    const rem = `faltam ${Math.max(0, Math.round(input.remaining.kcal))} kcal, ${Math.max(0, Math.round(input.remaining.protein_g))} g de proteína, ${Math.max(0, Math.round(input.remaining.carbs_g))} g de carboidratos e ${Math.max(0, Math.round(input.remaining.fat_g))} g de gordura`;
    const low = input.lowestMicronutrients.length
        ? `Micronutrientes mais baixos hoje: ${input.lowestMicronutrients.map((m) => `${m.label} (${m.pct}% — ${m.consumed}/${m.target} ${m.unit})`).join(', ')}.`
        : '';
    const diet = input.diet && input.diet !== 'Nenhuma' ? ` Padrão alimentar: ${input.diet}.` : '';
    const excl = input.exclusions.length ? ` Excluir obrigatoriamente: ${input.exclusions.join(', ')}.` : '';
    return `Use o Oráculo Nutricional (sugerir_alimentos_dia / consultar_oraculo_nutrientes) para sugerir uma opção prática de "${input.meal}" para o dia ${input.date}: ${rem}. ${low}${diet}${excl} Mostre porções caseiras exatas, calorias/macros estimados e pergunte se quero que você registre essa refeição no meu diário agora.`;
}
