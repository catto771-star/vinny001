import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n, type MessageKey } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { errorKey } from "@/lib/errors";
import { insertMention, isLateFact, mentionQuery, pickTitle } from "@/lib/occurrences";
import { slotInstant } from "@/lib/presence";
import { formatCivilDate, formatTime, operationalDay, operationalDayBounds } from "@/lib/time";
import { residentName, staffName } from "@/lib/types";
import { useLatestRequest } from "@/lib/useLatestRequest";
import { useOccupancy } from "@/lib/useOccupancy";
import { useStaffList } from "@/lib/useStaffList";
import { DateTimeField } from "@/components/DateTimeField";
import { Dialog, DialogCancel } from "@/components/Dialog";
import { LodgeTabs, useDefaultLodge } from "@/components/LodgeTabs";
import { MaintenanceDialog } from "@/components/MaintenanceDialog";
import { Notice } from "@/components/Notice";
import { Skeleton } from "@/components/Skeleton";
import { Tabs } from "@/components/Tabs";
import { useToast } from "@/components/Toast";
import { WarningDialog } from "@/components/WarningDialog";

export type Entry = {
  id: string;
  lodge_id: string;
  kind: "note" | "round" | "maintenance" | "warning";
  body: string;
  occurred_at: string;
  operational_day: string;
  round_slot: string | null;
  author_id: string;
  late_reason: string | null;
  status: "active" | "voided";
  void_reason: string | null;
  version: number;
};
type Mention = { entry_id: string; resident_id: string | null; staff_id: string | null };
type Filter = "all" | "note" | "round" | "maintenance" | "warning";
type Suggestion = { kind: "resident" | "staff"; id: string; label: string; hint: string };

const COLUMNS = "id, lodge_id, kind, body, occurred_at, operational_day, round_slot, author_id, late_reason, status, void_reason, version";
const KIND_LABEL: Record<Entry["kind"], MessageKey> = {
  note: "handover.filterNotes",
  round: "handover.filterRounds",
  maintenance: "handover.filterMaintenance",
  warning: "handover.filterWarnings",
};

/** Agrupa linhas de ronda seguidas numa só (s.6: o Handover não fica poluído). */
export function groupRounds(entries: Entry[]): Array<Entry | { kind: "round-group"; id: string; entries: Entry[] }> {
  const out: Array<Entry | { kind: "round-group"; id: string; entries: Entry[] }> = [];
  for (const e of entries) {
    const last = out[out.length - 1];
    if (e.kind === "round" && e.status === "active") {
      if (last && last.kind === "round-group") last.entries.push(e);
      else out.push({ kind: "round-group", id: `g-${e.id}`, entries: [e] });
    } else out.push(e);
  }
  return out;
}

