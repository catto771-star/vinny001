export type Theme = 'dark' | 'light';

const KEY = 'painel.theme';

/** Dark is the default; a saved choice wins. */
export function resolveTheme(saved: string | null): Theme {
  return saved === 'light' || saved === 'dark' ? saved : 'dark';
}

export function readTheme(): Theme {
  try {
    return resolveTheme(localStorage.getItem(KEY));
  } catch {
    return 'dark';
  }
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.classList.toggle('light', theme === 'light');
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* storage unavailable: the choice lasts for this visit */
  }
  // Other parts of the screen showing the theme (the sidebar button) follow along.
  window.dispatchEvent(new CustomEvent('painel-theme', { detail: theme }));
}
