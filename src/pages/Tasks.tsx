import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { errorKey } from "@/lib/errors";
import { durationLabel, pickTitle } from "@/lib/occurrences";
import { formatCivilDate, formatTime, operationalDay, shiftOf } from "@/lib/time";
import { staffName } from "@/lib/types";
import { useLatestRequest } from "@/lib/useLatestRequest";
import { useStaffList } from "@/lib/useStaffList";
import { DateTimeInput } from "@/components/DateTimeInput";
import { Dialog, DialogCancel } from "@/components/Dialog";
import { LodgeTabs } from "@/components/LodgeTabs";
import { useLodgeState } from "@/lib/activeLodge";
import { Notice } from "@/components/Notice";
import { Skeleton } from "@/components/Skeleton";
import { Tabs } from "@/components/Tabs";
import { useToast } from "@/components/Toast";

type Signature = { staff_id: string; duty_function: string; signed_at: string };
export type ShiftTask = {
  kind: "template" | "extra";
  task_id: string;
  title: Record<string, string>;
  suggested_time: string | null;
  staff_id: string | null;
  due_at: string | null;
  signatures: Signature[];
};
type PendingTask = {
  kind: "template" | "extra";
  task_id: string;
  title: Record<string, string>;
  operational_day: string;
  shift: "day" | "night";
  staff_id: string | null;
  overdue: boolean;
  overdue_since: string | null;
};

