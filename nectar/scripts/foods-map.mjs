// Turns rows of the official food composition tables into rows of the foods
// table. Values are per 100 g of edible portion.

/** Parses one CSV document (RFC 4180 quoting) into arrays of strings. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => v !== ''));
}

/**
 * Reads a nutrient cell. 'Tr' (trace) counts as 0; empty, 'N' (not
 * determined) and other non-numbers become null.
 */
export function nutrient(value, decimals = 1) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (/^tr$/i.test(s)) return 0;
  const n = Number(s.replace(',', '.'));
  if (s === '' || !Number.isFinite(n)) return null;
  const f = 10 ** decimals;
  return Math.round(Math.max(0, n) * f) / f;
}

/** Lowercase text without accents, used to search food names. */
export function searchKey(text) {
  return String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** A row of TACO's taco_composicao.csv, as an object keyed by header. */
export function tacoFood(r) {
  const kcal = nutrient(r.energia_kcal, 0);
  if (kcal === null) return null;
  return {
    source: 'TACO', country: 'BR', external_id: String(r.numero_alimento), name: r.descricao.trim(),
    kcal, protein_g: nutrient(r.proteina_g) ?? 0, carbs_g: nutrient(r.carboidrato_g) ?? 0,
    fat_g: nutrient(r.lipideos_g) ?? 0, fiber_g: nutrient(r.fibra_g),
  };
}

/** A row of CoFID 2021's '1.3 Proximates' sheet, as an object keyed by header. */
export function cofidFood(r) {
  const kcal = nutrient(r['Energy (kcal) (kcal)'], 0);
  if (!r['Food Code'] || kcal === null) return null;
  return {
    source: 'CoFID', country: 'UK', external_id: String(r['Food Code']), name: String(r['Food Name']).trim(),
    kcal, protein_g: nutrient(r['Protein (g)']) ?? 0, carbs_g: nutrient(r['Carbohydrate (g)']) ?? 0,
    fat_g: nutrient(r['Fat (g)']) ?? 0, fiber_g: nutrient(r['AOAC fibre (g)']) ?? nutrient(r['NSP (g)']),
  };
}

/**
 * Makes external ids unique within each source. A source that reuses a code
 * for different foods (CoFID 2021 has 13-669 twice) keeps every food: the
 * repeats get '#2', '#3'...
 */
export function uniqueExternalIds(foods) {
  const seen = new Map();
  return foods.map((f) => {
    const key = `${f.source}|${f.external_id}`;
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    return n === 1 ? f : { ...f, external_id: `${f.external_id}#${n}` };
  });
}

const sqlText = (s) => (s === null || s === undefined ? 'null' : `'${String(s).replace(/'/g, "''")}'`);
const sqlNum = (n) => (n === null || n === undefined ? 'null' : String(n));

/** SQL that inserts built-in foods and skips ones already present. */
export function foodsInsertSql(foods, batch = 500) {
  const out = [];
  for (let i = 0; i < foods.length; i += batch) {
    const values = foods.slice(i, i + batch).map((f) =>
      `(null, ${sqlText(f.source)}, ${sqlText(f.country)}, ${sqlText(f.external_id)}, ${sqlText(f.name)}, ${sqlText(searchKey(f.name))}, ` +
      `${sqlNum(f.kcal)}, ${sqlNum(f.protein_g)}, ${sqlNum(f.carbs_g)}, ${sqlNum(f.fat_g)}, ${sqlNum(f.fiber_g)})`);
    out.push(
      'insert into public.foods (user_id, source, country, external_id, name, search_name, kcal, protein_g, carbs_g, fat_g, fiber_g) values\n' +
      values.join(',\n') +
      '\non conflict (source, external_id) where user_id is null do nothing;');
  }
  return out.join('\n\n') + '\n';
}
