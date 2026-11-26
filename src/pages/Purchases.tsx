import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, Plus } from "lucide-react";
import { useI18n, type MessageKey } from "@/i18n";
import { useStaffList } from "@/lib/useStaffList";
import { staffName } from "@/lib/types";
import { formatDateTime } from "@/lib/time";
import { supabase } from "@/lib/supabase";
import { errorKey } from "@/lib/errors";
import { formatEUR } from "@/lib/management";
import { formatCivilDate, operationalDay, addDays } from "@/lib/time";
import { useLatestRequest } from "@/lib/useLatestRequest";
import { Dialog, DialogCancel } from "@/components/Dialog";
import { Notice } from "@/components/Notice";
import { Skeleton } from "@/components/Skeleton";
import { Tabs } from "@/components/Tabs";
import { useToast } from "@/components/Toast";

export type ShopItem = { id: string; sort_order: number; category: string; name: string; default_qty: number; default_action: "buy" | "dont_buy"; tesco_url: string | null; image_path: string | null; version: number };
export type OrderStatus = "created" | "placed" | "awaiting" | "delivered";
export type ShopOrder = { id: string; delivery_date: string; notes: string | null; status: OrderStatus; created_at: string; delivered_at: string | null; delivered_by: string | null };
export const STATUS_LABEL: Record<OrderStatus, MessageKey> = { created: "purchases.sCreated", placed: "purchases.sPlaced", awaiting: "purchases.sAwaiting", delivered: "purchases.sDelivered" };
type Unlinked = { id: string; product: string; supplier: string; received_at: string; received_by: string };
export type ShopLine = { id: string; item_id: string; standard_qty: number; action: LineAction; delta: number; final_qty: number; unit_price: string | null };
export type LineAction = "standard" | "more" | "less" | "dont";

/** Quantidade final do pedido (mesma regra do banco). */
export function finalQty(standard: number, action: LineAction, delta: number): number {
  switch (action) {
    case "standard": return standard;
    case "more": return standard + Math.max(0, delta);
    case "less": return Math.max(0, standard - Math.max(0, delta));
    case "dont": return 0;
  }
}

/** Preço digitado: vazio = sem preço; aceita vírgula. Inválido = undefined. */
export function parsePrice(text: string): number | null | undefined {
  const s = text.trim().replace(",", ".");
  if (s === "") return null;
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(s)) return undefined;
  return Number(s);
}

const ACTIONS: { value: LineAction; label: "purchases.buyStandard" | "purchases.buyMore" | "purchases.buyLess" | "purchases.dontBuy" }[] = [
  { value: "standard", label: "purchases.buyStandard" },
  { value: "more", label: "purchases.buyMore" },
  { value: "less", label: "purchases.buyLess" },
  { value: "dont", label: "purchases.dontBuy" },
];

