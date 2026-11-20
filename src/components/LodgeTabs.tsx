import { useAuth } from "@/auth/AuthProvider";

export function LodgeTabs({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { lodges } = useAuth();
  return (
    <div className="tabs" role="tablist">
      {lodges.map((l) => (
        <button key={l.id} role="tab" aria-selected={l.id === value} className={l.id === value ? "tab selected" : "tab"} onClick={() => onChange(l.id)}>
          {l.name}
        </button>
      ))}
    </div>
  );
}

/** Lodge inicial: o do posto do usuário, ou o primeiro. */
export function useDefaultLodge(): string {
  const { post, lodges, staff } = useAuth();
  return post?.lodge_id ?? staff?.home_lodge_id ?? lodges[0]?.id ?? "";
}
