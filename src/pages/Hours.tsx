import { Link } from "react-router-dom";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { errorKey } from "@/lib/errors";
import { toCsv } from "@/lib/csv";
import { minutesLabel, periodRange, shiftPeriod, type PeriodKind } from "@/lib/management";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Tabs } from "@/components/Tabs";
import type { MessageKey } from "@/i18n";
import { addDays, dublinWallTimeToDate, formatCivilDate, formatDateTime, fromDublinInputValue, operationalDay, toDublinInputValue } from "@/lib/time";
import { useLatestRequest } from "@/lib/useLatestRequest";
import { Dialog, DialogCancel } from "@/components/Dialog";
import { Notice } from "@/components/Notice";
import { Skeleton } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";

type Row = { staff_id: string; full_name: string; role: string; planned_minutes: number; effective_minutes: number };
const SOURCE_LABEL = { post: "hours.post", manual: "hours.manual", roster: "hours.roster", cover: "hours.cover", cancelled: "hours.cancelled" } as const;
type LogItem = { source: "post" | "manual" | "roster" | "cover" | "cancelled"; id: string; lodge_id: string | null; function: string | null; starts_at: string; ends_at: string | null; note: string | null };

export function monthRange(month: string): { from: Date; to: Date } {
  const first = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return { from: dublinWallTimeToDate(first, "07:00"), to: dublinWallTimeToDate(next, "07:00") };
}