export function Handover() {
  const { t, locale } = useI18n();
  const { canWriteLodge, isManagement, staff: me, serverOffsetMs } = useAuth();
  const toast = useToast();
  const staffList = useStaffList();
  const [lodgeId, setLodgeId] = useState(useDefaultLodge());
  const { beds } = useOccupancy(lodgeId);
  const [day, setDay] = useState(() => operationalDay(new Date(Date.now() + serverOffsetMs)));
  const [filter, setFilter] = useState<Filter>("all");
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [roundSlots, setRoundSlots] = useState<string[]>([]);
  const [dialog, setDialog] = useState<"maintenance" | "warning" | null>(null);
  const [editing, setEditing] = useState<{ entry: Entry; mode: "edit" | "void" } | null>(null);
  const canWrite = canWriteLodge(lodgeId);
  const begin = useLatestRequest();
  const today = operationalDay(new Date(Date.now() + serverOffsetMs));

  const load = useCallback(async () => {
    const isLatest = begin();
    setEntries(null);
    const { start, end } = operationalDayBounds(day);
    const { data } = await supabase
      .from("handover_entries")
      .select(COLUMNS)
      .eq("lodge_id", lodgeId)
      .or(`and(occurred_at.gte.${start.toISOString()},occurred_at.lt.${end.toISOString()}),operational_day.eq.${day}`)
      .order("occurred_at", { ascending: false });
    const list = (data ?? []) as Entry[];
    const { data: m } = list.length
      ? await supabase.from("handover_mentions").select("entry_id, resident_id, staff_id").in("entry_id", list.map((e) => e.id))
      : { data: [] };
    if (!isLatest()) return;
    setEntries(list);
    setMentions((m ?? []) as Mention[]);
  }, [lodgeId, day, begin]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void supabase.rpc("round_slots").then(({ data }) => setRoundSlots(((data ?? []) as string[]).slice().sort((a, b) => Number(a < "07:00") - Number(b < "07:00") || a.localeCompare(b))));
  }, []);

  const residentNames = useMemo(() => new Map(beds.filter((b) => b.resident_id).map((b) => [b.resident_id!, residentName(b)])), [beds]);
  const nameOf = (id: string) => staffName(staffList.find((s) => s.id === id)) || "—";

  const visible = useMemo(() => {
    const list = (entries ?? []).filter((e) => filter === "all" || e.kind === filter);
    return filter === "all" ? groupRounds(list) : list;
  }, [entries, filter]);

  const doneRounds = new Set((entries ?? []).filter((e) => e.kind === "round" && e.operational_day === day).map((e) => e.round_slot));

  async function roundDone(slot: string) {
    const { data, error } = await supabase.rpc("room_check_done", { p_lodge: lodgeId, p_day: day, p_slot: slot });
    if (error) return toast.error(t(errorKey(error)));
    void data;
    toast.success(t("handover.roundRecorded"));
    await load();
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <span className="eyebrow">{t("handover.eyebrow")}</span>
          <h1>{t("handover.title")}</h1>
        </div>
        <LodgeTabs value={lodgeId} onChange={setLodgeId} />
      </header>

      {/* Rondas de 2 em 2 horas — um clique gera "Room Check Done" */}
      {day === today && roundSlots.length > 0 && (
        <div className="rounds-strip" aria-label={t("handover.rounds")}>
          <span className="eyebrow">{t("handover.rounds")}</span>
          <div className="rounds-list">
            {roundSlots.map((slot) => {
              const due = slotInstant(day, slot).getTime() <= Date.now() + serverOffsetMs + 15 * 60_000;
              const done = doneRounds.has(slot);
              const forgotten = !done && slotInstant(day, slot).getTime() + 30 * 60_000 <= Date.now() + serverOffsetMs;
              return (
                <button
                  key={slot}
                  type="button"
                  className={`round-chip${done ? " is-done" : ""}${forgotten ? " is-late" : ""}`}
                  disabled={done || !due || !canWrite}
                  title={forgotten ? t("handover.roundPending") : undefined}
                  onClick={() => void roundDone(slot)}
                >
                  {slot}
                  {done && <span aria-hidden="true"> ✓</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {canWrite && day === today && (
        <Composer
          lodgeId={lodgeId}
          residents={beds}
          onPosted={() => {
            toast.success(t("handover.posted"));
            void load();
          }}
          onMaintenance={() => setDialog("maintenance")}
          onWarning={() => setDialog("warning")}
        />
      )}

      <div className="toolbar">
        <input type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} aria-label={t("sheet.day")} />
        <Tabs
          size="sm"
          label={t("handover.title")}
          value={filter}
          onChange={(v) => setFilter(v as Filter)}
          items={[
            { value: "all", label: t("handover.filterAll") },
            { value: "note", label: t("handover.filterNotes") },
            { value: "round", label: t("handover.filterRounds") },
            { value: "maintenance", label: t("handover.filterMaintenance") },
            { value: "warning", label: t("handover.filterWarnings") },
          ]}
        />
      </div>

      {entries === null ? (
        <div className="card"><Skeleton rows={6} label={t("app.loading")} /></div>
      ) : visible.length === 0 ? (
        <div className="card empty-state">
          <span className="eyebrow">{formatCivilDate(day, locale)}</span>
          <p className="muted">{t("handover.empty")}</p>
        </div>
      ) : (
        <ol className="timeline">
          {visible.map((item) =>
            item.kind === "round-group" ? (
              <li key={item.id} className="timeline-item is-round">
                <span className="timeline-time">{formatTime(item.entries[item.entries.length - 1].occurred_at, locale)}</span>
                <div className="timeline-body">
                  <span className="muted small-text">
                    {t("handover.roundDone")} · {t("handover.roundsGrouped", { n: item.entries.length })} ·{" "}
                    {item.entries.map((e) => `${e.round_slot} (${nameOf(e.author_id)})`).reverse().join(" · ")}
                  </span>
                </div>
              </li>
            ) : (
              <li key={item.id} className={`timeline-item kind-${item.kind}${item.status === "voided" ? " is-voided" : ""}`}>
                <span className="timeline-time">{formatTime(item.occurred_at, locale)}</span>
                <div className="timeline-body">
                  <div className="timeline-meta">
                    <strong>{nameOf(item.author_id)}</strong>
                    {item.kind !== "note" && <span className="tag tag-kind">{t(KIND_LABEL[item.kind])}</span>}
                    {item.late_reason && (
                      <span className="tag">{t("handover.lateTag", { reason: t(`handover.reasons.${item.late_reason}` as MessageKey) })}</span>
                    )}
                  </div>
                  <p className="timeline-text">{item.body}</p>
                  {mentions.some((m) => m.entry_id === item.id) && (
                    <div className="mention-chips">
                      {mentions
                        .filter((m) => m.entry_id === item.id)
                        .map((m) =>
                          m.resident_id ? (
                            <Link key={m.resident_id} className="chip" to={`/residents/${m.resident_id}`}>@{residentNames.get(m.resident_id) ?? "…"}</Link>
                          ) : (
                            <span key={m.staff_id} className="chip">@{nameOf(m.staff_id!)}</span>
                          ),
                        )}
                    </div>
                  )}
                  {item.status === "voided" && <p className="small-text muted">{t("handover.voidedReason", { reason: item.void_reason ?? "" })}</p>}
                  {item.status === "active" && item.kind === "note" && (isManagement || (item.author_id === me?.id && canWrite)) && (
                    <div className="timeline-actions">
                      <button className="small ghost" onClick={() => setEditing({ entry: item, mode: "edit" })}>{t("handover.edit")}</button>
                      <button className="small ghost" onClick={() => setEditing({ entry: item, mode: "void" })}>{t("handover.void")}</button>
                    </div>
                  )}
                </div>
              </li>
            ),
          )}
        </ol>
      )}

      {dialog === "maintenance" && (
        <MaintenanceDialog
          lodgeId={lodgeId}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            toast.success(t("maintenance.created"));
            void load();
          }}
        />
      )}
      {dialog === "warning" && (
        <WarningDialog
          residents={beds}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            toast.success(t("warnings.recorded"));
            void load();
          }}
        />
      )}
      {editing && (
        <EditEntry
          entry={editing.entry}
          mode={editing.mode}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            toast.success(t("residents.saved"));
            void load();
          }}
        />
      )}
    </section>
  );
}

