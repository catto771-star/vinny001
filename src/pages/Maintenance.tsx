import { useCallback, useEffect, useMemo, useState } from "react";
import { FilterBar } from "@/components/FilterBar";
import { matchesText, type FilterDef } from "@/lib/filters";
import { useUrlFilters } from "@/lib/useUrlFilters";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n, type MessageKey } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { errorKey } from "@/lib/errors";
import { formatDateTime } from "@/lib/time";
import { staffName } from "@/lib/types";
import { useLatestRequest } from "@/lib/useLatestRequest";
import { useStaffList } from "@/lib/useStaffList";
import { DateTimeInput } from "@/components/DateTimeInput";
import { Dialog, DialogCancel } from "@/components/Dialog";
import { LodgeTabs } from "@/components/LodgeTabs";
import { useLodgeState } from "@/lib/activeLodge";
import { MaintenanceDialog, PRIORITY_LABEL, type Priority } from "@/components/MaintenanceDialog";
import { Notice } from "@/components/Notice";
import { Skeleton } from "@/components/Skeleton";
import { Tabs } from "@/components/Tabs";
import { useToast } from "@/components/Toast";

export type TicketStatus = "open" | "in_progress" | "on_hold" | "resolved" | "reopened";
export type Ticket = {
  id: string;
  lodge_id: string;
  location: string;
  description: string;
  priority: Priority;
  status: TicketStatus;
  deadline_at: string;
  created_at: string;
  created_by: string;
  resolved_at: string | null;
  overdue: boolean;
};
type Event = { id: number; kind: "created" | "status" | "deadline" | "note"; from_value: string | null; to_value: string | null; note: string | null; staff_id: string | null; at: string };

export const STATUS_LABEL: Record<TicketStatus, MessageKey> = {
  open: "maintenance.s_open",
  in_progress: "maintenance.s_in_progress",
  on_hold: "maintenance.s_on_hold",
  resolved: "maintenance.s_resolved",
  reopened: "maintenance.s_reopened",
};