/** Purchases (escopo Beta 4.1): a planilha do Tesco como lista fixa, um pedido por entrega para as duas casas. */
export function Purchases() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const latest = useLatestRequest();
  const [tab, setTab] = useState<"order" | "list">("order");
  const [items, setItems] = useState<ShopItem[] | null>(null);
  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [orderId, setOrderId] = useState("");
  const [lines, setLines] = useState<ShopLine[] | null>(null);
  const [editing, setEditing] = useState<ShopItem | "new" | null>(null);
  const [creating, setCreating] = useState(false);
  const staffList = useStaffList();
  const [unlinked, setUnlinked] = useState<Unlinked[]>([]);

  const loadBase = useCallback(async () => {
    const [{ data: it }, { data: or }] = await Promise.all([
      supabase.from("shop_items").select("id, sort_order, category, name, default_qty, default_action, tesco_url, image_path, version").eq("active", true).order("sort_order"),
      supabase.from("shop_orders").select("id, delivery_date, notes, status, created_at, delivered_at, delivered_by").order("delivery_date", { ascending: false }).limit(30),
    ]);
    const { data: sup } = await supabase.from("suppliers").select("id").eq("links_order", true);
    const ids = ((sup ?? []) as { id: string }[]).map((s) => s.id);
    if (ids.length) {
      const { data: un } = await supabase.from("food_deliveries").select("id, product, supplier, received_at, received_by").in("supplier_id", ids).is("order_id", null).order("received_at", { ascending: false }).limit(20);
      setUnlinked((un ?? []) as Unlinked[]);
    } else setUnlinked([]);
    setItems((it ?? []) as ShopItem[]);
    const list = (or ?? []) as ShopOrder[];
    setOrders(list);
    setOrderId((cur) => (list.some((o) => o.id === cur) ? cur : list[0]?.id ?? ""));
  }, []);

  const loadLines = useCallback(async () => {
    if (!orderId) return setLines([]);
    const isLatest = latest();
    setLines(null);
    const { data } = await supabase.from("shop_order_lines").select("id, item_id, standard_qty, action, delta, final_qty, unit_price").eq("order_id", orderId);
    if (isLatest()) setLines((data ?? []) as ShopLine[]);
  }, [orderId, latest]);

  useEffect(() => void loadBase(), [loadBase]);
  useEffect(() => void loadLines(), [loadLines]);

  const order = orders.find((o) => o.id === orderId);
  const byItem = useMemo(() => new Map((lines ?? []).map((l) => [l.item_id, l])), [lines]);
  const categories = useMemo(() => [...new Set((items ?? []).map((i) => i.category))], [items]);

  async function saveLine(line: ShopLine, patch: Partial<Pick<ShopLine, "action" | "delta" | "unit_price">>) {
    const next = { ...line, ...patch };
    next.final_qty = finalQty(next.standard_qty, next.action, next.delta);
    setLines((ls) => ls?.map((l) => (l.id === line.id ? next : l)) ?? null);
    const { error } = await supabase.rpc("set_shop_line", {
      p_line: line.id, p_action: next.action, p_delta: next.delta, p_unit_price: next.unit_price === null || next.unit_price === "" ? null : Number(next.unit_price),
    });
    if (error) {
      toast.error(t(errorKey(error)));
      void loadLines();
    }
  }

  async function saveOrder(patch: { notes?: string; placed?: boolean; delivery?: string }) {
    if (!order) return;
    const { error } = await supabase.rpc("set_shop_order", {
      p_order: order.id, p_delivery: patch.delivery ?? order.delivery_date, p_notes: patch.notes ?? order.notes ?? "", p_placed: patch.placed ?? order.status !== "created",
    });
    if (error) return toast.error(t(errorKey(error)));
    if (patch.placed) toast.success(t("purchases.placedOk"));
    void loadBase();
  }

  async function setStatus(status: "created" | "placed" | "awaiting") {
    if (!order) return;
    const { error } = await supabase.rpc("set_shop_order_status", { p_order: order.id, p_status: status });
    if (error) return toast.error(t(errorKey(error)));
    if (status === "placed") toast.success(t("purchases.placedOk"));
    void loadBase();
  }

  async function link(deliveryId: string, orderToLink: string) {
    const { error } = await supabase.rpc("link_delivery_to_order", { p_delivery: deliveryId, p_order: orderToLink });
    if (error) return toast.error(t(errorKey(error)));
    toast.success(t("purchases.linkedOk"));
    setOrderId(orderToLink);
    void loadBase();
  }

  const total = (lines ?? []).reduce((sum, l) => sum + (l.unit_price !== null && l.unit_price !== "" ? l.final_qty * Number(l.unit_price) : 0), 0);
  const missingPrice = (lines ?? []).filter((l) => l.final_qty > 0 && (l.unit_price === null || l.unit_price === "")).length;
  const toBuy = (lines ?? []).filter((l) => l.final_qty > 0).length;

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <span className="eyebrow">{t("purchases.eyebrow")}</span>
          <h1>{t("purchases.title")}</h1>
        </div>
        <button className="primary" onClick={() => setCreating(true)}><Plus size={16} aria-hidden="true" /> {t("purchases.newOrder")}</button>
      </header>
      <Tabs label={t("purchases.title")} value={tab} onChange={(v) => setTab(v as "order" | "list")} items={[{ value: "order", label: t("purchases.orderTab") }, { value: "list", label: t("purchases.listTab") }]} />

      {items === null ? (
        <div className="card"><Skeleton rows={6} label={t("app.loading")} /></div>
      ) : tab === "list" ? (
        <>
          <p className="hint">{t("purchases.listHint")}</p>
          <div className="shop-grid">
            {items.map((i) => (
              <article key={i.id} className="shop-card">
                <ItemPicture item={i} />
                <div className="shop-main">
                  <strong>{i.name}</strong>
                  <span className="muted small-text">{i.category}</span>
                  <span className="mono">{i.default_action === "buy" ? t("purchases.standardQty", { n: i.default_qty }) : t("purchases.dontBuy")}</span>
                  <div className="inline">
                    {i.tesco_url && <a href={i.tesco_url} target="_blank" rel="noreferrer noopener" className="small-text">{t("purchases.openTesco")} <ExternalLink size={13} aria-hidden="true" /></a>}
                    <button className="small" onClick={() => setEditing(i)}>{t("app.edit")}</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
          <button onClick={() => setEditing("new")}>+ {t("purchases.addItem")}</button>
        </>
      ) : orders.length === 0 ? (
        <div className="card empty-state"><p>{t("purchases.noOrders")}</p></div>
      ) : (
        <>
          <div className="toolbar">
            <label className="inline">
              {t("purchases.order")}
              <select value={orderId} onChange={(e) => setOrderId(e.target.value)}>
                {orders.map((o) => <option key={o.id} value={o.id}>{formatCivilDate(o.delivery_date, locale)} · {t(STATUS_LABEL[o.status])}</option>)}
              </select>
            </label>
            {order && (
              <label className="inline">
                {t("purchases.delivery")}
                <input type="date" value={order.delivery_date} onChange={(e) => e.target.value && void saveOrder({ delivery: e.target.value })} />
              </label>
            )}
          </div>

          {unlinked.length > 0 && (
            <div className="card unlinked-box" role="region" aria-label={t("purchases.unlinkedTitle")}>
              <h2 className="section-title">{t("purchases.unlinkedTitle")}</h2>
              <p className="hint">{t("purchases.unlinkedHint")}</p>
              <ul className="item-list">
                {unlinked.map((d) => (
                  <UnlinkedRow key={d.id} d={d} orders={orders.filter((o) => o.status === "placed" || o.status === "awaiting")} who={staffName(staffList.find((s) => s.id === d.received_by))} onLink={(o) => void link(d.id, o)} />
                ))}
              </ul>
            </div>
          )}

          <div className="shop-summary card">
            <div><span className="big-number">{toBuy}</span><span className="muted"> {t("purchases.itemsToBuy")}</span></div>
            <div><span className="big-number mono">{formatEUR(total, locale)}</span><span className="muted"> {t("purchases.estimatedTotal")}</span></div>
            {missingPrice > 0 && <span className="muted small-text">{t("purchases.missingPrice", { n: missingPrice })}</span>}
            {order && <span className={`tag status-${order.status}`}>{t(STATUS_LABEL[order.status])}</span>}
            {order?.status === "created" && <button className="primary" onClick={() => void setStatus("placed")}>{t("purchases.markPlaced")}</button>}
            {order?.status === "placed" && <button className="primary" onClick={() => void setStatus("awaiting")}>{t("purchases.markAwaiting")}</button>}
            {(order?.status === "placed" || order?.status === "awaiting") && <button onClick={() => void setStatus(order.status === "awaiting" ? "placed" : "created")}>{order.status === "awaiting" ? t("purchases.backToPlaced") : t("purchases.reopen")}</button>}
            {order?.status === "delivered" && <span className="muted small-text">{t("purchases.deliveredInfo", { who: staffName(staffList.find((s) => s.id === order.delivered_by)), time: order.delivered_at ? formatDateTime(order.delivered_at, locale) : "—" })}</span>}
          </div>

          {lines === null ? (
            <div className="card"><Skeleton rows={6} label={t("app.loading")} /></div>
          ) : (
            categories.map((cat) => (
              <section key={cat}>
                <h2 className="section-title">{cat}</h2>
                <div className="shop-lines">
                  {items.filter((i) => i.category === cat).map((i) => {
                    const l = byItem.get(i.id);
                    if (!l) return null;
                    return <OrderLine key={l.id} item={i} line={l} onSave={(p) => void saveLine(l, p)} />;
                  })}
                </div>
              </section>
            ))
          )}

          {order && <OrderNotes key={order.id} initial={order.notes ?? ""} onSave={(notes) => void saveOrder({ notes })} />}
        </>
      )}

      {creating && (
        <NewOrderDialog
          onClose={() => setCreating(false)}
          onDone={(id) => {
            setCreating(false);
            setTab("order");
            setOrderId(id);
            void loadBase();
          }}
        />
      )}
      {editing && (
        <ItemDialog
          item={editing === "new" ? null : editing}
          categories={categories}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            toast.success(t("purchases.itemSaved"));
            void loadBase();
          }}
        />
      )}
    </section>
  );
}

