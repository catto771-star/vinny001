import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { setBankRates } from '../../lib/finance';

export interface RatesAnswer { date?: string; rates?: { USD: number; EUR: number }; source?: string; at?: string; error?: string }

// Today's rates are fetched once per page load and shared.
let todayPromise: Promise<RatesAnswer> | null = null;

async function fetchRates(date: string | null): Promise<RatesAnswer> {
  const { data, error } = await supabase.functions.invoke('fx', { body: date ? { date } : {} });
  if (error) {
    const body = await (error as { context?: Response }).context?.json?.().catch(() => null);
    return { error: body?.error ?? 'serviço de cotação indisponível' };
  }
  return data as RatesAnswer;
}

/** Reais per dollar and per euro: today's (date null) or a past day's. */
export function useRates(date: string | null) {
  const [answer, setAnswer] = useState<RatesAnswer>({});
  useEffect(() => {
    let live = true;
    setAnswer({});
    const p = date ? fetchRates(date) : (todayPromise ??= fetchRates(null).then((r) => { if (r.error) todayPromise = null; return r; }));
    void p.then((r) => {
      // Today's rates also value the accounts held in euros or dollars.
      if (!date && r.rates) setBankRates(r.rates);
      if (live) setAnswer(r);
    });
    return () => { live = false; };
  }, [date]);
  return answer;
}
