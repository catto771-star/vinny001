import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { setBankRates } from '../../lib/finance';
// Today's rates are fetched once per page load and shared.
let todayPromise = null;
async function fetchRates(date) {
    const { data, error } = await supabase.functions.invoke('fx', { body: date ? { date } : {} });
    if (error) {
        const body = await error.context?.json?.().catch(() => null);
        return { error: body?.error ?? 'serviço de cotação indisponível' };
    }
    return data;
}
/** Reais per dollar and per euro: today's (date null) or a past day's. */
export function useRates(date) {
    const [answer, setAnswer] = useState({});
    useEffect(() => {
        let live = true;
        setAnswer({});
        const p = date ? fetchRates(date) : (todayPromise ??= fetchRates(null).then((r) => { if (r.error)
            todayPromise = null; return r; }));
        void p.then((r) => {
            // Today's rates also value the accounts held in euros or dollars.
            if (!date && r.rates)
                setBankRates(r.rates);
            if (live)
                setAnswer(r);
        });
        return () => { live = false; };
    }, [date]);
    return answer;
}
