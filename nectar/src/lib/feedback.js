// Small confirmations after saving ("Salvo") and errors that used to be alerts.
// A burst of saves (ticking several habits) shows one toast, refreshed in place.
const MERGE_MS = 2000;
let seq = 0;
/** The toast to show after an event, reusing the current "Salvo" when saves come close together. */
export function nextToast(current, ev, now) {
    if (current && ev.kind === 'ok' && current.kind === 'ok' && current.text === ev.text && now - current.at < MERGE_MS) {
        return { ...current, at: now };
    }
    return { id: ++seq, kind: ev.kind, text: ev.text, at: now };
}
/** How long a toast stays: errors need time to be read. */
export function toastDuration(kind) {
    return kind === 'error' ? 5000 : 1600;
}
const listeners = new Set();
export function onFeedback(fn) {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
}
export function feedback(ev) {
    listeners.forEach((fn) => fn(ev));
}
