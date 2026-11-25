/** Modo claro/escuro (revisão 6). Padrão: escuro no celular e no app instalado; claro no computador. A escolha fica guardada. */
export type ThemeMode = "light" | "dark";
const KEY = "ui.theme";

export function defaultTheme(width: number, standalone: boolean): ThemeMode {
  return standalone || width < 720 ? "dark" : "light";
}

export function initialTheme(): ThemeMode {
  try {
    const v = window.localStorage.getItem(KEY);
    if (v === "light" || v === "dark") return v;
  } catch {
    /* armazenamento indisponível */
  }
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches ?? false;
  return defaultTheme(window.innerWidth, standalone);
}

export function applyTheme(mode: ThemeMode, remember = false): void {
  document.documentElement.dataset.theme = mode;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", mode === "dark" ? "#000000" : "#ffffff");
  if (remember) {
    try {
      window.localStorage.setItem(KEY, mode);
    } catch {
      /* armazenamento indisponível */
    }
  }
}

export function currentTheme(): ThemeMode {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}
