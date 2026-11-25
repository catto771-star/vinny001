export const DONUT_PALETTE = [
    'var(--brand)',
    '#38bdf8',
    '#34d399',
    '#fbbf24',
    '#a78bfa',
    'var(--chart-neutral)',
];
/** True when at least one point has a non-null, non-zero value worth plotting. */
export function hasChartData(points) {
    return points.some((p) => p.value !== null && p.value !== 0);
}
/** Keyboard navigation over chart data points (ArrowLeft/ArrowRight/Home/End/Escape). */
export function nextChartIndex(current, length, key) {
    if (length <= 0)
        return null;
    if (key === 'Escape')
        return null;
    if (key === 'Home')
        return 0;
    if (key === 'End')
        return length - 1;
    if (key === 'ArrowRight')
        return current === null ? 0 : Math.min(length - 1, current + 1);
    if (key === 'ArrowLeft')
        return current === null ? length - 1 : Math.max(0, current - 1);
    return current;
}
/** Normalizes positive values into sorted donut slices, collapsing the tail into "Outros". */
export function donutSlices(rows, maxSlices = 5) {
    const positive = rows
        .filter((r) => Number.isFinite(r.value) && r.value > 0)
        .sort((a, b) => b.value - a.value);
    if (!positive.length)
        return [];
    const cap = Math.max(2, maxSlices);
    const grouped = positive.length > cap
        ? [
            ...positive.slice(0, cap - 1),
            {
                label: 'Outros',
                value: positive.slice(cap - 1).reduce((s, r) => s + r.value, 0),
                color: 'var(--chart-neutral)',
            },
        ]
        : positive;
    const total = grouped.reduce((s, r) => s + r.value, 0);
    return grouped.map((r, i) => {
        const share = total > 0 ? r.value / total : 0;
        return {
            label: r.label,
            value: r.value,
            share,
            pct: Math.round(share * 1000) / 10,
            color: r.color ?? DONUT_PALETTE[i % DONUT_PALETTE.length],
            detail: r.detail,
        };
    });
}
/** Computes change between the first and last non-null points of a chart series. */
export function seriesDelta(points) {
    const nums = points.map((p) => p.value).filter((v) => v !== null && Number.isFinite(v));
    if (nums.length < 2)
        return null;
    const first = nums[0];
    const last = nums[nums.length - 1];
    const diff = Math.round((last - first) * 100) / 100;
    const pct = first !== 0 ? Math.round(((last - first) / Math.abs(first)) * 1000) / 10 : null;
    return { first, last, diff, pct };
}
/** Smooth monotonic-friendly cubic Bezier SVG path through a list of (x, y) coordinates. */
export function smoothSvgPath(coords, tension = 0.2) {
    if (!coords.length)
        return '';
    if (coords.length === 1)
        return `M${coords[0].x},${coords[0].y}`;
    if (coords.length === 2)
        return `M${coords[0].x},${coords[0].y} L${coords[1].x},${coords[1].y}`;
    let d = `M${coords[0].x.toFixed(1)},${coords[0].y.toFixed(1)}`;
    for (let i = 0; i < coords.length - 1; i++) {
        const p0 = coords[Math.max(0, i - 1)];
        const p1 = coords[i];
        const p2 = coords[i + 1];
        const p3 = coords[Math.min(coords.length - 1, i + 2)];
        const cp1x = p1.x + (p2.x - p0.x) * tension;
        const cp1y = p1.y + (p2.y - p0.y) * tension;
        const cp2x = p2.x - (p3.x - p1.x) * tension;
        const cp2y = p2.y - (p3.y - p1.y) * tension;
        d += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
    }
    return d;
}
