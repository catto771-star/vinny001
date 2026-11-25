export const ACCENTS = [
    { key: 'orange', label: 'Laranja neon', swatch: '#ff5a00', tick: '#0c0c0d' },
    { key: 'lime', label: 'Verde-limão', swatch: '#9be800', tick: '#0c0c0d' },
    { key: 'yellow', label: 'Amarelo neon', swatch: '#ffe500', tick: '#0c0c0d' },
    { key: 'purple', label: 'Roxo neon', swatch: '#a43dff', tick: '#ffffff' },
    { key: 'red', label: 'Vermelho Ferrari', swatch: '#dc0000', tick: '#ffffff' },
];
const KEY = 'painel.accent';
/** Orange is the default; a saved choice wins. */
export function resolveAccent(saved) {
    return ACCENTS.find((a) => a.key === saved)?.key ?? 'orange';
}
export function readAccent() {
    try {
        return resolveAccent(localStorage.getItem(KEY));
    }
    catch {
        return 'orange';
    }
}
export function applyAccent(accent) {
    document.documentElement.dataset.accent = accent;
    try {
        localStorage.setItem(KEY, accent);
    }
    catch {
        /* storage unavailable: the choice lasts for this visit */
    }
    window.dispatchEvent(new CustomEvent('painel-accent', { detail: accent }));
}