/** Manutenção (s.7): chamados simples de abrir e resolver, prazo por prioridade, histórico. */
export function Maintenance() {
  const { t, locale } = useI18n();
  const { canWriteLodge } = useAuth();
  const toast = useToast();
  const [lodgeId, setLodgeId] = useLodgeState();
  const [tab, setTab] = useState<"open" | "resolved">("open");
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const begin = useLatestRequest();

  const load = useCallback(async () => {
    const isLatest = begin();
    setTickets(null);
    const { data } = await supabase.rpc("maintenance_list", { p_lodge: lodgeId });
    if (!isLatest()) return;
    setTickets((data ?? []) as Ticket[]);
  }, [lodgeId, begin]);

  useEffect(() => {
    void load();
  }, [load]);

  const filterDefs: FilterDef[] = useMemo(() => [
    { key: "q", label: t("filters.search"), type: "search" },
    { key: "priority", label: t("filters.priority"), type: "select", primary: true, options: (["urgent", "normal", "low"] as const).map((k) => ({ value: k, label: t(PRIORITY_LABEL[k]) })) },
    { key: "overdue", label: t("maintenance.overdue"), type: "select", options: [{ value: "1", label: t("maintenance.overdue") }] },
    { key: "from", label: t("filters.from"), type: "date" },
    { key: "to", label: t("filters.to"), type: "date" },
  ], [t]);
  const { values: fv, set: setFilters, clear: clearFilters } = useUrlFilters(filterDefs);
  const filtering = Object.keys(fv).length > 0;
  const list = (tickets ?? [])
    .filter((x) => (tab === "open" ? x.status !== "resolved" : x.status === "resolved"))
    .filter((x) => matchesText([x.location, x.description], fv.q ?? ""))
    .filter((x) => !fv.priority || x.priority === fv.priority)
    .filter((x) => fv.overdue !== "1" || x.overdue)
    .filter((x) => (!fv.from || x.created_at.slice(0, 10) >= fv.from) && (!fv.to || x.created_at.slice(0, 10) <= fv.to));

  return (
    <section className="page">
      <header className="page-header">
        <h1>{t("maintenance.title")}</h1>
        <LodgeTabs value={lodgeId} onChange={setLodgeId} />
      </header>
      <div className="toolbar">
        <Tabs
          size="sm"
          label={t("maintenance.title")}
          value={tab}
          onChange={(v) => setTab(v as "open" | "resolved")}
          items={[
            { value: "open", label: t("maintenance.openTab") },
            { value: "resolved", label: t("maintenance.resolvedTab") },
          ]}
        />
        {canWriteLodge(lodgeId) && <button className="primary" onClick={() => setCreating(true)}>{t("maintenance.new")}</button>}
      </div>
      <FilterBar defs={filterDefs} values={fv} onChange={setFilters} onClear={clearFilters} count={filtering && tickets ? list.length : undefined} />

      {tickets === null ? (
        <div className="card"><Skeleton rows={5} label={t("app.loading")} /></div>
      ) : list.length === 0 ? (
        <div className="card empty-state"><p className="muted">{t("maintenance.empty")}</p></div>
      ) : (
        <ul className="ticket-list">
          {list.map((x) => (
            <li key={x.id}>
              <button type="button" className={`ticket prio-${x.priority}${x.overdue ? " is-overdue" : ""}`} onClick={() => setSelected(x)}>
                <span className="ticket-prio">{t(PRIORITY_LABEL[x.priority])}</span>
                <span className="ticket-main">
                  <strong>{x.location}</strong>
                  <span className="muted">{x.description}</span>
                </span>
                <span className="ticket-side">
                  <span className={`tag${x.overdue ? " tag-danger" : x.status === "resolved" ? " tag-ok" : ""}`}>
                    {x.overdue ? t("maintenance.overdue") : t(STATUS_LABEL[x.status])}
                  </span>
                  <small className="muted">{t("maintenance.deadline")}: {formatDateTime(x.deadline_at, locale)}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {creating && (
        <MaintenanceDialog
          lodgeId={lodgeId}
          onClose={() => setCreating(false)}
          onDone={() => {
            setCreating(false);
            toast.success(t("maintenance.created"));
            void load();
          }}
        />
      )}
      {selected && (
        <TicketDialog
          ticket={selected}
          onClose={() => setSelected(null)}
          onDone={() => {
            setSelected(null);
            toast.success(t("maintenance.updated"));
            void load();
          }}
        />
      )}
    </section>
  );
}

export function TicketDialog({ ticket, onClose, onDone }: { ticket: Ticket; onClose: () => void; onDone: () => void }) {
  const { t, locale } = useI18n();
  const { isManagement, post } = useAuth();
  const staffList = useStaffList();
  const [events, setEvents] = useState<Event[]>([]);
  const [status, setStatus] = useState<TicketStatus>(ticket.status);
  const [deadline, setDeadline] = useState<Date | null>(new Date(ticket.deadline_at));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const canResolve = isManagement || (post?.function === "office" && post.lodge_id === ticket.lodge_id);

  useEffect(() => {
    void supabase
      .from("maintenance_events")
      .select("id, kind, from_value, to_value, note, staff_id, at")
      .eq("ticket_id", ticket.id)
      .order("at", { ascending: false })
      .then(({ data }) => setEvents((data ?? []) as Event[]));
  }, [ticket.id]);

  async function save(nextStatus: TicketStatus | null, nextDeadline: Date | null) {
    const { error: err } = await supabase.rpc("maintenance_set_status", {
      p_ticket: ticket.id,
      p_status: nextStatus,
      p_deadline: nextDeadline ? nextDeadline.toISOString() : null,
      p_note: note,
    });
    if (err) return setError(t(errorKey(err)));
    onDone();
  }

  const nameOf = (id: string | null) => staffName(staffList.find((s) => s.id === id)) || "—";
  const describe = (e: Event) => {
    if (e.kind === "status" && e.to_value) return `${t("maintenance.ev_status")}: ${t(STATUS_LABEL[e.to_value as TicketStatus])}`;
    if (e.kind === "deadline" && e.to_value) return `${t("maintenance.ev_deadline")}: ${formatDateTime(e.to_value, locale)}`;
    return t(`maintenance.ev_${e.kind}` as MessageKey);
  };

  return (
    <Dialog
      wide
      title={ticket.location}
      onClose={onClose}
      footer={
        <>
          <DialogCancel>{t("app.close")}</DialogCancel>
          {isManagement && (
            <button
              className="primary"
              onClick={() => void save(status !== ticket.status ? status : null, deadline && deadline.toISOString() !== new Date(ticket.deadline_at).toISOString() ? deadline : null)}
            >
              {t("maintenance.save")}
            </button>
          )}
          {!isManagement && canResolve && ticket.status !== "resolved" && (
            <button className="primary" onClick={() => void save("resolved", null)}>{t("maintenance.resolve")}</button>
          )}
        </>
      }
    >
      <p>{ticket.description}</p>
      <p className="muted small-text">
        {t(PRIORITY_LABEL[ticket.priority])} · {t("maintenance.deadline")}: {formatDateTime(ticket.deadline_at, locale)}
      </p>

      {isManagement && (
        <div className="form">
          <div className="form-grid">
            <label>
              {t("maintenance.setStatus")}
              <select value={status} onChange={(e) => setStatus(e.target.value as TicketStatus)}>
                {(Object.keys(STATUS_LABEL) as TicketStatus[]).map((s) => <option key={s} value={s}>{t(STATUS_LABEL[s])}</option>)}
              </select>
            </label>
            <label>
              {t("maintenance.newDeadline")}
              <DateTimeInput value={deadline} onChange={setDeadline} />
            </label>
          </div>
        </div>
      )}
      {(isManagement || canResolve) && (
        <label className="form" style={{ marginTop: "1rem" }}>
          {t("maintenance.whatDone")} <small>({t("app.optional")})</small>
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      )}
      <Notice kind="error">{error}</Notice>

      <h2 className="section-title">{t("maintenance.history")}</h2>
      <ol className="timeline compact">
        {events.map((e) => (
          <li key={e.id} className="timeline-item">
            <span className="timeline-time">{formatDateTime(e.at, locale)}</span>
            <div className="timeline-body">
              <strong>{nameOf(e.staff_id)}</strong> · {describe(e)}
              {e.note && <p className="timeline-text">{e.note}</p>}
            </div>
          </li>
        ))}
      </ol>
    </Dialog>
  );
}

/** Lembrete ao Manager (B34/B35): prazo vencido sem alteração; respostas rápidas; adiar não resolve. */
export function MaintenanceReminder() {
  const { t, locale } = useI18n();
  const { isManagement } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState<Ticket[]>([]);
  const [deadline, setDeadline] = useState<Date | null>(null);
  const [note, setNote] = useState("");
  const [mode, setMode] = useState<"in_progress" | "on_hold" | null>(null);

  const load = useCallback(async () => {
    if (!isManagement) return;
    const { data } = await supabase.rpc("maintenance_reminders");
    setItems((data ?? []) as Ticket[]);
  }, [isManagement]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 5 * 60_000);
    return () => window.clearInterval(id);
  }, [load]);

  const current = items[0];
  if (!current) return null;

  async function answer(status: TicketStatus | "later") {
    if (status === "later") {
      await supabase.rpc("snooze_maintenance_reminder", { p_ticket: current.id });
    } else {
      const { error } = await supabase.rpc("maintenance_set_status", {
        p_ticket: current.id,
        p_status: status,
        p_deadline: status === "in_progress" && deadline ? deadline.toISOString() : null,
        p_note: note,
      });
      if (error) return toast.error(t(errorKey(error)));
      toast.success(t("maintenance.updated"));
    }
    setMode(null);
    setNote("");
    setDeadline(null);
    await load();
  }

  return (
    <Dialog title={t("maintenance.reminderTitle")} onClose={() => void answer("later")}>
      <p><strong>{current.location}</strong> — {current.description}</p>
      <p className="muted small-text">{t("maintenance.deadline")}: {formatDateTime(current.deadline_at, locale)}</p>
      {mode === "in_progress" && (
        <label className="form">
          {t("maintenance.newDeadline")}
          <DateTimeInput required value={deadline} onChange={setDeadline} />
        </label>
      )}
      {mode === "on_hold" && (
        <label className="form">
          {t("maintenance.whatDone")}
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
        </label>
      )}
      <div className="button-row">
        <button className="primary" onClick={() => void answer("resolved")}>{t("maintenance.reminderResolved")}</button>
        {mode === "in_progress" ? (
          <button disabled={!deadline} onClick={() => void answer("in_progress")}>{t("app.save")}</button>
        ) : (
          <button onClick={() => setMode("in_progress")}>{t("maintenance.reminderInProgress")}</button>
        )}
        {mode === "on_hold" ? (
          <button disabled={!note.trim()} onClick={() => void answer("on_hold")}>{t("app.save")}</button>
        ) : (
          <button onClick={() => setMode("on_hold")}>{t("maintenance.reminderOnHold")}</button>
        )}
        <button className="ghost" onClick={() => void answer("later")}>{t("maintenance.reminderLater")}</button>
      </div>
    </Dialog>
  );
}
