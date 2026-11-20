import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useI18n } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { errorKey } from "@/lib/errors";
import { formatEUR, lineTotal } from "@/lib/management";
import { formatCivilDate, operationalDay } from "@/lib/time";
import { Dialog, DialogCancel } from "@/components/Dialog";
import { Notice } from "@/components/Notice";
import { Skeleton } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";

type Product = { id: string; name: string; unit: string };
type Purchase = { id: string; supplier: string; purchased_on: string; created_at: string };
type Priced = { line_id: string; product_name: string; quantity: string; unit_price: string; line_total: string; purchase_total: string; document_ref: string | null };
type Line = { productId: string; newName: string; quantity: string; unitPrice: string };

const num = (s: string) => Number(s.replace(",", "."));

/** Compras (s.8): preços e documentos só para Manager/Owner/Developer; sem estoque nem pagamento. */
export function Purchases() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [purchases, setPurchases] = useState<Purchase[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [priced, setPriced] = useState<Record<string, Priced[]>>({});
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("purchases").select("id, supplier, purchased_on, created_at").order("purchased_on", { ascending: false }).limit(100);
    setPurchases((data ?? []) as Purchase[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function expand(id: string) {
    setOpen((o) => (o === id ? null : id));
    if (priced[id]) return;
    const { data } = await supabase.rpc("purchase_prices", { p_purchase: id });
    setPriced((p) => ({ ...p, [id]: (data ?? []) as Priced[] }));
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <span className="eyebrow">{t("purchases.eyebrow")}</span>
          <h1>{t("purchases.title")}</h1>
        </div>
        <button className="primary" onClick={() => setAdding(true)}>{t("purchases.new")}</button>
      </header>
      {purchases === null ? (
        <div className="card"><Skeleton rows={5} label={t("app.loading")} /></div>
      ) : purchases.length === 0 ? (
        <div className="card empty-state"><p className="muted">{t("purchases.empty")}</p></div>
      ) : (
        <ul className="ticket-list">
          {purchases.map((p) => (
            <li key={p.id}>
              <button type="button" className="ticket" onClick={() => void expand(p.id)} aria-expanded={open === p.id}>
                <span className="ticket-prio">{formatCivilDate(p.purchased_on, locale)}</span>
                <span className="ticket-main"><strong>{p.supplier}</strong>{priced[p.id] && <span className="muted">{t("purchases.lines", { n: priced[p.id].length })}</span>}</span>
                <span className="ticket-side">{priced[p.id]?.[0] && <strong>{formatEUR(priced[p.id][0].purchase_total, locale)}</strong>}</span>
              </button>
              {open === p.id && priced[p.id] && (
                <table className="table table-cards nested">
                  <tbody>
                    {priced[p.id].map((l) => (
                      <tr key={l.line_id}>
                        <td className="cell-main">{l.product_name}</td>
                        <td>{Number(l.quantity)} × {formatEUR(l.unit_price, locale)}</td>
                        <td><strong>{formatEUR(l.line_total, locale)}</strong></td>
                      </tr>
                    ))}
                    {priced[p.id][0]?.document_ref && (
                      <tr><td colSpan={3} className="muted">{t("purchases.document")}: {priced[p.id][0].document_ref}</td></tr>
                    )}
                  </tbody>
                </table>
              )}
            </li>
          ))}
        </ul>
      )}
      {adding && (
        <PurchaseDialog
          onClose={() => setAdding(false)}
          onDone={() => {
            setAdding(false);
            toast.success(t("purchases.saved"));
            setPriced({});
            void load();
          }}
        />
      )}
    </section>
  );
}

function PurchaseDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { t, locale } = useI18n();
  const [products, setProducts] = useState<Product[]>([]);
  const [supplier, setSupplier] = useState("");
  const [date, setDate] = useState(operationalDay(new Date()));
  const [doc, setDoc] = useState("");
  const [lines, setLines] = useState<Line[]>([{ productId: "", newName: "", quantity: "", unitPrice: "" }]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void supabase.from("products").select("id, name, unit").eq("active", true).order("name").then(({ data }) => setProducts((data ?? []) as Product[]));
  }, []);

  const valid = supplier.trim() && lines.every((l) => (l.productId || l.newName.trim()) && num(l.quantity) > 0 && num(l.unitPrice) >= 0 && l.unitPrice !== "");
  const total = lines.reduce((s, l) => s + (num(l.quantity) > 0 && l.unitPrice ? lineTotal(num(l.quantity), num(l.unitPrice)) : 0), 0);
  const set = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const payload = [];
    for (const l of lines) {
      let id = l.productId;
      if (!id) {
        const { data, error: err } = await supabase.rpc("upsert_product", { p_id: null, p_name: l.newName, p_unit: "un", p_category: null });
        if (err) {
          setBusy(false);
          return setError(t(errorKey(err)));
        }
        id = data as string;
      }
      payload.push({ product_id: id, quantity: num(l.quantity), unit_price: num(l.unitPrice) });
    }
    const { error: err } = await supabase.rpc("create_purchase", { p_supplier: supplier, p_on: date, p_document: doc, p_lines: payload });
    setBusy(false);
    if (err) return setError(t(errorKey(err)));
    onDone();
  }

  return (
    <Dialog
      wide
      title={t("purchases.new")}
      onClose={onClose}
      footer={
        <>
          <span className="progress-text" style={{ marginRight: "auto" }}>{t("purchases.total")}: {formatEUR(total, locale)}</span>
          <DialogCancel>{t("app.cancel")}</DialogCancel>
          <button type="submit" form="purchase-form" className="primary" disabled={!valid || busy}>{t("app.save")}</button>
        </>
      }
    >
      <form id="purchase-form" className="form" onSubmit={submit}>
        <div className="form-grid">
          <label>{t("purchases.supplier")}<input required value={supplier} onChange={(e) => setSupplier(e.target.value)} autoFocus /></label>
          <label>{t("purchases.date")}<input type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label>{t("purchases.document")} <small>({t("app.optional")})</small><input value={doc} onChange={(e) => setDoc(e.target.value)} /></label>
        </div>
        {lines.map((l, i) => (
          <div key={i} className="line-row">
            <label>
              {t("purchases.product")}
              <select value={l.productId} onChange={(e) => set(i, { productId: e.target.value })}>
                <option value="">{t("purchases.newProduct")}…</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              {!l.productId && <input placeholder={t("purchases.newProduct")} value={l.newName} onChange={(e) => set(i, { newName: e.target.value })} />}
            </label>
            <label>{t("purchases.quantity")}<input inputMode="decimal" value={l.quantity} onChange={(e) => set(i, { quantity: e.target.value })} /></label>
            <label>{t("purchases.unitPrice")}<input inputMode="decimal" value={l.unitPrice} onChange={(e) => set(i, { unitPrice: e.target.value })} /></label>
            <span className="line-total">
              <small className="muted">{t("purchases.lineTotal")}</small>
              <strong>{num(l.quantity) > 0 && l.unitPrice ? formatEUR(lineTotal(num(l.quantity), num(l.unitPrice)), locale) : "—"}</strong>
            </span>
          </div>
        ))}
        <button type="button" className="ghost" onClick={() => setLines((ls) => [...ls, { productId: "", newName: "", quantity: "", unitPrice: "" }])}>
          + {t("purchases.addLine")}
        </button>
        <p className="hint">{t("purchases.roundingHint")}</p>
        <Notice kind="error">{error}</Notice>
      </form>
    </Dialog>
  );
}
