import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useI18n } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { errorKey } from "@/lib/errors";
import { formatCivilDate, operationalDay } from "@/lib/time";
import { staffName, type StaffRole } from "@/lib/types";
import { Dialog, DialogCancel } from "@/components/Dialog";
import { Notice } from "@/components/Notice";
import { Skeleton } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";

type Vacation = { id: string; staff_id: string; starts_on: string; ends_on: string; note: string | null; status: "active" | "cancelled" };
type Person = { id: string; full_name: string; display_name: string | null; role: StaffRole };

/** Férias (s.14): registro pela gestão; conflito com a Rota avisa o Manager. */
export function Vacations() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [list, setList] = useState<Vacation[] | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [adding, setAdding] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from("vacations").select("id, staff_id, starts_on, ends_on, note, status").order("starts_on", { ascending: false }).limit(200);
    setList((data ?? []) as Vacation[]);
  }, []);

  useEffect(() => {
    void load();
    void supabase.from("staff").select("id, full_name, display_name, role").eq("active", true).order("full_name").then(({ data }) => setPeople((data ?? []) as Person[]));
  }, [load]);

  async function cancel(v: Vacation) {
    const { error } = await supabase.rpc("cancel_vacation", { p_id: v.id });
    if (error) return toast.error(t(errorKey(error)));
    await load();
  }

  const name = (id: string) => staffName(people.find((p) => p.id === id)) || "—";

  return (
    <section className="page">
      <header className="page-header">
        <h1>{t("vacations.title")}</h1>
        <button className="primary" onClick={() => setAdding(true)}>{t("vacations.register")}</button>
      </header>
      <Notice kind="warning">{conflict}</Notice>
      {list === null ? (
        <div className="card"><Skeleton rows={4} label={t("app.loading")} /></div>
      ) : list.length === 0 ? (
        <div className="card empty-state"><p className="muted">{t("vacations.empty")}</p></div>
      ) : (
        <table className="table table-cards">
          <tbody>
            {list.map((v) => (
              <tr key={v.id} className={v.status === "cancelled" ? "row-inactive" : ""}>
                <td className="cell-main"><strong>{name(v.staff_id)}</strong></td>
                <td>{formatCivilDate(v.starts_on, locale)} → {formatCivilDate(v.ends_on, locale)}</td>
                <td>{v.note}{v.status === "cancelled" && <span className="tag">{t("vacations.cancelled")}</span>}</td>
                <td className="actions">{v.status === "active" && <button className="small danger-outline" onClick={() => void cancel(v)}>{t("vacations.cancel")}</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {adding && (
        <VacationDialog
          people={people}
          onClose={() => setAdding(false)}
          onDone={(conflicts) => {
            setAdding(false);
            toast.success(t("vacations.saved"));
            setConflict(conflicts > 0 ? t("vacations.conflict", { n: conflicts }) : null);
            void load();
          }}
        />
      )}
    </section>
  );
}

function VacationDialog({ people, onClose, onDone }: { people: Person[]; onClose: () => void; onDone: (conflicts: number) => void }) {
  const { t } = useI18n();
  const today = operationalDay(new Date());
  const [staffId, setStaffId] = useState("");
  const [from, setFrom] = useState(today);
  const [until, setUntil] = useState(today);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const { data, error: err } = await supabase.rpc("register_vacation", { p_staff: staffId, p_start: from, p_end: until, p_note: note });
    if (err) return setError(t(errorKey(err)));
    onDone((data as { conflicts: number }).conflicts);
  }

  return (
    <Dialog
      title={t("vacations.register")}
      onClose={onClose}
      footer={
        <>
          <DialogCancel>{t("app.cancel")}</DialogCancel>
          <button type="submit" form="vacation-form" className="primary" disabled={!staffId || until < from}>{t("app.save")}</button>
        </>
      }
    >
      <form id="vacation-form" className="form" onSubmit={submit}>
        <label>
          {t("rota.staff")}
          <select required value={staffId} onChange={(e) => setStaffId(e.target.value)}>
            <option value="" />
            {people.map((p) => <option key={p.id} value={p.id}>{staffName(p)}</option>)}
          </select>
        </label>
        <div className="form-grid">
          <label>{t("vacations.from")}<input type="date" required value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label>{t("vacations.until")}<input type="date" required value={until} min={from} onChange={(e) => setUntil(e.target.value)} /></label>
        </div>
        <label>{t("vacations.note")} <small>({t("app.optional")})</small><input value={note} onChange={(e) => setNote(e.target.value)} /></label>
        <Notice kind="error">{error}</Notice>
      </form>
    </Dialog>
  );
}
