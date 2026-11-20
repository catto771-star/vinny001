import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import enIE, { type Messages } from "./en-IE";
import ptPT from "./pt-PT";
import plPL from "./pl-PL";

export const LOCALES = ["pt-PT", "en-IE", "pl-PL"] as const;
export type Locale = (typeof LOCALES)[number];
export const FALLBACK_LOCALE: Locale = "en-IE";

export const catalogues: Record<Locale, Messages> = { "pt-PT": ptPT, "en-IE": enIE, "pl-PL": plPL };

type Paths<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : Paths<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

export type MessageKey = Paths<Messages>;
export type Vars = Record<string, string | number>;

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

function lookup(messages: unknown, key: string): string | undefined {
  let node: unknown = messages;
  for (const part of key.split(".")) {
    if (node && typeof node === "object" && part in node) node = (node as Record<string, unknown>)[part];
    else return undefined;
  }
  return typeof node === "string" ? node : undefined;
}

export function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}

/** Traduz; se faltar a chave no idioma, usa o inglês da Irlanda (B53, produção). */
export function translate(locale: Locale, key: MessageKey | string, vars?: Vars): string {
  const text = lookup(catalogues[locale], key) ?? lookup(catalogues[FALLBACK_LOCALE], key) ?? key;
  return interpolate(text, vars);
}

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, vars?: Vars) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

const STORAGE_KEY = "dslodge.locale";

export function initialLocale(): Locale {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isLocale(stored)) return stored;
  } catch {
    /* armazenamento indisponível */
  }
  return FALLBACK_LOCALE;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    document.documentElement.lang = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* armazenamento indisponível */
    }
  }, []);

  const value = useMemo<I18nContextValue>(
    () => ({ locale, setLocale, t: (key, vars) => translate(locale, key, vars) }),
    [locale, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}
