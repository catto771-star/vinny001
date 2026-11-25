import { supabase } from './supabase';
/**
 * Asks the server to sync with Google Agenda now, when the user is connected,
 * so a change made here shows there without waiting for the 5-minute cycle.
 * Quiet when not connected or offline.
 */
export async function syncGoogleNow() {
    const { data } = await supabase.from('google_accounts').select('user_id').maybeSingle();
    if (!data)
        return false;
    const { error } = await supabase.functions.invoke('gcal', { body: { action: 'sync' } });
    return !error;
}
