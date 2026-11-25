/** Measurements of an assessment, in the order they are taken. */
export const BODY_METRICS = [
    { key: 'weight_kg', label: 'Peso', unit: 'kg' },
    { key: 'body_fat_pct', label: 'Gordura corporal', unit: '%' },
    { key: 'neck_cm', label: 'Pescoço', unit: 'cm' },
    { key: 'chest_cm', label: 'Peitoral', unit: 'cm' },
    { key: 'waist_cm', label: 'Cintura', unit: 'cm' },
    { key: 'abdomen_cm', label: 'Abdômen', unit: 'cm' },
    { key: 'hip_cm', label: 'Quadril', unit: 'cm' },
    { key: 'arm_cm', label: 'Braço direito', unit: 'cm' },
    { key: 'arm_left_cm', label: 'Braço esquerdo', unit: 'cm' },
    { key: 'thigh_cm', label: 'Coxa direita', unit: 'cm' },
    { key: 'thigh_left_cm', label: 'Coxa esquerda', unit: 'cm' },
    { key: 'calf_cm', label: 'Panturrilha', unit: 'cm' },
];
/** The waist the Navy method reads: the abdomen at the navel for men, the narrowest waist for women. */
export function navyWaist(sex, m) {
    return sex === 'M' ? m.abdomen_cm ?? m.waist_cm : m.waist_cm ?? m.abdomen_cm;
}
/**
 * Body fat by the U.S. Navy circumference method. Men use neck and waist,
 * women also the hip. Returns null when a needed value is missing.
 */
export function navyBodyFat(p) {
    const { sex, height_cm: h, neck_cm: n, waist_cm: w, hip_cm: hip } = p;
    if (!sex || !h || !n || !w)
        return null;
    let pct;
    if (sex === 'M') {
        if (w <= n)
            return null;
        pct = 495 / (1.0324 - 0.19077 * Math.log10(w - n) + 0.15456 * Math.log10(h)) - 450;
    }
    else {
        if (!hip || w + hip <= n)
            return null;
        pct = 495 / (1.29579 - 0.35004 * Math.log10(w + hip - n) + 0.221 * Math.log10(h)) - 450;
    }
    return Math.round(pct * 10) / 10;
}
/** Each measurement of an assessment next to the same one in the previous assessment. */
export function compareAssessments(current, previous) {
    return BODY_METRICS.filter((m) => current.values[m.key] !== undefined).map((m) => {
        const prev = previous?.values[m.key];
        return {
            key: m.key, label: m.label, unit: m.unit, current: current.values[m.key], previous: prev ?? null,
            change: prev === undefined ? null : Math.round((current.values[m.key] - prev) * 10) / 10,
        };
    });
}
