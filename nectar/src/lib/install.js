// The browser's invitation to install the app (Chrome, Edge, Samsung Internet
// on Android and desktop). It fires once, early, so it is caught here at start
// and kept until the user asks to install.
import { useEffect, useState } from 'react';
let pending = null;
const listeners = new Set();
const notify = () => listeners.forEach((l) => l());
if (typeof window !== 'undefined') {
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); pending = e; notify(); });
    window.addEventListener('appinstalled', () => { pending = null; notify(); });
}
export const isStandalone = () => typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true);
export function useInstall() {
    const [, tick] = useState(0);
    useEffect(() => { const l = () => tick((n) => n + 1); listeners.add(l); return () => { listeners.delete(l); }; }, []);
    return {
        installed: isStandalone(),
        canPrompt: !!pending,
        async install() {
            if (!pending)
                return false;
            const e = pending;
            await e.prompt();
            const { outcome } = await e.userChoice;
            if (outcome === 'accepted')
                pending = null;
            notify();
            return outcome === 'accepted';
        },
    };
}
