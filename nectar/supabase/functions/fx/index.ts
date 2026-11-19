// Exchange rates for the app: reais per US dollar and per euro, from the
// Banco Central do Brasil (PTAX, selling rate). Today: the latest bulletin of
// the day (10h, 11h, 12h, 13h, close). A past day: that day's last bulletin,
// cached in fx_rates. Weekends and holidays use the business day before.
// Backup: the European Central Bank (Frankfurter). Called by signed-in users.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { addDays, bcbUrl, parseBcb, parseFrankfurter, type Rates } from './lib.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function bcbDay(currency: 'USD' | 'EUR', date: string) {
  return parseBcb(await fetch(bcbUrl(currency, date)).then((r) => (r.ok ? r.json() : null)).catch(() => null));
}

/** Both rates from the first day, going back from `date`, that has quotes. */
async function bcbRates(date: string) {
  for (let back = 0; back <= 7; back++) {
    const day = addDays(date, -back);
    const [usd, eur] = await Promise.all([bcbDay('USD', day), bcbDay('EUR', day)]);
    if (usd && eur) return { date: day, rates: { USD: usd.rate, EUR: eur.rate } as Rates, at: usd.at, bulletin: usd.bulletin };
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
  const body = await req.json().catch(() => ({}));
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const asked = typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date) && body.date < today ? body.date : null;
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  if (asked) {
    const { data: cached } = await db.from('fx_rates').select('currency,rate,rate_date,source').eq('date', asked);
    if (cached && cached.length === 2) {
      const rates = Object.fromEntries(cached.map((c) => [c.currency, Number(c.rate)])) as Rates;
      return json({ date: cached[0].rate_date, rates, source: cached[0].source });
    }
  }

  const bcb = await bcbRates(asked ?? today);
  const found = bcb
    ? { date: bcb.date, rates: bcb.rates, source: 'Banco Central do Brasil (PTAX)', at: bcb.at, bulletin: bcb.bulletin }
    : await fetch(`https://api.frankfurter.dev/v1/${asked ?? 'latest'}?base=EUR&symbols=BRL,USD`).then((r) => r.json()).then(parseFrankfurter).catch(() => null)
      .then((f) => (f ? { date: f.date, rates: f.rates, source: 'Banco Central Europeu', at: undefined, bulletin: undefined } : null));
  if (!found) return json({ error: 'Não foi possível obter a cotação agora.' }, 502);

  // A past day's rate does not change: keep it.
  if (asked) {
    await db.from('fx_rates').upsert([
      { date: asked, currency: 'USD', rate: found.rates.USD, source: found.source, rate_date: found.date },
      { date: asked, currency: 'EUR', rate: found.rates.EUR, source: found.source, rate_date: found.date },
    ], { onConflict: 'date,currency' });
  }
  return json(found);
});
