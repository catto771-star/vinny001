// Proxies product searches to Open Food Facts' search service, which does not
// allow calls from other sites' pages. Only signed-in users can call it
// (verify_jwt). The browser maps the returned products with src/lib/off.ts.

const COUNTRIES: Record<string, string> = { BR: 'brazil', UK: 'united-kingdom', IE: 'ireland' };
const FIELDS = 'code,product_name,product_name_pt,brands,serving_quantity,nutriments';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

  const { q, barcode, country } = req.method === 'POST' ? await req.json().catch(() => ({})) : Object.fromEntries(new URL(req.url).searchParams);
  const code = String(barcode ?? '').replace(/\D+/g, '');
  if (code) {
    if (code.length < 8 || code.length > 14) return json({ error: 'barcode must have 8 to 14 digits' }, 400);
    const url = new URL(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`);
    url.searchParams.set('fields', FIELDS);
    const res = await fetch(url, { headers: { 'User-Agent': 'Painel/0.1 (personal nutrition diary)' } });
    if (res.status === 404) return json({ hits: [] });
    if (!res.ok) return json({ error: `Open Food Facts responded ${res.status}` }, 502);
    const data = await res.json();
    const product = data?.status === 1 && data?.product ? { ...data.product, code: data.product.code ?? code } : null;
    return json({ hits: product ? [product] : [] });
  }

  const term = String(q ?? '').trim();
  if (!term || term.length > 100) return json({ error: 'q must have 1 to 100 characters' }, 400);
  const tag = COUNTRIES[String(country)];
  if (!tag) return json({ error: 'country must be BR, UK or IE' }, 400);

  const url = new URL('https://search.openfoodfacts.org/search');
  url.searchParams.set('q', `${term.replace(/"/g, '')} countries_tags:"en:${tag}"`);
  url.searchParams.set('page_size', '20');
  url.searchParams.set('fields', FIELDS);
  const res = await fetch(url, { headers: { 'User-Agent': 'Painel/0.1 (personal nutrition diary)' } });
  if (!res.ok) return json({ error: `Open Food Facts responded ${res.status}` }, 502);
  const data = await res.json();
  return json({ hits: data.hits ?? [] });
});
