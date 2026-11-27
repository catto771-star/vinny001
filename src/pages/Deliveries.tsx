import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { errorKey } from "@/lib/errors";
import { expiresSoon, parseTemperature } from "@/lib/services";
import { formatCivilDate, formatDateTime, operationalDay } from "@/lib/time";
import { staffName } from "@/lib/types";
import { useLatestRequest } from "@/lib/useLatestRequest";
import { useStaffList } from "@/lib/useStaffList";
import { Dialog, DialogCancel } from "@/components/Dialog";
import { LodgeTabs } from "@/components/LodgeTabs";
import { useLodgeState } from "@/lib/activeLodge";
import { Notice } from "@/components/Notice";
import { Skeleton } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";

type Delivery = { id: string; product: string; supplier: string; supplier_id: string | null; order_id: string | null; batch: string | null; expiry_date: string | null; temperature: string | null; note: string | null; received_by: string; received_at: string };
export type Supplier = { id: string; name: string; active: boolean; require_batch: boolean; require_best_before: boolean; require_temperature: boolean; links_order: boolean; sort_order: number };
export const SUPPLIER_COLUMNS = "id, name, active, require_batch, require_best_before, require_temperature, links_order, sort_order";
/** Fornecedores ativos (para escolher) ou todos (cadastro). */
export function useSuppliers(onlyActive = true) {
  const [list, setList] = useState<Supplier[] | null>(null);
  const reload = useCallback(async () => {
    let q = supabase.from("suppliers").select(SUPPLIER_COLUMNS).order("sort_order");
    if (onlyActive) q = q.eq("active", true);
    const { data } = await q;
    setList((data ?? []) as Supplier[]);
  }, [onlyActive]);
  useEffect(() => { void reload(); }, [reload]);
  return { suppliers: list, reload };
}
const kitchen = (l: { has_dinner: boolean }) => l.has_dinner;

