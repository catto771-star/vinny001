// Branded products from Open Food Facts (openfoodfacts.org, data under the
// Open Database License). The search runs in the food-search edge function;
// this maps its results. Products the user picks are saved as their own foods.
const num = (v) => {
    const n = typeof v === 'string' ? Number(v.replace(',', '.')) : typeof v === 'number' ? v : NaN;
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 10) / 10 : null;
};
function firstBrand(brands) {
    const first = Array.isArray(brands) ? brands[0] : brands?.split(',')[0];
    return first?.trim() || null;
}
/** Maps a product to a food per 100 g, or null if it lacks a name or energy. */
export function offToFood(p, country) {
    const n = p.nutriments ?? {};
    const name = (country === 'BR' && p.product_name_pt) || p.product_name;
    let kcal = num(n['energy-kcal_100g']);
    if (kcal === null) {
        const kj = num(n['energy-kj_100g'] ?? n['energy_100g']);
        kcal = kj === null ? null : Math.round(kj / 4.184);
    }
    if (!p.code || !name || kcal === null)
        return null;
    const serving = num(p.serving_quantity);
    return {
        source: 'OFF', country, external_id: p.code, name: name.trim(), brand: firstBrand(p.brands),
        kcal: Math.round(kcal), protein_g: num(n.proteins_100g) ?? 0, carbs_g: num(n.carbohydrates_100g) ?? 0,
        fat_g: num(n.fat_100g) ?? 0, fiber_g: num(n.fiber_100g), default_serving_g: serving && serving > 0 ? serving : 100,
    };
}
/** Strips non-digits and validates an EAN/UPC/GTIN barcode (8–14 digits). */
export function sanitizeBarcode(raw) {
    const digits = raw.replace(/\D+/g, '');
    if (digits.length < 8 || digits.length > 14)
        return null;
    return digits;
}
/** Direct Open Food Facts v2 lookup URL for a sanitized barcode. */
export function lookupBarcodeUrl(barcode) {
    const fields = 'code,product_name,product_name_pt,brands,serving_quantity,nutriments';
    return `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${fields}`;
}