function Composer({
  lodgeId,
  residents,
  onPosted,
  onMaintenance,
  onWarning,
}: {
  lodgeId: string;
  residents: ReturnType<typeof useOccupancy>["beds"];
  onPosted: () => void;
  onMaintenance: () => void;
  onWarning: () => void;
}) {
  const { t, locale } = useI18n();
  const { isManagement, serverOffsetMs } = useAuth();
  const staffList = useStaffList();
  const [body, setBody] = useState("");
  const [occurredAt, setOccurredAt] = useState<Date | null>(null);
  const [reason, setReason] = useState("");
  const [reasons, setReasons] = useState<string[]>([]);
  const [phrases, setPhrases] = useState<{ id: string; text: Record<string, string> }[]>([]);
  const [picked, setPicked] = useState<Suggestion[]>([]);
  const [query, setQuery] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    void supabase.from("quick_phrases").select("id, text").eq("active", true).order("sort_order").then(({ data }) => setPhrases((data ?? []) as typeof phrases));
    void supabase.rpc("param_value", { p_key: "handover.late_reasons" }).then(({ data }) => setReasons((data ?? []) as string[]));
  }, []);

  const now = new Date(Date.now() + serverOffsetMs);
  const late = !!occurredAt && isLateFact(occurredAt, now) && !isManagement;

  const suggestions: Suggestion[] = useMemo(() => {
    if (query === null) return [];
    const q = query.toLowerCase();
    const rs: Suggestion[] = residents
      .filter((b) => b.resident_id && residentName(b).toLowerCase().includes(q))
      .map((b) => ({ kind: "resident", id: b.resident_id!, label: residentName(b), hint: `${b.room_code} · ${b.bed_number}` }));
    const ss: Suggestion[] = staffList
      .filter((s) => staffName(s).toLowerCase().includes(q))
      .map((s) => ({ kind: "staff", id: s.id, label: staffName(s), hint: s.role }));
    return [...rs, ...ss].slice(0, 6);
  }, [query, residents, staffList]);

  function onChange(value: string) {
    setBody(value);
    setQuery(mentionQuery(value, ref.current?.selectionStart ?? value.length));
  }

  function choose(s: Suggestion) {
    const caret = ref.current?.selectionStart ?? body.length;
    const next = insertMention(body, caret, s.label);
    setBody(next.text);
    setQuery(null);
    setPicked((p) => (p.some((x) => x.id === s.id) ? p : [...p, s]));
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(next.caret, next.caret);
    });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    // Só ficam as menções cujo nome continua no texto.
    const mentions = picked
      .filter((s) => body.includes(`@${s.label}`))
      .map((s) => (s.kind === "resident" ? { resident_id: s.id } : { staff_id: s.id }));
    const { error: err } = await supabase.rpc("add_handover_note", {
      p_lodge: lodgeId,
      p_body: body,
      p_occurred_at: occurredAt ? occurredAt.toISOString() : null,
      p_mentions: mentions,
      p_late_reason: late ? reason || null : null,
    });
    setBusy(false);
    if (err) return setError(t(errorKey(err)));
    setBody("");
    setPicked([]);
    setOccurredAt(null);
    setReason("");
    onPosted();
  }

  return (
    <form className="composer" onSubmit={submit}>
      <div className="composer-input">
        <textarea
          ref={ref}
          rows={3}
          value={body}
          placeholder={t("handover.compose")}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (suggestions.length && (e.key === "Enter" || e.key === "Tab")) {
              e.preventDefault();
              choose(suggestions[0]);
            }
            if (e.key === "Escape") setQuery(null);
          }}
        />
        {suggestions.length > 0 && (
          <ul className="mention-menu" role="listbox">
            {suggestions.map((s) => (
              <li key={`${s.kind}-${s.id}`}>
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => choose(s)}>
                  <span>@{s.label}</span>
                  <small className="muted">{s.hint}</small>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {phrases.length > 0 && (
        <div className="phrase-chips" aria-label={t("handover.quickPhrases")}>
          {phrases.map((p) => (
            <button key={p.id} type="button" className="chip" onClick={() => setBody((b) => (b ? `${b} ${pickTitle(p.text, locale)}` : pickTitle(p.text, locale)))}>
              {pickTitle(p.text, locale)}
            </button>
          ))}
        </div>
      )}
      <div className="composer-bar">
        <DateTimeField label="handover.occurredAt" value={occurredAt} onChange={setOccurredAt} />
        {late && (
          <label className="field">
            <span>{t("handover.lateReason")}</span>
            <select required value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="" />
              {reasons.map((r) => (
                <option key={r} value={r}>{t(`handover.reasons.${r}` as MessageKey)}</option>
              ))}
            </select>
          </label>
        )}
        <div className="composer-actions">
          <button type="button" className="ghost" onClick={onMaintenance}>{t("handover.createMaintenance")}</button>
          <button type="button" className="ghost" onClick={onWarning}>{t("handover.recordWarning")}</button>
          <button type="submit" className="primary" disabled={busy || !body.trim() || (late && !reason)}>{t("handover.post")}</button>
        </div>
      </div>
      {late && <p className="hint warn-text">{t("handover.lateHint")}</p>}
      <Notice kind="error">{error}</Notice>
    </form>
  );
}

function EditEntry({ entry, mode, onClose, onDone }: { entry: Entry; mode: "edit" | "void"; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const [text, setText] = useState(mode === "edit" ? entry.body : "");
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const { error: err } =
      mode === "edit"
        ? await supabase.rpc("correct_handover_note", { p_id: entry.id, p_body: text })
        : await supabase.rpc("void_handover_note", { p_id: entry.id, p_reason: text });
    if (err) return setError(t(errorKey(err)));
    onDone();
  }

  return (
    <Dialog
      title={mode === "edit" ? t("handover.edit") : t("handover.void")}
      onClose={onClose}
      footer={
        <>
          <DialogCancel>{t("app.cancel")}</DialogCancel>
          <button className={mode === "void" ? "danger" : "primary"} disabled={!text.trim()} onClick={() => void save()}>
            {mode === "edit" ? t("app.save") : t("handover.void")}
          </button>
        </>
      }
    >
      <label className="form">
        {mode === "edit" ? t("handover.title") : t("handover.voidReason")}
        <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
      </label>
      <Notice kind="error">{error}</Notice>
    </Dialog>
  );
}