/** Horas (s.14): planejadas (Rota) × efetivas (Assumir Posto + lançamentos da gestão). Sem folha de pagamento. */
export function Hours() {
  const { t, locale } = useI18n();
  const { lodges } = useAuth();
  const toast = useToast();
  const latest = useLatestRequest();
  const [kind, setKind] = useState<Exclude<PeriodKind, "custom">>("month");
  const [anchor, setAnchor] = useState(() => operationalDay(new Date()));
  const [rows, setRows] = useState<Row[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [log, setLog] = useState<LogItem[] | null>(null);
  const [adjusting, setAdjusting] = useState<LogItem | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const days = useMemo(() => periodRange(kind, anchor), [kind, anchor]);
  const range = useMemo(() => ({ from: dublinWallTimeToDate(days.from, "07:00"), to: dublinWallTimeToDate(days.to, "07:00") }), [days]);

  const load = useCallback(async () => {
    const isLatest = latest();
    setRows(null);
    const { data } = await supabase.rpc("staff_hours", { p_from: range.from.toISOString(), p_to: range.to.toISOString() });
    if (isLatest()) setRows((data ?? []) as Row[]);
  }, [range, latest]);

  const loadLog = useCallback(async (staffId: string) => {
    setLog(null);
    const { data } = await supabase.rpc("staff_work_log", { p_staff: staffId, p_from: range.from.toISOString(), p_to: range.to.toISOString() });
    setLog((data ?? []) as LogItem[]);
  }, [range]);

  useEffect(() => {
    void load();
    setOpen(null);
  }, [load]);

  function toggle(id: string) {
    if (open === id) return setOpen(null);
    setOpen(id);
    void loadLog(id);
  }

  async function refresh() {
    toast.success(t("hours.saved"));
    setAdjusting(null);
    setAdding(null);
    await load();
    if (open) await loadLog(open);
  }

  function exportCsv() {
    const hm = (m: number) => `${m < 0 ? "-" : ""}${Math.floor(Math.abs(m) / 60)}:${String(Math.abs(m) % 60).padStart(2, "0")}`;
    const label = `${formatCivilDate(days.from, locale)} → ${formatCivilDate(addDays(days.to, -1), locale)}`;
    const body = (rows ?? []).map((r) => [r.full_name, t(`users.roles.${r.role}` as never), hm(r.planned_minutes), hm(r.effective_minutes), hm(r.effective_minutes - r.planned_minutes)]);
    const blob = new Blob([toCsv([["Name", "Profile", "Planned", "Worked", "Difference"], ...body, [], ["Period", label]], { bom: true })], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hours-${days.from}_${addDays(days.to, -1)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const lodgeShort = (id: string | null) => lodges.find((l) => l.id === id)?.short_name ?? "";

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <span className="eyebrow">{t("hours.eyebrow")}</span>
          <h1>{t("hours.title")}</h1>
        </div>
      </header>
      <div className="toolbar no-print">
        <Tabs label={t("hours.period")} value={kind} onChange={(v) => setKind(v as Exclude<PeriodKind, "custom">)}
          items={(["day", "week", "fortnight", "month"] as const).map((k) => ({ value: k, label: t(`reports.p_${k}` as MessageKey) }))} />
        <span className="inline">
          <button type="button" className="icon-btn" aria-label={t("hours.prevPeriod")} onClick={() => setAnchor(shiftPeriod(kind, anchor, -1))}><ChevronLeft size={18} aria-hidden="true" /></button>
          <button type="button" className="icon-btn" aria-label={t("hours.nextPeriod")} onClick={() => setAnchor(shiftPeriod(kind, anchor, 1))}><ChevronRight size={18} aria-hidden="true" /></button>
        </span>
        <label className="inline">{t("reports.reference")}<input type="date" value={anchor} onChange={(e) => e.target.value && setAnchor(e.target.value)} /></label>
        <span className="muted" role="status">{formatCivilDate(days.from, locale)} → {formatCivilDate(addDays(days.to, -1), locale)}</span>
        <button type="button" className="small" onClick={exportCsv} disabled={!rows || rows.length === 0}>{t("audit.exportCsv")}</button>
      </div>
      <ShiftReview onConfirmed={() => void load()} />
      {rows === null ? (
        <div className="card"><Skeleton rows={6} label={t("app.loading")} /></div>
      ) : (
        <table className="table table-cards">
          <thead>
            <tr><th>{t("users.name")}</th><th className="num">{t("hours.planned")}</th><th className="num">{t("hours.effective")}</th><th className="num">{t("hours.difference")}</th><th /></tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const diff = r.effective_minutes - r.planned_minutes;
              return [
                <tr key={r.staff_id}>
                  <td className="cell-main"><strong>{r.full_name}</strong> <span className="muted">· {t(`users.roles.${r.role}` as never)}</span></td>
                  <td className="num">{minutesLabel(r.planned_minutes)}</td>
                  <td className="num">{minutesLabel(r.effective_minutes)}</td>
                  <td className={`num ${diff < 0 ? "is-neg" : diff > 0 ? "is-pos" : ""}`}>{diff > 0 ? "+" : ""}{minutesLabel(diff)}</td>
                  <td className="actions">
                    <button className="small" aria-expanded={open === r.staff_id} onClick={() => toggle(r.staff_id)}>{t("hours.log")}</button>
                    <button className="small" onClick={() => setAdding(r.staff_id)}>+ {t("hours.addInterval")}</button>
                  </td>
                </tr>,
                open === r.staff_id && (
                  <tr key={`${r.staff_id}-log`} className="row-detail">
                    <td colSpan={5}>
                      {log === null ? <Skeleton rows={2} label={t("app.loading")} /> : log.length === 0 ? <span className="muted">{t("reports.noDetails")}</span> : (
                        <ul className="log-list">
                          {log.map((l) => (
                            <li key={l.id}>
                              <span className="tag tag-kind">{t(SOURCE_LABEL[l.source])}</span>
                              <span>{formatDateTime(l.starts_at, locale)} → {l.ends_at ? formatDateTime(l.ends_at, locale) : t("hours.open")}</span>
                              <span className="muted">{lodgeShort(l.lodge_id)}{l.function && ` · ${l.function}`}{l.note && ` · ${l.note}`}</span>
                              {l.source === "post" && <button className="small" onClick={() => setAdjusting(l)}>{t("hours.adjust")}</button>}
                              {(l.source === "roster" || l.source === "cover") && <Link className="small" to="/rota">{t("hours.editInRoster")}</Link>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                ),
              ];
            })}
          </tbody>
        </table>
      )}
      {adjusting && <IntervalDialog item={adjusting} onClose={() => setAdjusting(null)} onDone={() => void refresh()} />}
      {adding && <IntervalDialog staffId={adding} onClose={() => setAdding(null)} onDone={() => void refresh()} />}
    </section>
  );
}

/** Ajustar um Assumir Posto (com motivo) ou lançar horas manualmente. */
function IntervalDialog({ item, staffId, onClose, onDone }: { item?: LogItem; staffId?: string; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const { lodges } = useAuth();
  const today = operationalDay(new Date());
  const [start, setStart] = useState(item ? toDublinInputValue(new Date(item.starts_at)) : `${addDays(today, -1)}T07:00`);
  const [end, setEnd] = useState(item?.ends_at ? toDublinInputValue(new Date(item.ends_at)) : `${addDays(today, -1)}T19:00`);
  const [lodge, setLodge] = useState(item?.lodge_id ?? lodges[0]?.id ?? "");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const s = fromDublinInputValue(start);
  const e2 = fromDublinInputValue(end);
  const valid = s && e2 && e2 > s && (!item || reason.trim());

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (!s || !e2) return;
    const { error: err } = item
      ? await supabase.rpc("adjust_work_interval", { p_post: item.id, p_start: s.toISOString(), p_end: e2.toISOString(), p_reason: reason })
      : await supabase.rpc("add_work_interval", { p_staff: staffId, p_lodge: lodge || null, p_start: s.toISOString(), p_end: e2.toISOString(), p_note: reason });
    if (err) return setError(t(errorKey(err)));
    onDone();
  }

  return (
    <Dialog
      title={item ? t("hours.adjustTitle") : t("hours.addInterval")}
      onClose={onClose}
      footer={
        <>
          <DialogCancel>{t("app.cancel")}</DialogCancel>
          <button type="submit" form="interval-form" className="primary" disabled={!valid}>{t("app.save")}</button>
        </>
      }
    >
      <form id="interval-form" className="form" onSubmit={submit}>
        <div className="form-grid">
          <label>{t("rota.start")}<input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} /></label>
          <label>{t("rota.end")}<input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
          {!item && (
            <label>Lodge<select value={lodge} onChange={(e) => setLodge(e.target.value)}>{lodges.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
          )}
        </div>
        <label>
          {item ? t("hours.reason") : t("hours.note")} {!item && <small>({t("app.optional")})</small>}
          <input value={reason} onChange={(e) => setReason(e.target.value)} required={!!item} />
        </label>
        <Notice kind="error">{error}</Notice>
      </form>
    </Dialog>
  );
}

export type ReviewRow = {
  shift_id: string; lodge_id: string; staff_id: string; full_name: string; opened_at: string; closed_at: string;
  rota_shift_id: string | null; rota_starts_at: string | null; rota_ends_at: string | null; mismatch: boolean;
  hours_status: "pending" | "confirmed"; confirmed_start: string | null; confirmed_end: string | null;
};

/**
 * Revisão 25/11: cada turno fechado no Handover (abertura → encerramento) aparece ao lado do previsto no Roster.
 * Quem bate com o Roster pode ser confirmado em lote; diferenças pedem a decisão do Manager.
 */
export function ShiftReview({ onConfirmed }: { onConfirmed: () => void }) {
  const { t, locale } = useI18n();
  const { lodges } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState<ReviewRow[] | null>(null);
  const load = useCallback(async () => {
    const { data } = await supabase.rpc("shift_hours_review");
    setRows(((data ?? []) as ReviewRow[]).filter((r) => r.hours_status === "pending"));
  }, []);
  useEffect(() => void load(), [load]);

  async function confirm(r: ReviewRow, useRoster: boolean) {
    const { error } = await supabase.rpc("confirm_shift_hours", {
      p_shift: r.shift_id,
      p_start: useRoster ? r.rota_starts_at : r.opened_at,
      p_end: useRoster ? r.rota_ends_at : r.closed_at,
    });
    if (error) return toast.error(t(errorKey(error)));
    await load();
    onConfirmed();
  }
  async function confirmMatching() {
    for (const r of rows?.filter((x) => !x.mismatch) ?? []) await confirm(r, false);
    toast.success(t("hours.saved"));
  }

  if (!rows || rows.length === 0) return null;
  const span = (a: string | null, b: string | null) => (a && b ? `${formatDateTime(a, locale)} → ${formatDateTime(b, locale).slice(-5)}` : t("hours.notOnRoster"));
  const matching = rows.filter((r) => !r.mismatch).length;
  return (
    <section className="card review-card">
      <div className="review-head">
        <div>
          <h2 className="section-title">{t("hours.toConfirm", { n: rows.length })}</h2>
          <p className="hint">{t("hours.toConfirmHint")}</p>
        </div>
        {matching > 0 && <button className="primary" onClick={() => void confirmMatching()}>{t("hours.confirmMatching", { n: matching })}</button>}
      </div>
      <table className="table">
        <thead><tr><th>{t("users.name")}</th><th>Lodge</th><th>{t("hours.rosterPlanned")}</th><th>{t("hours.handoverActual")}</th><th /></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.shift_id} className={r.mismatch ? "row-warn" : ""}>
              <td><strong>{r.full_name}</strong>{r.mismatch && <span className="tag tag-warn">{t("hours.mismatch")}</span>}</td>
              <td>{lodges.find((l) => l.id === r.lodge_id)?.short_name}</td>
              <td className="mono">{span(r.rota_starts_at, r.rota_ends_at)}</td>
              <td className="mono">{span(r.opened_at, r.closed_at)}</td>
              <td className="actions">
                <button className="small" onClick={() => void confirm(r, false)}>{t("hours.confirmActual")}</button>
                {r.rota_starts_at && <button className="small" onClick={() => void confirm(r, true)}>{t("hours.useRoster")}</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