/** Food Delivery (s.8): produto, fornecedor, lote, validade e temperatura obrigatórios; sem alerta. */
export function Deliveries() {
  const { t, locale } = useI18n();
  const { canWriteLodge, serverOffsetMs } = useAuth();
  const toast = useToast();
  const staffList = useStaffList();
  const [lodgeId, setLodgeId] = useLodgeState(kitchen);
  const [rows, setRows] = useState<Delivery[] | null>(null);
  const [adding, setAdding] = useState(false);
  const { suppliers: allSuppliers } = useSuppliers(false);
  const linksOrder = (d: Delivery) => !!allSuppliers?.find((s) => s.id === d.supplier_id)?.links_order;
  const [alertDays, setAlertDays] = useState(2);
  const begin = useLatestRequest();
  const today = operationalDay(new Date(Date.now() + serverOffsetMs));

  const load = useCallback(async () => {
    if (!lodgeId) return setRows([]);
    const isLatest = begin();
    setRows(null);
    const { data } = await supabase.from("food_deliveries").select("id, product, supplier, supplier_id, order_id, batch, expiry_date, temperature, note, received_by, received_at").eq("lodge_id", lodgeId).order("received_at", { ascending: false }).limit(100);
    if (!isLatest()) return;
    setRows((data ?? []) as Delivery[]);
  }, [lodgeId, begin]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from("parameters").select("value").eq("key", "delivery.expiry_alert_days").is("lodge_id", null).order("valid_from", { ascending: false }).limit(1);
      const v = Number(Array.isArray(data) ? (data[0] as { value?: unknown } | undefined)?.value : NaN);
      if (Number.isFinite(v) && v >= 0) setAlertDays(v);
    })();
  }, []);

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <span className="eyebrow">{t("deliveries.eyebrow")}</span>
          <h1>{t("deliveries.title")}</h1>
        </div>
        <LodgeTabs value={lodgeId} onChange={setLodgeId} only={kitchen} />
      </header>
      {!lodgeId && <Notice kind="info">{t("deliveries.onlyKitchen")}</Notice>}
      {lodgeId && canWriteLodge(lodgeId) && (
        <div className="toolbar">
          <button className="primary" onClick={() => setAdding(true)}>{t("deliveries.new")}</button>
          <span className="hint">{t("deliveries.tempHint")}</span>
        </div>
      )}
      {rows === null ? (
        <div className="card"><Skeleton rows={5} label={t("app.loading")} /></div>
      ) : rows.length === 0 ? (
        <div className="card empty-state"><p className="muted">{t("deliveries.empty")}</p></div>
      ) : (
        <table className="table table-cards">
          <thead>
            <tr>
              <th>{t("deliveries.product")}</th>
              <th>{t("deliveries.supplier")}</th>
              <th>{t("deliveries.batch")}</th>
              <th>{t("deliveries.expiry")}</th>
              <th>°C</th>
              <th>{t("audit.who")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id}>
                <td className="cell-main">{d.product}</td>
                <td>{d.supplier}{linksOrder(d) && <span className={`tag${d.order_id ? "" : " tag-warn"}`}>{d.order_id ? t("deliveries.linked") : t("deliveries.awaitingLink")}</span>}</td>
                <td>{d.batch ?? "—"}</td>
                <td>
                  {d.expiry_date ? formatCivilDate(d.expiry_date, locale) : "—"}
                  {d.expiry_date && expiresSoon(d.expiry_date, today, alertDays) && <span className="tag">{t("deliveries.expiresSoon")}</span>}
                </td>
                <td>{d.temperature === null ? "—" : Number(d.temperature).toFixed(1)}</td>
                <td className="nowrap">{formatDateTime(d.received_at, locale)} · {staffName(staffList.find((s) => s.id === d.received_by))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {adding && (
        <DeliveryDialog
          lodgeId={lodgeId}
          onClose={() => setAdding(false)}
          onDone={() => {
            setAdding(false);
            toast.success(t("deliveries.saved"));
            void load();
          }}
        />
      )}
    </section>
  );
}

function DeliveryDialog({ lodgeId, onClose, onDone }: { lodgeId: string; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const { suppliers } = useSuppliers(true);
  const [f, setF] = useState({ product: "", supplier: "", batch: "", expiry: "", temperature: "", note: "" });
  const [error, setError] = useState<string | null>(null);
  const sup = suppliers?.find((s) => s.id === f.supplier);
  const temp = parseTemperature(f.temperature);
  // Campos obrigatórios dependem do fornecedor (cadastro em Settings > Registers).
  const valid = f.product.trim() && sup
    && (!sup.require_batch || f.batch.trim()) && (!sup.require_best_before || f.expiry)
    && (sup.require_temperature ? temp !== null : f.temperature.trim() === "" || temp !== null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const opt = (required: boolean) => (required ? null : <small>({t("app.optional")})</small>);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const { error: err } = await supabase.rpc("record_food_delivery", {
      p_lodge: lodgeId, p_product: f.product, p_supplier: f.supplier, p_batch: f.batch || null, p_expiry: f.expiry || null, p_temperature: temp, p_note: f.note,
    });
    if (err) return setError(t(errorKey(err)));
    onDone();
  }

  return (
    <Dialog
      title={t("deliveries.new")}
      onClose={onClose}
      footer={
        <>
          <DialogCancel>{t("app.cancel")}</DialogCancel>
          <button type="submit" form="delivery-form" className="primary" disabled={!valid}>{t("app.save")}</button>
        </>
      }
    >
      <form id="delivery-form" className="form" onSubmit={submit}>
        <div className="form-grid">
          <label>{t("deliveries.supplier")}
            <select required value={f.supplier} onChange={set("supplier")} autoFocus>
              <option value="">{t("deliveries.chooseSupplier")}</option>
              {(suppliers ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label>{t("deliveries.product")}<input required value={f.product} onChange={set("product")} /></label>
          <label>{t("deliveries.batch")} {opt(!!sup?.require_batch)}<input required={!!sup?.require_batch} value={f.batch} onChange={set("batch")} /></label>
          <label>{t("deliveries.expiry")} {opt(!!sup?.require_best_before)}<input type="date" required={!!sup?.require_best_before} value={f.expiry} onChange={set("expiry")} /></label>
          <label>{t("deliveries.temperature")} {opt(!!sup?.require_temperature)}<input inputMode="decimal" required={!!sup?.require_temperature} value={f.temperature} onChange={set("temperature")} placeholder="4.0" /></label>
        </div>
        {sup?.links_order && <p className="hint">{t("deliveries.linksOrderHint")}</p>}
        <Notice kind="error">{error}</Notice>
      </form>
    </Dialog>
  );
}
