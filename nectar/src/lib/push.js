// Browser push and installing the app. The public VAPID key is not a secret:
// browsers use it to know the server allowed to send to this app.
export const VAPID_PUBLIC_KEY = 'BA_WuNqav91odWha8UJdwFLWYwlDgKkv5AD5xrF0elvWIDo_-sdCPqSIrF--oRPYvDjoCRioaQGA-zWpXENCyiY';
export function b64urlToBytes(text) {
    const b = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4));
    return Uint8Array.from(b, (c) => c.charCodeAt(0));
}
/** "Android · Chrome", "iPhone · Safari", "Windows · Edge"…: a name to tell devices apart. */
export function deviceName(ua) {
    const os = /Android/.test(ua) ? 'Android' : /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad'
        : /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Aparelho';
    const browser = /Edg\//.test(ua) ? 'Edge' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Firefox\//.test(ua) ? 'Firefox'
        : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'navegador';
    return `${os} · ${browser}`;
}
/**
 * Whether this browser can get push: iPhone and iPad only from the app
 * installed on the home screen (iOS 16.4+); elsewhere it needs a service
 * worker and the Push API.
 */
export function pushSupport(env) {
    const ios = /iPhone|iPad/.test(env.ua);
    if (ios && !env.standalone)
        return 'ios-install';
    return env.hasPush && env.hasSW ? 'ok' : 'unsupported';
}
export const ADVANCE_OPTIONS = [0, 5, 10, 15, 30, 60, 120];
/** "na hora", "5 min antes", "1 h antes", "2 h antes". */
export function advanceLabel(min) {
    if (!min)
        return 'Na hora';
    return min >= 60 ? `${min / 60} h antes` : `${min} min antes`;
}
