import type { MessageKey, Vars } from "@/i18n";

type T = (key: MessageKey, vars?: Vars) => string;

/** "Quarto 4" / "Apartamento 2" no idioma do usuário. */
export function roomLabel(t: T, kind: "room" | "apartment", code: string): string {
  return kind === "apartment" ? t("beds.apartment", { code }) : t("beds.room", { code });
}

/** Rótulo curto para listas: "Q4·2" / "Apt.2·1" — o quarto sempre em destaque. */
export function bedShort(kind: "room" | "apartment", code: string, bed: number, aptLabel: string): string {
  return `${kind === "apartment" ? `${aptLabel}${code}` : code}·${bed}`;
}