/** Daily Tasks (s.7): tarefas do turno por modelo e extras; assinatura com hora real; pendentes não somem. */
export function Tasks() {
  const { t, locale } = useI18n();
  const { canWriteLodge, isManagement, serverOffsetMs } = useAuth();
  const toast = useToast();
  const staffList = useStaffList();
  const now = new Date(Date.now() + serverOffsetMs);
  const [lodgeId, setLodgeId] = useLodgeState();
  const [day, setDay] = useState(() => operationalDay(now));
  const [shift, setShift] = useState<"day" | "night">(() => shiftOf(now));
  const [tasks, setTasks] = useState<ShiftTask[] | null>(null);
  const [pending, setPending] = useState<PendingTask[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [addingRecurring, setAddingRecurring] = useState(false);
  // Revisão 25/11: a conta da casa assina em nome de quem está no turno aberto (ou de quem for escolhido).
  const [signer, setSigner] = useState("");
  const [shiftPerson, setShiftPerson] = useState("");
  const people = staffList.filter((p) => ["porter", "manager", "owner", "developer"].includes(p.role));
  const [error, setError] = useState<string | null>(null);
  const begin = useLatestRequest();
  const canWrite = canWriteLodge(lodgeId);

  useEffect(() => {
    void supabase.from("handover_shifts").select("staff_id").eq("lodge_id", lodgeId).is("closed_at", null).limit(1)
      .then(({ data }) => setShiftPerson(((data ?? []) as { staff_id: string }[])[0]?.staff_id ?? ""));
  }, [lodgeId]);

  const load = useCallback(async () => {
    const isLatest = begin();
    setTasks(null);
    const [{ data, error: e }, { data: p }] = await Promise.all([
      supabase.rpc("shift_tasks", { p_lodge: lodgeId, p_day: day, p_shift: shift }),
      supabase.rpc("pending_tasks", { p_lodge: lodgeId }),
    ]);
    if (!isLatest()) return;
    if (e) setError(t(errorKey(e)));
    setTasks((data ?? []) as ShiftTask[]);
    setPending(((p ?? []) as PendingTask[]).filter((x) => x.overdue));
  }, [lodgeId, day, shift, t, begin]);

  useEffect(() => {
    void load();
  }, [load]);

  async function sign(kind: string, taskId: string, d = day, s = shift) {
    setBusyId(taskId);
    const { error: e } = await supabase.rpc("sign_task", { p_kind: kind, p_task: taskId, p_lodge: lodgeId, p_day: d, p_shift: s, p_signed_by: (signer || shiftPerson) || null });
    setBusyId(null);
    if (e) return toast.error(t(errorKey(e)));
    toast.success(t("tasks.signed"));
    await load();
  }

  async function reassign(taskId: string) {
    const { error: e } = await supabase.rpc("reassign_extra_task", { p_extra: taskId });
    if (e) return toast.error(t(errorKey(e)));
    toast.success(t("residents.saved"));
    await load();
  }

  const nameOf = (id: string | null) => staffName(staffList.find((s) => s.id === id)) || "—";
  // Função de quem assinou: Office / Float (termos de trabalho) ou o perfil.
  const functionLabel = (f: string) =>
    f === "office" ? "Office" : f === "float" ? "Float" : ["manager", "owner", "developer", "porter"].includes(f) ? t(`users.roles.${f as "manager"}`) : f;
  const done = tasks?.filter((x) => x.signatures.length > 0).length ?? 0;

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <span className="eyebrow">{formatCivilDate(day, locale)} · {shift === "day" ? t("today.shiftDay") : t("today.shiftNight")}</span>
          <h1>{t("tasks.title")}</h1>
        </div>
        <LodgeTabs value={lodgeId} onChange={setLodgeId} />
      </header>

      <div className="toolbar">
        <input type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} aria-label={t("sheet.day")} />
        <Tabs
          size="sm"
          label={t("tasks.title")}
          value={shift}
          onChange={(v) => setShift(v as "day" | "night")}
          items={[
            { value: "day", label: t("tasks.shiftDay") },
            { value: "night", label: t("tasks.shiftNight") },
          ]}
        />
        {tasks && <span className="progress-text">{done}/{tasks.length}</span>}
        {canWrite && !isManagement && (
          <label className="inline">
            {t("tasks.signingAs")}
            <select value={signer || shiftPerson} onChange={(e) => setSigner(e.target.value)}>
              <option value="">{t("handover.filledByChoose")}</option>
              {people.map((p) => <option key={p.id} value={p.id}>{staffName(p)}{p.id === shiftPerson ? ` · ${t("tasks.onShift")}` : ""}</option>)}
            </select>
          </label>
        )}
        {isManagement && <button onClick={() => setAddingRecurring(true)}>{t("tasks.addRecurring")}</button>}
        {isManagement && <button className="primary" onClick={() => setAdding(true)}>{t("tasks.addExtra")}</button>}
      </div>
      <Notice kind="error">{error}</Notice>

      {tasks === null ? (
        <div className="card"><Skeleton rows={8} label={t("app.loading")} /></div>
      ) : tasks.length === 0 ? (
        <div className="card empty-state"><p className="muted">{t("tasks.none")}</p></div>
      ) : (
        <ul className="task-list">
          {tasks.map((task) => {
            const signed = task.signatures.length > 0;
            return (
              <li key={`${task.kind}-${task.task_id}`} className={`task-item${signed ? " is-done" : ""}`}>
                <span className="task-check" aria-hidden="true">{signed ? "✓" : ""}</span>
                <div className="task-main">
                  <span className="task-title">{pickTitle(task.title, locale)}</span>
                  <span className="task-meta">
                    {task.suggested_time && t("tasks.suggested", { time: task.suggested_time })}
                    {task.staff_id && <span className="tag tag-kind">{t("tasks.forPerson", { name: nameOf(task.staff_id) })}</span>}
                    {task.signatures.map((s) => (
                      <span key={s.staff_id} className="sig">
                        {t("tasks.signedBy", { name: nameOf(s.staff_id), function: functionLabel(s.duty_function), time: formatTime(s.signed_at, locale) })}
                      </span>
                    ))}
                  </span>
                </div>
                <div className="task-actions">
                  {isManagement && task.kind === "extra" && task.staff_id && !signed && (
                    <button className="small ghost" onClick={() => void reassign(task.task_id)}>{t("tasks.reassign")}</button>
                  )}
                  {canWrite && (
                    <button className={signed ? "small" : "small primary"} disabled={busyId === task.task_id} onClick={() => void sign(task.kind, task.task_id)}>
                      {t("tasks.sign")}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {pending.length > 0 && (
        <>
          <h2 className="section-title">{t("tasks.pending")}</h2>
          <ul className="task-list">
            {pending.map((p) => (
              <li key={`${p.task_id}-${p.operational_day}-${p.shift}`} className="task-item is-late">
                <span className="task-check" aria-hidden="true">!</span>
                <div className="task-main">
                  <span className="task-title">{pickTitle(p.title, locale)}</span>
                  <span className="task-meta">
                    {formatCivilDate(p.operational_day, locale)} · {p.shift === "day" ? t("tasks.shiftDay") : t("tasks.shiftNight")} ·{" "}
                    <span className="warn-text">{t("tasks.overdueFor", { time: durationLabel(now.getTime() - new Date(p.overdue_since ?? now).getTime()) })}</span>
                  </span>
                </div>
                {canWrite && (
                  <div className="task-actions">
                    <button className="small primary" onClick={() => void sign(p.kind, p.task_id, p.operational_day, p.shift)}>{t("tasks.sign")}</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {addingRecurring && (
        <RecurringTaskDialog
          lodgeId={lodgeId}
          onClose={() => setAddingRecurring(false)}
          onDone={() => {
            setAddingRecurring(false);
            toast.success(t("tasks.recurringSaved"));
            void load();
          }}
        />
      )}
      {adding && (
        <ExtraTaskDialog
          lodgeId={lodgeId}
          day={day}
          shift={shift}
          onClose={() => setAdding(false)}
          onDone={() => {
            setAdding(false);
            toast.success(t("tasks.created"));
            void load();
          }}
        />
      )}
    </section>
  );
}

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];

/** Tarefa recorrente (modelo): vale para o turno nos dias da semana escolhidos (nenhum = todos os dias). */
function RecurringTaskDialog({ lodgeId, onClose, onDone }: { lodgeId: string; onClose: () => void; onDone: () => void }) {
  const { t, locale } = useI18n();
  const [title, setTitle] = useState("");
  const [shift, setShift] = useState<"day" | "night">("day");
  const [days, setDays] = useState<number[]>([]);
  const [time, setTime] = useState("");
  const [error, setError] = useState<string | null>(null);
  const dayName = (d: number) => new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, d)));
  async function submit() {
    const { error: err } = await supabase.rpc("create_task_template", {
      p_lodge: lodgeId, p_shift: shift, p_weekdays: days.length ? days : null, p_title: { "en-IE": title.trim() }, p_sort: 100, p_suggested_time: time || null,
    });
    if (err) return setError(t(errorKey(err)));
    onDone();
  }
  return (
    <Dialog title={t("tasks.addRecurring")} onClose={onClose} footer={<><DialogCancel>{t("app.cancel")}</DialogCancel><button className="primary" disabled={!title.trim()} onClick={() => void submit()}>{t("app.save")}</button></>}>
      <div className="form">
        <label>{t("tasks.extraTitle")}<input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus /></label>
        <div className="form-grid">
          <label>
            {t("tasks.shift")}
            <select value={shift} onChange={(e) => setShift(e.target.value as "day" | "night")}>
              <option value="day">{t("tasks.day")}</option>
              <option value="night">{t("tasks.night")}</option>
            </select>
          </label>
          <label>{t("tasks.suggestedTime")} <small>({t("app.optional")})</small><input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label>
        </div>
        <fieldset className="chip-row">
          <legend className="small-text muted">{t("tasks.weekdays")}</legend>
          {WEEKDAYS.map((d) => (
            <button key={d} type="button" className={`chip${days.includes(d) ? " is-on" : ""}`} aria-pressed={days.includes(d)}
              onClick={() => setDays((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d].sort()))}>{dayName(d)}</button>
          ))}
        </fieldset>
        <p className="hint">{t("tasks.weekdaysHint")}</p>
        <Notice kind="error">{error}</Notice>
      </div>
    </Dialog>
  );
}

function ExtraTaskDialog({ lodgeId, day, shift, onClose, onDone }: { lodgeId: string; day: string; shift: string; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const staffList = useStaffList();
  const [title, setTitle] = useState("");
  const [staffId, setStaffId] = useState("");
  const [due, setDue] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const { error: err } = await supabase.rpc("create_extra_task", {
      p_lodge: lodgeId,
      p_day: day,
      p_shift: shift,
      p_staff: staffId || null,
      p_title: title,
      p_due_at: due ? due.toISOString() : null,
    });
    if (err) return setError(t(errorKey(err)));
    onDone();
  }

  return (
    <Dialog
      title={t("tasks.addExtra")}
      onClose={onClose}
      footer={
        <>
          <DialogCancel>{t("app.cancel")}</DialogCancel>
          <button type="submit" form="extra-form" className="primary" disabled={!title.trim()}>{t("app.save")}</button>
        </>
      }
    >
      <form id="extra-form" className="form" onSubmit={submit}>
        <label>
          {t("tasks.extraTitle")}
          <input required value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </label>
        <label>
          {t("tasks.extraFor")}
          <select value={staffId} onChange={(e) => setStaffId(e.target.value)}>
            <option value="">{t("tasks.wholeShift")}</option>
            {staffList.filter((s) => s.role !== "station").map((s) => <option key={s.id} value={s.id}>{staffName(s)}</option>)}
          </select>
        </label>
        <label>
          {t("tasks.dueAt")} <small>({t("app.optional")})</small>
          <DateTimeInput value={due} onChange={setDue} />
        </label>
        <Notice kind="error">{error}</Notice>
      </form>
    </Dialog>
  );
}