function ItemPicture({ item }: { item: ShopItem }) {
  return item.image_path ? <img className="shop-img" src={item.image_path} alt="" width={64} height={64} loading="lazy" /> : <span className="shop-img shop-img-empty" aria-hidden="true" />;
}

function OrderLine({ item, line, onSave }: { item: ShopItem; line: ShopLine; onSave: (p: Partial<Pick<ShopLine, "action" | "delta" | "unit_price">>) => void }) {
  const { t, locale } = useI18n();
  const [delta, setDelta] = useState(String(line.delta || ""));
  const [price, setPrice] = useState(line.unit_price === null ? "" : String(line.unit_price));
  const parsed = parsePrice(price);
  const subtotal = typeof parsed === "number" ? parsed * line.final_qty : null;
  return (
    <article className={`shop-line${line.final_qty === 0 ? " is-skipped" : ""}`} aria-label={item.name}>
      <ItemPicture item={item} />
      <div className="shop-main">
        <strong>{item.name}</strong>
        <span className="muted small-text">
          {t("purchases.standardQty", { n: line.standard_qty })}
          {item.tesco_url && <> · <a href={item.tesco_url} target="_blank" rel="noreferrer noopener">Tesco.ie <ExternalLink size={12} aria-hidden="true" /></a></>}
        </span>
      </div>
      <div className="shop-actions" role="group" aria-label={t("purchases.action")}>
        {ACTIONS.map((a) => (
          <button key={a.value} type="button" className={`chip${line.action === a.value ? " is-on" : ""}`} aria-pressed={line.action === a.value} onClick={() => onSave({ action: a.value, delta: a.value === "more" || a.value === "less" ? Number(delta) || 1 : 0 })}>
            {t(a.label)}
          </button>
        ))}
        {(line.action === "more" || line.action === "less") && (
          <input className="shop-delta" inputMode="numeric" aria-label={t("purchases.howMany")} value={delta}
            onChange={(e) => setDelta(e.target.value.replace(/\D/g, "").slice(0, 3))}
            onBlur={() => Number(delta) !== line.delta && onSave({ delta: Number(delta) || 0 })} />
        )}
      </div>
      <div className="shop-qty"><span className="muted small-text">{t("purchases.finalQty")}</span><strong className="mono">{line.final_qty}</strong></div>
      <label className="shop-price">
        <span className="muted small-text">{t("purchases.unitPrice")}</span>
        <input inputMode="decimal" placeholder="—" value={price} aria-invalid={parsed === undefined}
          onChange={(e) => setPrice(e.target.value)}
          onBlur={() => parsed !== undefined && String(parsed ?? "") !== String(line.unit_price === null ? "" : Number(line.unit_price)) && onSave({ unit_price: parsed === null ? null : String(parsed) })} />
      </label>
      <div className="shop-qty"><span className="muted small-text">{t("purchases.subtotal")}</span><span className="mono">{subtotal === null ? "—" : formatEUR(subtotal, locale)}</span></div>
    </article>
  );
}

