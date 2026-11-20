import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { useLatestRequest } from "@/lib/useLatestRequest";
import { errorKey } from "@/lib/errors";
import { monthCountLabel, noShowReviewDay } from "@/lib/presence";
import { roomLabel } from "@/lib/rooms";
import { formatCivilDate } from "@/lib/time";
import { residentName } from "@/lib/types";
import { Dialog, DialogCancel } from "@/components/Dialog";
import { LodgeTabs, useDefaultLodge } from "@/components/LodgeTabs";
import { Notice } from "@/components/Notice";
import { Skeleton } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";

type Candidate = {
  stay_id: string;
  resident_id: string;
  first_name: string;
  last_name: string;
  room_kind: "room" | "apartment";
  room_code: string;
  bed_number: number;
  month_count: number;
};

type Confirmed = {
  id: string;
  resident_id: string;
  first_name: string;
  last_name: string;
  status: "confirmed" | "undone";
  undo_reason: string | null;
  month_count: number;
};

export type Review = {
  operational_day: string;
  day_finished: boolean;
  complete: boolean;
  pending_slots: string[];
  candidates: Candidate[];
  confirmed: Confirmed[];
};

/** Lista final das 06h30 (s.5): o Office revisa, edita e confirma; contador por mês do calendário. */
export function NoShows() {
  const { t, locale } = useI18n();
  const { canWriteLodge, isManagement, serverOffsetMs } = useAuth();
  const [lodgeId, setLodgeId] = useState(useDefaultLodge());
  const [day, setDay] = useState(() => noShowReviewDay(new Date(Date.now() + serverOffsetMs)));
  const [review, setReview] = useState<Review | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<string[]>([]);
  const [undoing, setUndoing] = useState<Confirmed | null>(null);
  const [reason, setReason] = useState("");
  const [limit, setLimit] = useState(3);
  const toast = useToast();

  const begin = useLatestRequest();
  const load = useCallback(async () => {
    const isLatest = begin();
    const { data, error: e } = await supabase.rpc("no_show_review", { p_lodge: lodgeId, p_day: day });
    if (!isLatest()) return;
    if (e) return setError(t(errorKey(e)));
    const r = data as Review;
    setReview(r);
    setSelected(new Set(r.candidates.map((c) => c.stay_id)));
  }, [lodgeId, day, t, begin]);

  useEffect(() => {
    setMessages([]);
    setError(null);
    void load();
    void supabase.rpc("param_value", { p_key: "presence.no_show_monthly_alert" }).then(({ data }) => {
      if (typeof data === "number") setLimit(data);
    });
  }, [load]);

  const canConfirm = !!review && review.complete && review.day_finished && canWriteLodge(lodgeId) && selected.size > 0;

  async function confirm() {
    if (!review) return;
    setBusy(true);
    setError(null);
    const { data, error: e } = await supabase.rpc("confirm_no_shows", { p_lodge: lodgeId, p_day: day, p_stays: [...selected] });
    setBusy(false);
    if (e) return setError(t(errorKey(e)));
    const results = data as { stay_id: string; month_count: number }[];
    toast.success(t("noShows.confirmedOk"));
    const notes: string[] = [];
    for (const r of results) {
      if (r.month_count >= limit) {
        const c = review.candidates.find((x) => x.stay_id === r.stay_id);
        if (c) notes.push(t("noShows.limitReached", { name: residentName(c), count: r.month_count }));
      }
    }
    setMessages(notes);
    await load();
  }

  async function undo() {
    if (!undoing) return;
    const { error: e } = await supabase.rpc("undo_no_show", { p_id: undoing.id, p_reason: reason });
    if (e) return setError(t(errorKey(e)));
    setUndoing(null);
    setReason("");
    await load();
  }

  function toggle(stayId: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(stayId)) next.delete(stayId);
      else next.add(stayId);
      return next;
    });
  }

  return (
    <section className="page">
      <header className="page-header">
        <h1>{t("noShows.title")}</h1>
        <LodgeTabs value={lodgeId} onChange={setLodgeId} />
      </header>

      <div className="toolbar">
        <label className="inline">
          {t("sheet.day")}
          <input type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
        </label>
        <strong>{t("noShows.reviewOf", { date: formatCivilDate(day, locale) })}</strong>
      </div>

      {messages.map((m) => (
        <Notice key={m} kind="warning">{m}</Notice>
      ))}
      {!review && !error && <div className="card"><Skeleton rows={5} label={t("app.loading")} /></div>}
      <Notice kind="error">{error}</Notice>

      {review && (
        <>
          {!review.day_finished && <Notice kind="info">{t("noShows.notFinished")}</Notice>}
          {!review.complete && (
            <Notice kind="warning">
              {t("noShows.incomplete", { slots: review.pending_slots.join(", ") })} <Link to="/sheet">{t("nav.sheet")} →</Link>
            </Notice>
          )}

          <h2>{t("noShows.candidates")}</h2>
          {review.candidates.length === 0 ? (
            <p className="muted">{t("noShows.noCandidates")}</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th />
                  <th>{t("sheet.room")}</th>
                  <th>{t("sheet.bed")}</th>
                  <th>{t("sheet.resident")}</th>
                  <th>{t("noShows.month")}</th>
                </tr>
              </thead>
              <tbody>
                {review.candidates.map((c) => (
                  <tr key={c.stay_id}>
                    <td>
                      <input type="checkbox" aria-label={residentName(c)} checked={selected.has(c.stay_id)} onChange={() => toggle(c.stay_id)} />
                    </td>
                    <td className="room-cell">{roomLabel(t, c.room_kind, c.room_code)}</td>
                    <td>{c.bed_number}</td>
                    <td>
                      <Link to={`/residents/${c.resident_id}`}>{residentName(c)}</Link>
                    </td>
                    <td>{monthCountLabel(c.month_count, limit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {review.candidates.length > 0 && canWriteLodge(lodgeId) && (
            <div className="button-row">
              <button className="primary" disabled={busy || !canConfirm} onClick={() => void confirm()}>
                {t("noShows.confirm")}
              </button>
            </div>
          )}

          {review.confirmed.length > 0 && (
            <>
              <h2>{t("noShows.confirmed")}</h2>
              <table className="table">
                <tbody>
                  {review.confirmed.map((c) => (
                    <tr key={c.id} className={c.status === "undone" ? "row-inactive" : ""}>
                      <td>
                        <Link to={`/residents/${c.resident_id}`}>{residentName(c)}</Link>
                      </td>
                      <td>{c.status === "confirmed" ? monthCountLabel(c.month_count, limit) : `${t("noShows.undone")} — ${c.undo_reason ?? ""}`}</td>
                      <td>
                        {isManagement && c.status === "confirmed" && (
                          <button className="small" onClick={() => setUndoing(c)}>{t("noShows.undo")}</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </>
      )}

      {undoing && (
        <Dialog
          title={t("noShows.undoTitle")}
          onClose={() => setUndoing(null)}
          footer={
            <>
              <DialogCancel>{t("app.cancel")}</DialogCancel>
              <button className="primary" disabled={!reason.trim()} onClick={() => void undo()}>{t("noShows.undo")}</button>
            </>
          }
        >
          <p>{residentName(undoing)}</p>
          <label className="form">
            {t("noShows.undoReason")}
            <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
          </label>
        </Dialog>
      )}
    </section>
  );
}
