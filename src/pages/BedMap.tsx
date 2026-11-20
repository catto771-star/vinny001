import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { errorKey } from "@/lib/errors";
import { roomLabel } from "@/lib/rooms";
import { formatCivilDate } from "@/lib/time";
import { residentName, type BedOccupancy } from "@/lib/types";
import { groupByRoom, summarise, useOccupancy } from "@/lib/useOccupancy";
import { AdmitDialog } from "@/components/AdmitDialog";
import { Dialog, DialogCancel } from "@/components/Dialog";
import { Notice } from "@/components/Notice";
import { LodgeTabs } from "@/components/LodgeTabs";
import { Skeleton } from "@/components/Skeleton";

/** Mapa de camas (s.11): cada cama ocupada, livre, fora de uso ou com Out pendente. */
export function BedMap() {
  const { t, locale } = useI18n();
  const { lodges, canWriteLodge, isManagement, post } = useAuth();
  const navigate = useNavigate();
  const [lodgeId, setLodgeId] = useState(post?.lodge_id ?? lodges[0]?.id ?? "");
  const { beds, reload, loading } = useOccupancy(lodgeId);
  const [admitBed, setAdmitBed] = useState<BedOccupancy | null>(null);
  const [manageBed, setManageBed] = useState<BedOccupancy | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const s = summarise(beds);

  function open(bed: BedOccupancy) {
    if (bed.resident_id) return navigate(`/residents/${bed.resident_id}`);
    if (isManagement) {
      setNote("");
      return setManageBed(bed);
    }
    if (bed.bed_status === "in_use" && canWriteLodge(bed.lodge_id)) setAdmitBed(bed);
  }

  async function setBedStatus(bed: BedOccupancy, status: "in_use" | "out_of_service") {
    const { data: current } = await supabase.from("beds").select("version").eq("id", bed.bed_id).single();
    const { error: updateError } = await supabase
      .from("beds")
      .update({ status, status_note: status === "out_of_service" ? note.trim() || null : null, version: (current as { version: number } | null)?.version })
      .eq("id", bed.bed_id);
    if (updateError) return setError(t(errorKey(updateError)));
    setManageBed(null);
    await reload();
  }

  return (
    <section className="page">
      <header className="page-header">
        <h1>{t("beds.title")}</h1>
        <LodgeTabs value={lodgeId} onChange={setLodgeId} />
      </header>
      <p className="muted">{t("beds.summary", { occupied: s.occupied, free: s.free, oos: s.outOfService })}</p>
      <Notice kind="error">{error}</Notice>

      {loading && <div className="card"><Skeleton rows={6} label={t("app.loading")} /></div>}
      <div className="room-grid">
        {groupByRoom(beds).map((room) => (
          <article key={room.room_id} className="room-card">
            <h2 className="room-code">{roomLabel(t, room.room_kind, room.room_code)}</h2>
            <ul className="bed-list">
              {room.beds.map((b) => {
                const state = b.stay_id
                  ? b.stay_status === "out_pending"
                    ? "out-pending"
                    : "occupied"
                  : b.bed_status === "out_of_service"
                    ? "oos"
                    : "free";
                return (
                  <li key={b.bed_id}>
                    <button type="button" className={`bed bed-${state}`} onClick={() => open(b)}>
                      <span className="bed-number">{b.bed_number}</span>
                      <span className="bed-body">
                        {b.resident_id ? (
                          <>
                            <strong>{residentName(b)}</strong>
                            <small>{formatCivilDate(b.date_of_birth, locale)}</small>
                            {state === "out-pending" && <small className="tag">{t("beds.outPending")}</small>}
                          </>
                        ) : state === "oos" ? (
                          <em>{t("beds.outOfService")}</em>
                        ) : (
                          <em>{t("beds.free")}</em>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </article>
        ))}
      </div>

      {admitBed && (
        <AdmitDialog
          initialBed={{ bedId: admitBed.bed_id, lodgeId: admitBed.lodge_id }}
          onClose={() => setAdmitBed(null)}
          onDone={(residentId) => {
            setAdmitBed(null);
            void reload();
            if (residentId) navigate(`/residents/${residentId}`);
          }}
        />
      )}

      {manageBed && (
        <Dialog
          title={`${roomLabel(t, manageBed.room_kind, manageBed.room_code)} — ${t("beds.bedN", { n: manageBed.bed_number })}`}
          onClose={() => setManageBed(null)}
          footer={
            <>
              <DialogCancel>{t("app.cancel")}</DialogCancel>
              {manageBed.bed_status === "in_use" ? (
                <>
                  <button
                    onClick={() => {
                      const bed = manageBed;
                      setManageBed(null);
                      setAdmitBed(bed);
                    }}
                  >
                    {t("residents.admit")}
                  </button>
                  <button className="danger-outline" onClick={() => void setBedStatus(manageBed, "out_of_service")}>
                    {t("beds.setOutOfService")}
                  </button>
                </>
              ) : (
                <button className="primary" onClick={() => void setBedStatus(manageBed, "in_use")}>
                  {t("beds.setInUse")}
                </button>
              )}
            </>
          }
        >
          {manageBed.bed_status === "in_use" && (
            <label className="form">
              {t("beds.statusNote")} <small>({t("app.optional")})</small>
              <input value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
          )}
        </Dialog>
      )}
    </section>
  );
}
