import { useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useI18n } from "@/i18n";
import { applyTheme, currentTheme, type ThemeMode } from "@/lib/theme";

/** Botão de modo claro/escuro (computador e celular). */
export function ThemeToggle({ withLabel = false }: { withLabel?: boolean }) {
  const { t } = useI18n();
  const [mode, setMode] = useState<ThemeMode>(currentTheme);
  const next: ThemeMode = mode === "dark" ? "light" : "dark";
  const label = next === "dark" ? t("theme.toDark") : t("theme.toLight");
  return (
    <button type="button" className={withLabel ? "link-button" : "theme-toggle"} aria-label={label} title={label}
      onClick={() => { applyTheme(next, true); setMode(next); }}>
      {mode === "dark" ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
      {withLabel && <span> {label}</span>}
    </button>
  );
}
