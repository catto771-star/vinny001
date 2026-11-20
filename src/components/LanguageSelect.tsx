import { LOCALES, useI18n, type Locale } from "@/i18n";
import { supabase } from "@/lib/supabase";

/** Seletor de idioma no topo; a escolha fica guardada no cadastro do usuário (B51). */
export function LanguageSelect({ persist }: { persist: boolean }) {
  const { locale, setLocale, t } = useI18n();

  async function change(next: Locale) {
    setLocale(next);
    if (persist) await supabase.rpc("set_my_locale", { p_locale: next });
  }

  return (
    <label className="lang-select">
      <span className="sr-only">{t("nav.language")}</span>
      <select value={locale} onChange={(e) => void change(e.target.value as Locale)}>
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {t(`lang.${l}`)}
          </option>
        ))}
      </select>
    </label>
  );
}
