import { useAuth } from "@/auth/AuthProvider";
import { useI18n } from "@/i18n";
import { Tabs } from "./Tabs";

export function LodgeTabs({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { lodges } = useAuth();
  const { t } = useI18n();
  return <Tabs label={t("residents.lodge")} value={value} onChange={onChange} items={lodges.map((l) => ({ value: l.id, label: l.name }))} />;
}

/** Lodge inicial: o do posto do usuário, ou o primeiro. */
export function useDefaultLodge(): string {
  const { post, lodges, staff } = useAuth();
  return post?.lodge_id ?? staff?.home_lodge_id ?? lodges[0]?.id ?? "";
}
