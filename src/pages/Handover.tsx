import { StaffPicker } from "@/components/StaffPicker";
import { FilterBar } from "@/components/FilterBar";
import { csv, type FilterDef } from "@/lib/filters";
import { useUrlFilters } from "@/lib/useUrlFilters";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n, type MessageKey } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { errorKey } from "@/lib/errors";
import { insertMention, isLateFact, mentionQuery } from "@/lib/occurrences";
import { slotInstant } from "@/lib/presence";
import { addDays, formatCivilDate, formatTime, operationalDay, operationalDayBounds } from "@/lib/time";
import { residentName, staffName } from "@/lib/types";
import { useLatestRequest } from "@/lib/useLatestRequest";
import { useOccupancy } from "@/lib/useOccupancy";
import { useStaffList } from "@/lib/useStaffList";
import { onDutyFor, useOnDuty } from "@/lib/useOnDuty";
import { DateTimeField } from "@/components/DateTimeField";
import { DateTimeInput } from "@/components/DateTimeInput";
import { Dialog, DialogCancel } from "@/components/Dialog";
import { LodgeTabs } from "@/components/LodgeTabs";
import { useLodgeState } from "@/lib/activeLodge";
import { MaintenanceDialog } from "@/components/MaintenanceDialog";
import { Notice } from "@/components/Notice";
import { Skeleton } from "@/components/Skeleton";
import { Tabs } from "@/components/Tabs";
import { useToast } from "@/components/Toast";
import { WarningDialog } from "@/components/WarningDialog";

export type Entry = {
  id: string;
  lodge_id: string;
  kind: "note" | "round" | "maintenance" | "warning" | "laundry" | "shift";
  body: string;
  occurred_at: string;
  operational_day: string;
  round_slot: string | null;
  author_id: string;
  filled_by: string | null;
  late_reason: string | null;
  status: "active" | "voided";
  void_reason: string | null;
  version: number;
};
type Mention = { entry_id: string; resident_id: string | null; staff_id: string | null };
type Filter = "all" | "note" | "round" | "maintenance" | "warning" | "laundry";
type Suggestion = { kind: "resident" | "staff"; id: string; label: string; hint: string };

