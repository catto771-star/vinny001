import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { errorKey } from "@/lib/errors";
import { formatCivilDate, formatDateTime } from "@/lib/time";
import { staffName } from "@/lib/types";
import { useStaffList } from "@/lib/useStaffList";
import { Notice } from "@/components/Notice";
import { Skeleton } from "@/components/Skeleton";
import { Tabs } from "@/components/Tabs";
import { useToast } from "@/components/Toast";

type Product = { id: string; name: string; unit: string };
type Line = { id: string; purchase_id: string; product_id: string; quantity: string; purchases: { supplier: string; purchased_on: string } | null };
type Movement = { id: string; kind: "allocation" | "transfer"; product_id: string; purchase_line_id: string | null; from_lodge_id: string | null; to_lodge_id: string; quantity: string; note: string | null; created_by: string; created_at: string };

/** Distribuição e transferências (s.8): alocação por Lodge; transferência não é nova despesa; sem preços. */
export function Distribution() {
  const { t, locale } = useI18n();
  const { lodges, canWriteLodge, post } = useAuth();
  const toast = useToast();
  const staffList = useStaffList();
  const [tab, setTab] = useState<"allocate" | "transfer" | "history">("allocate");
  const [products, setProducts] = useState<Product[]>([]);
  const [lines, setLines] = useState<Line[] | null>(null);
  const [moves, setMoves] = useState<Movement[]>([]);
  const [targets, setTargets] = useState<Record<string, { lodge: string; qty: string }>>({});
  const [tf, setTf] = useState({ product: "", from: lodges[0]?.id ?? "", to: lodges[1]?.id ?? "", qty: "", note: "" });
  const [error, setError] = useState<string | null>(null);
  const defaultLodge = post?.lodge_id ?? lodges.find((l) => canWriteLodge(l.id))?.id ?? lodges[0]?.id ?? "";

  const load = useCallback(async () => {
    const [{ data: p }, { data: l }, { data: m }] = await Promise.all([
      supabase.from("products").select("id, name, unit").order("name"),
      supabase.from("purchase_lines").select("id, purchase_id, product_id, quantity, purchases(supplier, purchased_on)").limit(200),
      supabase.from("product_movements").select("id, kind, product_id, purchase_line_id, from_lodge_id, to_lodge_id, quantity, note, created_by, created_at").order("created_at", { ascending: false }).limit(200),
    ]);
    setProducts((p ?? []) as Product[]);
    setLines((l ?? []) as unknown as Line[]);
    setMoves((m ?? []) as Movement[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? "—";
  const lodgeName = (id: string | null) => lodges.find((l) => l.id === id)?.short_name ?? "—";
  const allocatedOf = (lineId: string) => moves.filter((m) => m.purchase_line_id === lineId).reduce((s, m) => s + Number(m.quantity), 0);

  async function allocate(line: Line) {
    const target = targets[line.id] ?? { lodge: defaultLodge, qty: "" };
    const { error: e } = await supabase.rpc("allocate_purchase_line", { p_line: line.id, p_lodge: target.lodge || defaultLodge, p_quantity: Number(target.qty.replace(",", ".")) });
    if (e) return toast.error(t(errorKey(e)));
    toast.success(t("distribution.saved"));
    setTargets((x) => ({ ...x, [line.id]: { lodge: target.lodge, qty: "" } }));
    await load();
  }

  async function transfer() {
    setError(null);
    const { error: e } = await supabase.rpc("transfer_product", { p_product: tf.product, p_from: tf.from, p_to: tf.to, p_quantity: Number(tf.qty.replace(",", ".")), p_note: tf.note });
    if (e) return setError(t(errorKey(e)));
    toast.success(t("distribution.saved"));
    setTf({ ...tf, qty: "", note: "" });
    await load();
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <span className="eyebrow">{t("distribution.eyebrow")}</span>
          <h1>{t("distribution.title")}</h1>
        </div>
        <Tabs
          label={t("distribution.title")}
          value={tab}
          onChange={(v) => setTab(v as typeof tab)}
          items={[
            { value: "allocate", label: t("distribution.allocateTab") },
            { value: "transfer", label: t("distribution.transferTab") },
            { value: "history", label: t("distribution.historyTab") },
          ]}
        />
      </header>

      {lines === null ? (
        <div className="card"><Skeleton rows={5} label={t("app.loading")} /></div>
      ) : tab === "allocate" ? (
        <ul className="task-list">
          {lines.filter((l) => allocatedOf(l.id) < Number(l.quantity)).map((l) => {
            const remaining = Number(l.quantity) - allocatedOf(l.id);
            const target = targets[l.id] ?? { lodge: defaultLodge, qty: "" };
            return (
              <li key={l.id} className="task-item">
                <span className="task-check" aria-hidden="true" />
                <div className="task-main">
                  <span className="task-title">{productName(l.product_id)}</span>
                  <span className="task-meta">
                    {l.purchases && `${l.purchases.supplier} · ${formatCivilDate(l.purchases.purchased_on, locale)} · `}
                    {Number(l.quantity)} {t("distribution.purchased")} · <strong>{t("distribution.remaining", { n: remaining })}</strong>
                  </span>
                </div>
                <div className="task-actions alloc-actions">
                  <select aria-label={t("distribution.to")} value={target.lodge} onChange={(e) => setTargets((x) => ({ ...x, [l.id]: { ...target, lodge: e.target.value } }))}>
                    {lodges.filter((x) => canWriteLodge(x.id)).map((x) => <option key={x.id} value={x.id}>{x.short_name}</option>)}
                  </select>
                  <input aria-label={t("purchases.quantity")} inputMode="decimal" placeholder={String(remaining)} value={target.qty} onChange={(e) => setTargets((x) => ({ ...x, [l.id]: { ...target, qty: e.target.value } }))} />
                  <button className="small primary" disabled={!target.qty} onClick={() => void allocate(l)}>{t("distribution.allocate")}</button>
                </div>
              </li>
            );
          })}
          {lines.every((l) => allocatedOf(l.id) >= Number(l.quantity)) && <li className="task-item"><span /><span className="muted">{t("distribution.empty")}</span></li>}
        </ul>
      ) : tab === "transfer" ? (
        <div className="card form" style={{ maxWidth: 560 }}>
          <label>
            {t("purchases.product")}
            <select value={tf.product} onChange={(e) => setTf({ ...tf, product: e.target.value })}>
              <option value="" />
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <div className="form-grid">
            <label>{t("distribution.from")}<select value={tf.from} onChange={(e) => setTf({ ...tf, from: e.target.value })}>{lodges.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
            <label>{t("distribution.to")}<select value={tf.to} onChange={(e) => setTf({ ...tf, to: e.target.value })}>{lodges.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
            <label>{t("purchases.quantity")}<input inputMode="decimal" value={tf.qty} onChange={(e) => setTf({ ...tf, qty: e.target.value })} /></label>
          </div>
          <label>{t("distribution.note")} <small>({t("app.optional")})</small><input value={tf.note} onChange={(e) => setTf({ ...tf, note: e.target.value })} /></label>
          <p className="hint">{t("distribution.transferHint")}</p>
          <Notice kind="error">{error}</Notice>
          <button className="primary" disabled={!tf.product || !tf.qty || tf.from === tf.to} onClick={() => void transfer()}>{t("distribution.transfer")}</button>
        </div>
      ) : (
        <table className="table table-cards">
          <tbody>
            {moves.map((m) => (
              <tr key={m.id}>
                <td className="cell-main">{productName(m.product_id)} · {Number(m.quantity)}</td>
                <td><span className="tag tag-kind">{m.kind === "allocation" ? t("distribution.allocation") : t("distribution.transferKind")}</span></td>
                <td>{m.from_lodge_id ? `${lodgeName(m.from_lodge_id)} → ` : "→ "}{lodgeName(m.to_lodge_id)}</td>
                <td className="nowrap">{formatDateTime(m.created_at, locale)} · {staffName(staffList.find((s) => s.id === m.created_by))}</td>
                <td>{m.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
