import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { roomLabel } from "@/lib/rooms";
import { formatCivilDate, formatDate } from "@/lib/time";
import { residentName, type BedOccupancy } from "@/lib/types";
import { useOccupancy } from "@/lib/useOccupancy";
import { AdmitDialog } from "@/components/AdmitDialog";

type Former = {
  id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  pass_id: string | null;
  stays: { status: string; ended_at: string | null; lodge_id: string }[];
};

function matches(term: string, ...values: Array<string | null | undefined>) {
  const needle = term.trim().toLowerCase();
  if (!needle) return true;
  return values.some((v) => v?.toLowerCase().includes(needle));
}

export function Residents() {
  const { t, locale } = useI18n();
  const { lodges, isManagement, post } = useAuth();
  const navigate = useNavigate();
  const { beds, reload } = useOccupancy();
  const [lodgeFilter, setLodgeFilter] = useState<string>("");
  const [status, setStatus] = useState<"current" | "past">("current");
  const [term, setTerm] = useState("");
  const [former, setFormer] = useState<Former[]>([]);
  const [admitting, setAdmitting] = useState(false);
  const canAdmit = isManagement || !!post;

  useEffect(() => {
    if (status !== "past") return;
    void supabase
      .from("residents")
      .select("id, first_name, last_name, date_of_birth, pass_id, stays(status, ended_at, lodge_id)")
      .order("last_name")
      .limit(500)
      .then(({ data }) => setFormer(((data ?? []) as Former[]).filter((r) => r.stays.length > 0 && r.stays.every((s) => s.status === "ended"))));
  }, [status]);

  const current = useMemo(
    () =>
      beds
        .filter((b): b is BedOccupancy & { resident_id: string } => !!b.resident_id)
        .filter((b) => !lodgeFilter || b.lodge_id === lodgeFilter)
        .filter((b) => matches(term, b.first_name, b.last_name, b.pass_id, b.room_code, `${b.first_name} ${b.last_name}`)),
    [beds, lodgeFilter, term],
  );

  const past = useMemo(
    () =>
      former
        .filter((r) => !lodgeFilter || r.stays.some((s) => s.lodge_id === lodgeFilter))
        .filter((r) => matches(term, r.first_name, r.last_name, r.pass_id, `${r.first_name} ${r.last_name}`)),
    [former, lodgeFilter, term],
  );

  const lodgeName = (id: string) => lodges.find((l) => l.id === id)?.short_name ?? "";

  return (
    <section className="page">
      <header className="page-header">
        <h1>{t("residents.title")}</h1>
        {canAdmit && (
          <button className="primary" onClick={() => setAdmitting(true)}>
            {t("residents.admit")}
          </button>
        )}
      </header>

      <div className="toolbar">
        <input type="search" placeholder={t("residents.searchPlaceholder")} value={term} onChange={(e) => setTerm(e.target.value)} autoFocus />
        <select value={lodgeFilter} onChange={(e) => setLodgeFilter(e.target.value)} aria-label={t("residents.filterLodge")}>
          <option value="">{t("app.all")}</option>
          {lodges.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
        <div className="segmented">
          <button className={status === "current" ? "selected" : ""} onClick={() => setStatus("current")}>{t("residents.statusCurrent")}</button>
          <button className={status === "past" ? "selected" : ""} onClick={() => setStatus("past")}>{t("residents.statusPast")}</button>
        </div>
      </div>

      {status === "current" ? (
        <table className="table">
          <thead>
            <tr>
              <th>{t("residents.room")}</th>
              <th>{t("residents.bed")}</th>
              <th>{t("residents.name")}</th>
              <th>{t("residents.dateOfBirth")}</th>
              <th>{t("residents.passId")}</th>
              <th>{t("residents.lodge")}</th>
              <th>{t("residents.admitted")}</th>
            </tr>
          </thead>
          <tbody>
            {current.map((b) => (
              <tr key={b.bed_id} className="clickable" onClick={() => navigate(`/residents/${b.resident_id}`)}>
                <td className="room-cell">{roomLabel(t, b.room_kind, b.room_code)}</td>
                <td>{b.bed_number}</td>
                <td>
                  <Link to={`/residents/${b.resident_id}`}>{residentName(b)}</Link>
                  {b.stay_status === "out_pending" && <span className="tag">{t("residents.stayOutPending")}</span>}
                </td>
                <td>{formatCivilDate(b.date_of_birth, locale)}</td>
                <td>{b.pass_id ?? ""}</td>
                <td>{lodgeName(b.lodge_id)}</td>
                <td>{b.admitted_at ? formatDate(b.admitted_at, locale) : ""}</td>
              </tr>
            ))}
            {current.length === 0 && (
              <tr><td colSpan={7} className="muted">{t("residents.empty")}</td></tr>
            )}
          </tbody>
        </table>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>{t("residents.name")}</th>
              <th>{t("residents.dateOfBirth")}</th>
              <th>{t("residents.passId")}</th>
              <th>{t("residents.ended")}</th>
            </tr>
          </thead>
          <tbody>
            {past.map((r) => {
              const last = [...r.stays].sort((a, b) => (b.ended_at ?? "").localeCompare(a.ended_at ?? ""))[0];
              return (
                <tr key={r.id} className="clickable" onClick={() => navigate(`/residents/${r.id}`)}>
                  <td><Link to={`/residents/${r.id}`}>{residentName(r)}</Link></td>
                  <td>{formatCivilDate(r.date_of_birth, locale)}</td>
                  <td>{r.pass_id ?? ""}</td>
                  <td>{last?.ended_at ? `${formatDate(last.ended_at, locale)} · ${lodgeName(last.lodge_id)}` : ""}</td>
                </tr>
              );
            })}
            {past.length === 0 && (
              <tr><td colSpan={4} className="muted">{t("residents.empty")}</td></tr>
            )}
          </tbody>
        </table>
      )}

      {admitting && (
        <AdmitDialog
          onClose={() => setAdmitting(false)}
          onDone={(id) => {
            setAdmitting(false);
            void reload();
            if (id) navigate(`/residents/${id}`);
          }}
        />
      )}
    </section>
  );
}
