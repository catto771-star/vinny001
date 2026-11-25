// The accent colour: a few ready-made choices, kept on this device like the
// light/dark theme. The colours themselves live in index.css (one rule per
// accent and theme), so a screen only ever says "brand".
export type Accent = 'orange' | 'lime' | 'yellow' | 'purple' | 'red' | 'cyan' | 'blue' | 'green' | 'pink' | 'magenta' | 'teal';

export const ACCENTS: { key: Accent; label: string; /** The colour shown on the picker. */ swatch: string; /** The tick drawn over the swatch. */ tick: string }[] = [
  { key: 'orange', label: 'Laranja neon', swatch: '#ff5a00', tick: '#0c0c0d' },
  { key: 'lime', label: 'Verde-limão', swatch: '#9be800', tick: '#0c0c0d' },
  { key: 'yellow', label: 'Amarelo neon', swatch: '#ffe500', tick: '#0c0c0d' },
  { key: 'purple', label: 'Roxo neon', swatch: '#a43dff', tick: '#ffffff' },
  { key: 'red', label: 'Vermelho Ferrari', swatch: '#dc0000', tick: '#ffffff' },
  { key: 'cyan', label: 'Ciano neon', swatch: '#00e5ff', tick: '#0c0c0d' },
  { key: 'blue', label: 'Azul elétrico', swatch: '#2f5bff', tick: '#ffffff' },
  { key: 'green', label: 'Verde neon', swatch: '#00ff85', tick: '#0c0c0d' },
  { key: 'pink', label: 'Rosa neon', swatch: '#ff2d95', tick: '#0c0c0d' },
  { key: 'magenta', label: 'Magenta neon', swatch: '#ff00ff', tick: '#0c0c0d' },
  { key: 'teal', label: 'Turquesa neon', swatch: '#00ffd5', tick: '#0c0c0d' },
];

const KEY = 'painel.accent';

/** Orange is the default; a saved choice wins. */
export function resolveAccent(saved: string | null): Accent {
  return ACCENTS.find((a) => a.key === saved)?.key ?? 'orange';
}

export function readAccent(): Accent {
  try {
    return resolveAccent(localStorage.getItem(KEY));
  } catch {
    return 'orange';
  }
}

export function applyAccent(accent: Accent) {
  document.documentElement.dataset.accent = accent;
  try {
    localStorage.setItem(KEY, accent);
  } catch {
    /* storage unavailable: the choice lasts for this visit */
  }
  window.dispatchEvent(new CustomEvent('painel-accent', { detail: accent }));
}
