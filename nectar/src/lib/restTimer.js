// Training rest timer helpers (pure formatting/countdown + safe audio chime).
export const REST_PRESETS = [60, 90, 120, 180];
/** Formats seconds as MM:SS, clamping negative values at 00:00. */
export function formatRestClock(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds));
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
/** Remaining whole seconds until `endsAtMs`, rounded up so 0.1s still reads 00:01. */
export function remainingSeconds(endsAtMs, nowMs) {
    return Math.max(0, Math.ceil((endsAtMs - nowMs) / 1000));
}
/** Clamps a rest adjustment (e.g. +15s / -15s) to [0, 3600]. */
export function clampRestSeconds(seconds) {
    return Math.min(3600, Math.max(0, Math.round(seconds)));
}
/** Plays a soft two-tone chime via Web Audio API and gently vibrates when supported. */
export function playRestDoneChime() {
    try {
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
            navigator.vibrate([160, 80, 160]);
        }
    }
    catch { /* ignore vibration restrictions */ }
    try {
        if (typeof window === 'undefined')
            return;
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx)
            return;
        const ctx = new AudioCtx();
        const now = ctx.currentTime;
        const notes = [660, 880];
        notes.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + i * 0.18);
            gain.gain.setValueAtTime(0.001, now + i * 0.18);
            gain.gain.exponentialRampToValueAtTime(0.14, now + i * 0.18 + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.18 + 0.25);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now + i * 0.18);
            osc.stop(now + i * 0.18 + 0.26);
        });
        window.setTimeout(() => { void ctx.close().catch(() => { }); }, 700);
    }
    catch { /* ignore autoplay/audio context errors */ }
}