function OrderNotes({ initial, onSave }: { initial: string; onSave: (notes: string) => void }) {
  const { t } = useI18n();
  const [notes, setNotes] = useState(initial);
  return (
    <label className="form card">
      {t("purchases.notes")}
      <textarea rows={3} value={notes} placeholder={t("purchases.notesHint")} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== initial && onSave(notes)} />
    </label>
  );
}

function NewOrderDialog({ onClose, onDone }: { onClose: () => void; onDone: (id: string) => void }) {
  const { t } = useI18n();
  const [date, setDate] = useState(() => addDays(operationalDay(new Date()), 1));
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  async function submit() {
    const { data, error: err } = await supabase.rpc("create_shop_order", { p_delivery: date, p_notes: notes });
    if (err) return setError(t(errorKey(err)));
    onDone(data as string);
  }
  return (
    <Dialog title={t("purchases.newOrder")} onClose={onClose} footer={<><DialogCancel>{t("app.cancel")}</DialogCancel><button className="primary" disabled={!date} onClick={() => void submit()}>{t("purchases.create")}</button></>}>
      <div className="form">
        <label>{t("purchases.delivery")}<input type="date" value={date} onChange={(e) => setDate(e.target.value)} autoFocus /></label>
        <label>{t("purchases.notes")} <small>({t("app.optional")})</small><textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        <p className="hint">{t("purchases.newOrderHint")}</p>
        <Notice kind="error">{error}</Notice>
      </div>
    </Dialog>
  );
}