const COLUMNS = "id, lodge_id, kind, body, occurred_at, operational_day, round_slot, author_id, filled_by, late_reason, status, void_reason, version";
const KIND_LABEL: Record<Entry["kind"], MessageKey> = {
  note: "handover.filterNotes",
  round: "handover.filterRounds",
  maintenance: "handover.filterMaintenance",
  warning: "handover.filterWarnings",
  laundry: "handover.filterLaundry",
  shift: "handover.shiftTag",
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
  const [lodgeId, setLodgeId] = useLodgeState();
  const { beds } = useOccupancy(lodgeId);
  const [day, setDay] = useState(() => operationalDay(new Date(Date.now() + serverOffsetMs)));
  const [filter, setFilter] = useState<Filter>("all");
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [roundSlots, setRoundSlots] = useState<string[]>([]);
  const [dialog, setDialog] = useState<"maintenance" | "warning" | null>(null);
  const [editing, setEditing] = useState<{ entry: Entry; mode: "edit" | "void" } | null>(null);
  const [shiftStaff, setShiftStaff] = useState<string | null>(null);
  const [entryTags, setEntryTags] = useState<{ entry_id: string; tag_id: string }[]>([]);
  const [coAuthors, setCoAuthors] = useState<{ entry_id: string; staff_id: string; position: number }[]>([]);
  const allTags = useHandoverTags(false);
  const fillerList = useMemo(() => staffList.filter((x) => FILLER_ROLES.includes(x.role)), [staffList]);
  const filterDefs: FilterDef[] = useMemo(() => [
    { key: "q", label: t("filters.search"), type: "search" },
    { key: "tags", label: t("filters.tags"), type: "multi", primary: true, options: allTags.map((g) => ({ value: g.id, label: g.label })) },
    { key: "staff", label: t("filters.author"), type: "select", options: fillerList.map((x) => ({ value: x.id, label: staffName(x) })) },
    { key: "resident", label: t("filters.resident"), type: "select", options: beds.filter((b) => b.resident_id).map((b) => ({ value: b.resident_id!, label: residentName(b) })) },
    { key: "fn", label: t("filters.function"), type: "select", options: [{ value: "office", label: t("handover.officeShift") }, { value: "float", label: t("handover.floatShift") }] },
    { key: "from", label: t("filters.from"), type: "date" },
    { key: "to", label: t("filters.to"), type: "date" },
    { key: "voided", label: t("filters.includeVoided"), type: "select", options: [{ value: "1", label: t("filters.includeVoided") }] },
  ], [t, allTags, fillerList, beds]);
  const { values: fv, set: setFilters, clear: clearFilters } = useUrlFilters(filterDefs);
  // Qualquer filtro além das abas procura em vários dias (padrão: últimos 30 dias até o dia escolhido).
  const searching = Object.keys(fv).length > 0;
  const fvKey = JSON.stringify(fv);
  const canWrite = canWriteLodge(lodgeId);
  const begin = useLatestRequest();
  const today = operationalDay(new Date(Date.now() + serverOffsetMs));

  const load = useCallback(async () => {
    const isLatest = begin();
    setEntries(null);
    let data: unknown[] | null;
    if (searching) {
      const to = fv.to || fv.from || day;
      const from = fv.from || addDays(to, -29);
      ({ data } = await supabase.rpc("search_handover", {
        p_lodge: lodgeId, p_from: from, p_to: to < from ? from : to, p_q: fv.q || null,
        p_tags: csv(fv.tags), p_staff: fv.staff || null, p_resident: fv.resident || null,
        p_function: fv.fn || null, p_include_voided: fv.voided === "1", p_limit: 100,
      }));
    } else {
      const { start, end } = operationalDayBounds(day);
      ({ data } = await supabase
        .from("handover_entries")
        .select(COLUMNS)
        .eq("lodge_id", lodgeId)
        .or(`and(occurred_at.gte.${start.toISOString()},occurred_at.lt.${end.toISOString()}),operational_day.eq.${day}`)
        .order("occurred_at", { ascending: false }));
    }
    const list = (data ?? []) as Entry[];
    const ids = list.map((e) => e.id);
    const [{ data: m }, { data: et }, { data: co }] = list.length
      ? await Promise.all([
          supabase.from("handover_mentions").select("entry_id, resident_id, staff_id").in("entry_id", ids),
          supabase.from("handover_entry_tags").select("entry_id, tag_id").in("entry_id", ids),
          supabase.from("handover_entry_staff").select("entry_id, staff_id, position").in("entry_id", ids).order("position"),
        ])
      : [{ data: [] }, { data: [] }, { data: [] }];
    if (!isLatest()) return;
    setEntries(list);
    setMentions((m ?? []) as Mention[]);
    setEntryTags((et ?? []) as { entry_id: string; tag_id: string }[]);
    setCoAuthors((co ?? []) as { entry_id: string; staff_id: string; position: number }[]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lodgeId, day, begin, fvKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const onFloatChange = useCallback(() => void load(), [load]);
  const onShiftChange = useCallback((id: string | null) => {
    setShiftStaff(id);
    void load();
  }, [load]);

  useEffect(() => {
    void supabase.rpc("round_slots").then(({ data }) => setRoundSlots(((data ?? []) as string[]).slice().sort((a, b) => Number(a < "07:00") - Number(b < "07:00") || a.localeCompare(b))));
  }, []);

  const residentNames = useMemo(() => new Map(beds.filter((b) => b.resident_id).map((b) => [b.resident_id!, residentName(b)])), [beds]);
  const nameOf = (id: string) => staffName(staffList.find((s) => s.id === id)) || "—";

  const visible = useMemo(() => {
    const list = (entries ?? []).filter((e) => (filter === "all" || e.kind === filter));
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
              const due = slotInstant(day, slot).getTime() <= Date.now() + serverOffsetMs + 60 * 60_000; // até 60 min antes (Beta)
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

      {canWrite && day === today && <ShiftBar lodgeId={lodgeId} onChange={onShiftChange} />}
      {canWrite && day === today && <ShiftBar fn="float" lodgeId={lodgeId} onChange={onFloatChange} />}

      {canWrite && day === today && (
        <Composer
          lodgeId={lodgeId}
          shiftStaff={shiftStaff}
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
            { value: "laundry", label: t("handover.filterLaundry") },
          ]}
        />
      </div>
      <FilterBar defs={filterDefs} values={fv} onChange={setFilters} onClear={clearFilters} count={searching && entries ? entries.length : undefined} />

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
                    {item.entries.map((e) => `${e.round_slot} (${t("handover.roundActual", { time: formatTime(e.occurred_at, locale) })}, ${nameOf(e.filled_by ?? e.author_id)})`).reverse().join(" · ")}
                  </span>
                </div>
              </li>
            ) : (
              <li key={item.id} className={`timeline-item kind-${item.kind}${item.status === "voided" ? " is-voided" : ""}`}>
                <span className="timeline-time">{formatTime(item.occurred_at, locale)}{searching && item.operational_day && <small className="muted">{formatCivilDate(item.operational_day, locale).slice(0, 5)}</small>}</span>
                <div className="timeline-body">
                  <div className="timeline-meta">
                    <strong>{nameOf(item.filled_by ?? item.author_id)}</strong>
                    {coAuthors.some((c) => c.entry_id === item.id) && (
                      <span className="muted">{t("handover.withAuthors", { names: coAuthors.filter((c) => c.entry_id === item.id).map((c) => nameOf(c.staff_id)).join(", ") })}</span>
                    )}
                    {item.kind !== "note" && KIND_LABEL[item.kind] && <span className="tag tag-kind">{t(KIND_LABEL[item.kind])}</span>}
                    {item.late_reason && (
                      <span className="tag">{t("handover.lateTag", { reason: t(`handover.reasons.${item.late_reason}` as MessageKey) })}</span>
                    )}
                  </div>
                  <p className="timeline-text">{item.body}</p>
                  {entryTags.some((x) => x.entry_id === item.id) && (
                    <div className="mention-chips">
                      {entryTags.filter((x) => x.entry_id === item.id).map((x) => {
                        const g = allTags.find((y) => y.id === x.tag_id);
                        return g ? <span key={x.tag_id} className={`tag tag-c-${g.color}`}>{g.label}</span> : null;
                      })}
                    </div>
                  )}
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

const FILLER_ROLES = ["porter", "manager", "owner", "developer"];

export type TagColor = "red" | "amber" | "blue" | "green" | "violet" | "grey";
export const TAG_COLORS: TagColor[] = ["red", "amber", "blue", "green", "violet", "grey"];
export type HandoverTag = { id: string; code: string; label: string; color: TagColor; sort_order: number; visible: boolean; notify_default: boolean };

/** Tags do Handover (revisão 3). onlyVisible = as que o Admin deixou aparecer. */
export function useHandoverTags(onlyVisible: boolean): HandoverTag[] {
  const [tags, setTags] = useState<HandoverTag[]>([]);
  useEffect(() => {
    void supabase.from("handover_tags").select("id, code, label, color, sort_order, visible, notify_default").order("sort_order")
      .then(({ data }) => setTags(((data ?? []) as HandoverTag[]).filter((g) => !onlyVisible || g.visible)));
  }, [onlyVisible]);
  return tags;
}

type OpenShift = { id: string; staff_id: string; opened_at: string };

/** Turno do Livro Ata (revisão 25/11): abertura com quem assume, encerramento passando o serviço. */
function ShiftBar({ lodgeId, onChange, fn = "office" }: { lodgeId: string; onChange: (staffId: string | null) => void; fn?: "office" | "float" }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const staffList = useStaffList();
  const { posts } = useOnDuty();
  const [shift, setShift] = useState<OpenShift | null | undefined>(undefined);
  const [who, setWho] = useState("");
  const [closing, setClosing] = useState(false);
  const [handTo, setHandTo] = useState("");
  // Revisão 5: horário real de início e de término (padrão: agora).
  const [startAt, setStartAt] = useState<Date | null>(() => new Date());
  const [endAt, setEndAt] = useState<Date | null>(() => new Date());
  const [note, setNote] = useState("");
  const fillers = staffList.filter((s) => FILLER_ROLES.includes(s.role));
  const rostered = (fn === "float" ? posts.find((p) => p.function === "float") : onDutyFor(posts, lodgeId))?.staff_id ?? "";
  const nameOf = (id: string) => staffName(staffList.find((s) => s.id === id)) || "—";

  const load = useCallback(async () => {
    // Office: um por casa. Float: um só, para as duas casas.
    const q = supabase.from("handover_shifts").select("id, staff_id, opened_at").eq("function", fn).is("closed_at", null);
    const { data } = await (fn === "float" ? q : q.eq("lodge_id", lodgeId)).limit(1);
    const open = ((data ?? []) as OpenShift[])[0] ?? null;
    setShift(open);
    onChange(open?.staff_id ?? null);
  }, [lodgeId, onChange, fn]);
  useEffect(() => void load(), [load]);

  async function open() {
    setStartAt((d) => d ?? new Date());
    const { error } = await supabase.rpc("open_handover_shift", { p_lodge: lodgeId, p_staff: who || rostered, p_function: fn, p_at: (startAt ?? new Date()).toISOString() });
    if (error) return toast.error(t(errorKey(error)));
    toast.success(t("handover.shiftOpened"));
    setStartAt(new Date());
    void load();
  }
  async function close() {
    if (!shift) return;
    const { error } = await supabase.rpc("close_handover_shift", { p_shift: shift.id, p_handed_to: handTo || null, p_note: note, p_at: (endAt ?? new Date()).toISOString() });
    if (error) return toast.error(t(errorKey(error)));
    setClosing(false);
    setNote("");
    setHandTo("");
    toast.success(handTo ? t("handover.shiftHandedOver", { name: nameOf(handTo) }) : t("handover.shiftClosed"));
    void load();
  }

  if (shift === undefined) return null;
  return (
    <div className={`shift-bar${shift ? " is-open" : ""}${fn === "float" ? " is-float" : ""}`} aria-label={fn === "float" ? t("handover.floatShift") : t("handover.officeShift")}>
      <span className="shift-fn mono">{fn === "float" ? "Float" : "Office"}</span>
      {shift ? (
        <>
          <span className="shift-dot" aria-hidden="true" />
          <span><strong>{t(fn === "float" ? "handover.floatShiftOf" : "handover.shiftOf", { name: nameOf(shift.staff_id) })}</strong> <span className="mono muted">{t("today.since", { time: formatTime(shift.opened_at, locale) })}</span></span>
          <button className={fn === "float" ? "" : "primary"} onClick={() => { setEndAt(new Date()); setClosing(true); }}>{fn === "float" ? t("handover.closeFloat") : t("handover.closeShift")}</button>
        </>
      ) : (
        <>
          <span><strong>{fn === "float" ? t("handover.noFloatShift") : t("handover.noShift")}</strong> <span className="muted">{fn === "float" ? t("handover.noFloatShiftHint") : t("handover.noShiftHint")}</span></span>
          <label className="inline">
            {t("handover.takingOver")}
            <select value={who || rostered} onChange={(e) => setWho(e.target.value)}>
              <option value="">{t("handover.chooseWhoTakesOver")}</option>
              {fillers.map((s) => <option key={s.id} value={s.id}>{staffName(s)}{s.id === rostered ? ` · ${t("handover.onRoster")}` : ""}</option>)}
            </select>
          </label>
          <label className="inline">
            {t("handover.startedAt")}
            <DateTimeInput value={startAt} onChange={setStartAt} required />
          </label>
          <button className={fn === "float" ? "" : "primary"} disabled={!(who || rostered) || !startAt} onClick={() => void open()}>{fn === "float" ? t("handover.openFloat") : t("handover.openShift")}</button>
        </>
      )}
      {closing && shift && (
        <Dialog
          title={fn === "float" ? t("handover.closeFloat") : t("handover.closeShift")}
          onClose={() => setClosing(false)}
          footer={<><DialogCancel>{t("app.cancel")}</DialogCancel><button className="primary" onClick={() => void close()}>{handTo ? t("handover.handOver") : t("handover.closeOnly")}</button></>}
        >
          <div className="form">
            <p className="muted">{t("handover.closeHint", { name: nameOf(shift.staff_id) })}</p>
            <label>
              {t("handover.handTo")}
              <select value={handTo} onChange={(e) => setHandTo(e.target.value)} autoFocus>
                <option value="">{t("handover.nobodyYet")}</option>
                {fillers.filter((s) => s.id !== shift.staff_id).map((s) => <option key={s.id} value={s.id}>{staffName(s)}</option>)}
              </select>
            </label>
            <label>
              {handTo ? t("handover.handOverAt") : t("handover.endedAt")}
              <DateTimeInput value={endAt} onChange={setEndAt} required />
            </label>
            <label>{t("handover.closeNote")} <small>({t("app.optional")})</small><textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></label>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function Composer({
  lodgeId,
  shiftStaff,
  residents,
  onPosted,
  onMaintenance,
  onWarning,
}: {
  lodgeId: string;
  shiftStaff?: string | null;
  residents: ReturnType<typeof useOccupancy>["beds"];
  onPosted: () => void;
  onMaintenance: () => void;
  onWarning: () => void;
}) {
  const { t } = useI18n();
  const { isManagement, isStation, serverOffsetMs } = useAuth();
  const staffList = useStaffList();
  const { posts } = useOnDuty();
  // Beta: quem está preenchendo — começa com a pessoa escalada no Roster; dá para trocar.
  // Quem está no turno aberto vem primeiro; sem turno aberto, a pessoa escalada no Roster.
  const rostered = shiftStaff ?? onDutyFor(posts, lodgeId)?.staff_id ?? "";
  const [filledBy, setFilledBy] = useState<string | null>(null);
  const fillers = staffList.filter((s) => FILLER_ROLES.includes(s.role));
  const chosenFiller = filledBy ?? rostered;
  const [coAuthorIds, setCoAuthorIds] = useState<string[]>([]);
  const [body, setBody] = useState("");
  const [occurredAt, setOccurredAt] = useState<Date | null>(null);
  const [reason, setReason] = useState("");
  const [reasons, setReasons] = useState<string[]>([]);
  const tags = useHandoverTags(true);
  const [chosenTags, setChosenTags] = useState<string[]>([]);
  const [picked, setPicked] = useState<Suggestion[]>([]);
  const [query, setQuery] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
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
      p_filled_by: chosenFiller || null,
      p_tags: chosenTags,
      // Só envia colegas quando há (compatível com a assinatura anterior durante a atualização).
      ...(chosenFiller && coAuthorIds.length ? { p_co_authors: coAuthorIds } : {}),
    });
    setBusy(false);
    if (err) return setError(t(errorKey(err)));
    setBody("");
    setChosenTags([]);
    setCoAuthorIds([]);
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
      {tags.length > 0 && (
        <div className="phrase-chips tag-chips" role="group" aria-label={t("handover.tags")}>
          {tags.map((g) => {
            const on = chosenTags.includes(g.id);
            return (
              <button key={g.id} type="button" className={`chip tag-c-${g.color}${on ? " is-on" : ""}`} aria-pressed={on}
                onClick={() => setChosenTags((x) => (on ? x.filter((y) => y !== g.id) : [...x, g.id]))}>
                {g.label}
              </button>
            );
          })}
        </div>
      )}
      <div className="composer-bar">
        <StaffPicker
          people={fillers.map((p) => ({ id: p.id, name: staffName(p) }))}
          author={filledBy}
          rosteredId={rostered}
          coAuthors={chosenFiller ? coAuthorIds : []}
          onAuthor={setFilledBy}
          onCoAuthors={setCoAuthorIds}
          required={isStation}
        />
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
          <button type="submit" className="primary" disabled={busy || !body.trim() || (late && !reason) || (isStation && !chosenFiller)}>{t("handover.post")}</button>
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
