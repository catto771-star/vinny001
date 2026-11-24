import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n, type MessageKey } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { useLatestRequest } from "@/lib/useLatestRequest";
import { useOccupancy } from "@/lib/useOccupancy";
import { errorKey } from "@/lib/errors";
import { roomLabel } from "@/lib/rooms";
import { operationalDay } from "@/lib/time";
import { residentName } from "@/lib/types";
import { AnticipateDialog } from "@/components/AnticipateDialog";
import { DateTimeInput } from "@/components/DateTimeInput";
import { Dialog, DialogCancel } from "@/components/Dialog";
import { LodgeTabs } from "@/components/LodgeTabs";
import { useLodgeState } from "@/lib/activeLodge";
import { Notice } from "@/components/Notice";
import { Skeleton } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";

type SeenRow = {
  resident_id: string;
  stay_id: string;
  first_name: string;
  last_name: string;
  room_kind: "room" | "apartment";
  room_code: string;
  bed_number: number;
  seen_day: boolean;
  seen_night: boolean;
  day_sources: string[];
  night_sources: string[];
};

const SOURCE_KEY: Record<string, MessageKey> = {
  check: "seen.source_check",
  manual: "seen.source_manual",
  "check-in": "seen.source_check-in",
  dinner: "seen.source_dinner",
};

/** Seen Day / Seen Night (s.5): calculado de check positivo, Seen manual e entrada no Lodge. */
export function Seen() {
  const { t } = useI18n();
  const { canWriteLodge, serverOffsetMs } = useAuth();
  const [lodgeId, setLodgeId] = useLodgeState();
  const [day, setDay] = useState(() => operationalDay(new Date(Date.now() + serverOffsetMs)));
  const [rows, setRows] = useState<SeenRow[]>([]);
  const [recording, setRecording] = useState(false);
  const [anticipate, setAnticipate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const [loading, setLoading] = useState(true);

  const begin = useLatestRequest();
  const load = useCallback(async () => {
    const isLatest = begin();
    setLoading(true);
    const { data, error: e } = await supabase.rpc("seen_for_day", { p_lodge: lodgeId, p_day: day });
    if (!isLatest()) return;
    setLoading(false);
    if (e) return setError(t(errorKey(e)));
    setRows((data ?? []) as SeenRow[]);
  }, [lodgeId, day, t, begin]);

  useEffect(() => {
    void load();
  }, [load]);

  const sources = (list: string[]) => list.map((s) => (SOURCE_KEY[s] ? t(SOURCE_KEY[s]) : s)).join(", ");

  return (
    <section className="page">
      <header className="page-header">
        <h1>{t("seen.title")}</h1>
        <LodgeTabs value={lodgeId} onChange={setLodgeId} />
      </header>
      <div className="toolbar">
        <label className="inline">
          {t("sheet.day")}
          <input type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
        </label>
        {canWriteLodge(lodgeId) && (
          <button className="primary" onClick={() => setRecording(true)}>{t("seen.record")}</button>
        )}
      </div>
      <Notice kind="error">{error}</Notice>

      {loading && rows.length === 0 ? <div className="card"><Skeleton rows={8} label={t("app.loading")} /></div> : (
      <table className="table">
        <thead>
          <tr>
            <th>{t("sheet.room")}</th>
            <th>{t("sheet.bed")}</th>
            <th>{t("sheet.resident")}</th>
            <th>{t("seen.seenDay")}</th>
            <th>{t("seen.seenNight")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.stay_id}>
              <td className="room-cell">{roomLabel(t, r.room_kind, r.room_code)}</td>
              <td>{r.bed_number}</td>
              <td>
                <Link to={`/residents/${r.resident_id}`}>{residentName(r)}</Link>
              </td>
              <td className={r.seen_day ? "ok-text" : "muted"}>{r.seen_day ? `✓ ${sources(r.day_sources)}` : "—"}</td>
              <td className={r.seen_night ? "ok-text" : "muted"}>{r.seen_night ? `✓ ${sources(r.night_sources)}` : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      )}

      {recording && (
        <RecordSighting
          lodgeId={lodgeId}
          residents={rows}
          onClose={() => setRecording(false)}
          onDone={(absenceId) => {
            setRecording(false);
            toast.success(t("seen.recorded"));
            if (absenceId) setAnticipate(absenceId);
            void load();
          }}
        />
      )}
      {anticipate && <AnticipateDialog absenceId={anticipate} onClose={() => setAnticipate(null)} />}
    </section>
  );
}

function RecordSighting({
  lodgeId,
  residents,
  onClose,
  onDone,
}: {
  lodgeId: string;
  residents: SeenRow[];
  onClose: () => void;
  onDone: (absenceId: string | null) => void;
}) {
  const { t } = useI18n();
  // Só quem está no Lodge agora: quem já saiu aparece na tabela do dia, mas não pode ser "visto" de novo.
  const { beds } = useOccupancy(lodgeId);
  const current = new Set(beds.filter((b) => b.stay_id).map((b) => b.stay_id));
  const candidates = residents.filter((r) => current.has(r.stay_id));
  const [residentId, setResidentId] = useState("");
  const [at, setAt] = useState<Date | null>(new Date());
  const [place, setPlace] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const { data, error: e } = await supabase.rpc("record_sighting", {
      p_resident: residentId,
      p_lodge: lodgeId,
      p_seen_at: at ? at.toISOString() : null,
      p_place: place,
    });
    if (e) return setError(t(errorKey(e)));
    const r = data as { absence_active: boolean; absence_id: string | null };
    onDone(r.absence_active ? r.absence_id : null);
  }

  return (
    <Dialog
      title={t("seen.recordTitle")}
      onClose={onClose}
      footer={
        <>
          <DialogCancel>{t("app.cancel")}</DialogCancel>
          <button className="primary" disabled={!residentId} onClick={() => void submit()}>{t("app.save")}</button>
        </>
      }
    >
      <div className="form">
        <label>
          {t("sheet.resident")}
          <select value={residentId} onChange={(e) => setResidentId(e.target.value)} autoFocus>
            <option value="" />
            {candidates.map((r) => (
              <option key={r.stay_id} value={r.resident_id}>
                {roomLabel(t, r.room_kind, r.room_code)} · {r.bed_number} — {residentName(r)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("seen.when")}
          <DateTimeInput required value={at} onChange={setAt} />
        </label>
        <label>
          {t("seen.place")} <small>({t("app.optional")})</small>
          <input value={place} onChange={(e) => setPlace(e.target.value)} />
        </label>
        <Notice kind="error">{error}</Notice>
      </div>
    </Dialog>
  );
}