function ItemDialog({ item, categories, onClose, onDone }: { item: ShopItem | null; categories: string[]; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const [name, setName] = useState(item?.name ?? "");
  const [category, setCategory] = useState(item?.category ?? categories[0] ?? "");
  const [qty, setQty] = useState(String(item?.default_qty ?? 1));
  const [action, setAction] = useState<"buy" | "dont_buy">(item?.default_action ?? "buy");
  const [url, setUrl] = useState(item?.tesco_url ?? "");
  const [error, setError] = useState<string | null>(null);
  async function submit() {
    const { error: err } = await supabase.rpc("update_shop_item", {
      p_id: item?.id ?? null, p_name: name, p_category: category, p_default_qty: Number(qty), p_default_action: action, p_tesco_url: url,
    });
    if (err) return setError(t(errorKey(err)));
    onDone();
  }
  return (
    <Dialog title={item ? t("app.edit") : t("purchases.addItem")} onClose={onClose} footer={<><DialogCancel>{t("app.cancel")}</DialogCancel><button className="primary" disabled={!name.trim() || !/^\d{1,3}$/.test(qty)} onClick={() => void submit()}>{t("app.save")}</button></>}>
      <div className="form">
        <div className="form-grid">
          <label>{t("purchases.product")}<input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></label>
          <label>{t("purchases.category")}<input list="shop-categories" value={category} onChange={(e) => setCategory(e.target.value)} /></label>
          <label>{t("purchases.defaultQty")}<input inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} /></label>
          <label>
            {t("purchases.defaultAction")}
            <select value={action} onChange={(e) => setAction(e.target.value as "buy" | "dont_buy")}>
              <option value="buy">{t("purchases.buyStandard")}</option>
              <option value="dont_buy">{t("purchases.dontBuy")}</option>
            </select>
          </label>
        </div>
        <label>{t("purchases.tescoLink")}<input type="url" value={url} placeholder="https://www.tesco.ie/…" onChange={(e) => setUrl(e.target.value)} /></label>
        <datalist id="shop-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        <Notice kind="error">{error}</Notice>
      </div>
    </Dialog>
  );
}


function UnlinkedRow({ d, orders, who, onLink }: { d: Unlinked; orders: ShopOrder[]; who: string; onLink: (orderId: string) => void }) {
  const { t, locale } = useI18n();
  const [pick, setPick] = useState(orders[0]?.id ?? "");
  return (
    <li className="card">
      <span className="supplier-main"><strong>{d.supplier}</strong> <span className="muted">{d.product} · {formatDateTime(d.received_at, locale)} · {who}</span></span>
      <span className="inline">
        <select aria-label={t("purchases.linkTo")} value={pick || orders[0]?.id || ""} onChange={(e) => setPick(e.target.value)} disabled={orders.length === 0}>
          {orders.length === 0 && <option value="">{t("purchases.noOpenOrders")}</option>}
          {orders.map((o) => <option key={o.id} value={o.id}>{formatCivilDate(o.delivery_date, locale)} · {t(STATUS_LABEL[o.status])}</option>)}
        </select>
        <button type="button" className="primary small" disabled={!(pick || orders[0]?.id)} onClick={() => onLink(pick || orders[0]!.id)}>{t("purchases.link")}</button>
      </span>
    </li>
  );
}
