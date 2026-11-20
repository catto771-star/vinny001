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
import { LodgeTabs, useDefaultLodge } from "@/components/LodgeTabs";
import { Notice } from "@/components/Notice";
import { Skeleton } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";

type Delivery = { id: string; product: string; supplier: string; batch: string; expiry_date: string; temperature: string; note: string | null; received_by: string; received_at: string };
const kitchen = (l: { has_dinner: boolean }) => l.has_dinner;

/** Food Delivery (s.8): produto, fornecedor, lote, validade e temperatura obrigatórios; sem alerta. */
export function Deliveries() {
  const { t, locale } = useI18n();
  const { canWriteLodge, serverOffsetMs } = useAuth();
  const toast = useToast();
  const staffList = useStaffList();
  const [lodgeId, setLodgeId] = useState(useDefaultLodge(kitchen));
  const [rows, setRows] = useState<Delivery[] | null>(null);
  const [adding, setAdding] = useState(false);
  const begin = useLatestRequest();
  const today = operationalDay(new Date(Date.now() + serverOffsetMs));

  const load = useCallback(async () => {
    if (!lodgeId) return setRows([]);
    const isLatest = begin();
    setRows(null);
    const { data } = await supabase.from("food_deliveries").select("id, product, supplier, batch, expiry_date, temperature, note, received_by, received_at").eq("lodge_id", lodgeId).order("received_at", { ascending: false }).limit(100);
    if (!isLatest()) return;
    setRows((data ?? []) as Delivery[]);
  }, [lodgeId, begin]);

  useEffect(() => {
    void load();
  }, [load]);

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
                <td>{d.supplier}</td>
                <td>{d.batch}</td>
                <td>
                  {formatCivilDate(d.expiry_date, locale)}
                  {expiresSoon(d.expiry_date, today) && <span className="tag">{t("deliveries.expiresSoon")}</span>}
                </td>
                <td>{Number(d.temperature).toFixed(1)}</td>
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
  const [f, setF] = useState({ product: "", supplier: "", batch: "", expiry: "", temperature: "", note: "" });
  const [error, setError] = useState<string | null>(null);
  const temp = parseTemperature(f.temperature);
  const valid = f.product.trim() && f.supplier.trim() && f.batch.trim() && f.expiry && temp !== null;
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    const { error: err } = await supabase.rpc("record_food_delivery", {
      p_lodge: lodgeId, p_product: f.product, p_supplier: f.supplier, p_batch: f.batch, p_expiry: f.expiry, p_temperature: temp, p_note: f.note,
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
          <label>{t("deliveries.product")}<input required value={f.product} onChange={set("product")} autoFocus /></label>
          <label>{t("deliveries.supplier")}<input required value={f.supplier} onChange={set("supplier")} /></label>
          <label>{t("deliveries.batch")}<input required value={f.batch} onChange={set("batch")} /></label>
          <label>{t("deliveries.expiry")}<input type="date" required value={f.expiry} onChange={set("expiry")} /></label>
          <label>{t("deliveries.temperature")}<input inputMode="decimal" required value={f.temperature} onChange={set("temperature")} placeholder="4,0" /></label>
        </div>
        <p className="hint">{t("deliveries.tempHint")}</p>
        <Notice kind="error">{error}</Notice>
      </form>
    </Dialog>
  );
}
