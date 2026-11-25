import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n, type MessageKey } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { useLatestRequest } from "@/lib/useLatestRequest";
import { useOccupancy } from "@/lib/useOccupancy";
import { errorKey } from "@/lib/errors";
import { roomLabel } from "@/lib/rooms";
import { operationalDay, shiftOf } from "@/lib/time";
import { residentName } from "@/lib/types";
import { AnticipateDialog } from "@/components/AnticipateDialog";
import { DateTimeInput } from "@/components/DateTimeInput";
import { Dialog, DialogCancel } from "@/components/Dialog";
import { LodgeTabs } from "@/components/LodgeTabs";
import { useLodgeState } from "@/lib/activeLodge";
import { Notice } from "@/components/Notice";
import { Tabs } from "@/components/Tabs";
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

/**
 * Seen (revisão 25/11): um check por turno — Seen Day e Seen Night. Cada residente aparece com o que já o
 * conta como visto (Room Check, Dinner, entrada no Lodge, Seen manual); um toque marca o Seen agora.
 * Quem não for visto no dia vira candidato a No Show.
 */
export function Seen() {
  const { t } = useI18n();
  const { canWriteLodge, serverOffsetMs } = useAuth();
  const now = new Date(Date.now() + serverOffsetMs);
  const today = operationalDay(now);
  const [lodgeId, setLodgeId] = useLodgeState();
  const [day, setDay] = useState(today);
  const [shift, setShift] = useState<"day" | "night">(() => shiftOf(now));
  const [onlyMissing, setOnlyMissing] = useState(true);
  const [rows, setRows] = useState<SeenRow[]>([]);
  const [recording, setRecording] = useState(false);
  const [anticipate, setAnticipate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
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
  const isSeen = (r: SeenRow) => (shift === "day" ? r.seen_day : r.seen_night);
  const srcOf = (r: SeenRow) => (shift === "day" ? r.day_sources : r.night_sources);
  const seenCount = rows.filter(isSeen).length;
  const seenAllDay = rows.filter((r) => r.seen_day || r.seen_night).length;
  // Marcar com um toque: só o turno em andamento (o horário fica "agora"). O resto, pelo Seen com horário.
  const live = canWriteLodge(lodgeId) && day === today && shift === shiftOf(now);
  const list = onlyMissing ? rows.filter((r) => !isSeen(r)) : rows;

  async function markSeen(r: SeenRow) {
    setBusy(r.stay_id);
    const { data, error: e } = await supabase.rpc("record_sighting", { p_resident: r.resident_id, p_lodge: lodgeId, p_seen_at: null, p_place: "" });
    setBusy(null);
    if (e) return toast.error(t(errorKey(e)));
    const info = data as { absence_active: boolean; absence_id: string | null };
    if (info.absence_active && info.absence_id) setAnticipate(info.absence_id);
    void load();
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <span className="eyebrow">{t("seen.eyebrow")}</span>
          <h1>{t("seen.title")}</h1>
        </div>
        <LodgeTabs value={lodgeId} onChange={setLodgeId} />
      </header>
      <div className="toolbar">
        <Tabs label={t("seen.title")} value={shift} onChange={(v) => setShift(v as "day" | "night")}
          items={[{ value: "day", label: t("seen.seenDay") }, { value: "night", label: t("seen.seenNight") }]} />
        <label className="inline">
          {t("sheet.day")}
          <input type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
        </label>
        <label className="inline check-toggle">
          <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
          {t("seen.onlyMissing")}
        </label>
        {canWriteLodge(lodgeId) && <button onClick={() => setRecording(true)}>{t("seen.record")}</button>}
      </div>

      <div className="seen-meter card">
        <div>
          <span className="big-number">{seenCount}</span><span className="muted"> / {rows.length} {t("seen.seenThisShift")}</span>
          <div className="meter" aria-hidden="true"><span style={{ width: `${rows.length ? (seenCount / rows.length) * 100 : 0}%` }} /></div>
        </div>
        <div className="seen-meter-side">
          <span className="mono">{rows.length - seenAllDay}</span> <span className="muted">{t("seen.notSeenToday")}</span>
          <Link to="/no-shows" className="small-text">{t("seen.toNoShows")}</Link>
        </div>
      </div>
      {!live && day === today && <p className="hint">{t("seen.otherShiftHint")}</p>}
      <Notice kind="error">{error}</Notice>

      {loading && rows.length === 0 ? <div className="card"><Skeleton rows={8} label={t("app.loading")} /></div> : list.length === 0 ? (
        <div className="card empty-state"><p>{t("seen.allSeen")}</p></div>
      ) : (
        <ul className="seen-list">
          {list.map((r) => (
            <li key={r.stay_id} className={`seen-row${isSeen(r) ? " is-seen" : ""}`}>
              <span className="seen-room mono">{roomLabel(t, r.room_kind, r.room_code)} · {r.bed_number}</span>
              <Link className="seen-name" to={`/residents/${r.resident_id}`}>{residentName(r)}</Link>
              {isSeen(r) ? (
                <span className="seen-state ok-text">✓ {sources(srcOf(r))}</span>
              ) : (
                <button type="button" className="seen-btn" disabled={!live || busy === r.stay_id} onClick={() => void markSeen(r)} aria-label={`${t("seen.markSeen")} — ${residentName(r)}`}>
                  {t("seen.markSeen")}
                </button>
              )}
            </li>
          ))}
        </ul>
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
