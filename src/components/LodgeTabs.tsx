import { useAuth } from "@/auth/AuthProvider";
import { useI18n } from "@/i18n";
import type { Lodge } from "@/lib/types";
import { Tabs } from "./Tabs";

/** Abas de Lodge. `only` limita aos Lodges que têm o serviço (ex.: cozinha, lavanderia). */
export function LodgeTabs({ value, onChange, only }: { value: string; onChange: (id: string) => void; only?: (l: Lodge) => boolean }) {
  const { lodges } = useAuth();
  const { t } = useI18n();
  const list = only ? lodges.filter(only) : lodges;
  if (list.length === 1) return <span className="chip">{list[0].name}</span>;
  return <Tabs label={t("residents.lodge")} value={value} onChange={onChange} items={list.map((l) => ({ value: l.id, label: l.name }))} />;
}

/** Lodge inicial: o do posto do usuário, ou o primeiro (dentre os que têm o serviço). */
export function useDefaultLodge(only?: (l: Lodge) => boolean): string {
  const { post, lodges, staff } = useAuth();
  const list = only ? lodges.filter(only) : lodges;
  const preferred = post?.lodge_id ?? staff?.home_lodge_id;
  return list.find((l) => l.id === preferred)?.id ?? list[0]?.id ?? "";
}
