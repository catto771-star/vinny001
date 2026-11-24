import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { errorKey } from "@/lib/errors";
import { roomLabel } from "@/lib/rooms";
import { formatTime } from "@/lib/time";
import { residentName } from "@/lib/types";
import { useLatestRequest } from "@/lib/useLatestRequest";
import { useOccupancy } from "@/lib/useOccupancy";
import { Dialog, DialogCancel } from "@/components/Dialog";
import { LodgeTabs } from "@/components/LodgeTabs";
import { useLodgeState } from "@/lib/activeLodge";
import { Notice } from "@/components/Notice";
import { Skeleton } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";

export type Machine = { machine_id: string; code: string; label: string; kind: "wash" | "dry"; use_id: string | null; started_at: string | null; resident_id: string | null; first_name: string | null; last_name: string | null };
const hasLaundry = (l: { has_laundry: boolean }) => l.has_laundry;

/** Laundry (s.8): quatro máquinas, sem reservas; iniciar anota no Handover; finalizar só libera. */
export function Laundry() {
  const { t, locale } = useI18n();
  const { canWriteLodge } = useAuth();
  const toast = useToast();
  const [lodgeId, setLodgeId] = useLodgeState(hasLaundry);
  const { beds } = useOccupancy(lodgeId || undefined);
  const [machines, setMachines] = useState<Machine[] | null>(null);
  const [starting, setStarting] = useState<Machine | null>(null);
  const begin = useLatestRequest();
  const canWrite = !!lodgeId && canWriteLodge(lodgeId);

  const load = useCallback(async () => {
    if (!lodgeId) return setMachines([]);
    const isLatest = begin();
    const { data } = await supabase.rpc("laundry_status", { p_lodge: lodgeId });
    if (!isLatest()) return;
    setMachines((data ?? []) as Machine[]);
  }, [lodgeId, begin]);

  useEffect(() => {
    void load();
  }, [load]);

  async function finish(m: Machine) {
    const { error } = await supabase.rpc("finish_laundry", { p_use: m.use_id });
    if (error) return toast.error(t(errorKey(error)));
    toast.success(t("laundry.finished"));
    await load();
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <span className="eyebrow">{t("laundry.eyebrow")}</span>
          <h1>{t("laundry.title")}</h1>
        </div>
        <LodgeTabs value={lodgeId} onChange={setLodgeId} only={hasLaundry} />
      </header>
      {!lodgeId && <Notice kind="info">{t("laundry.onlyConnolly")}</Notice>}
      {machines === null ? (
        <div className="card"><Skeleton rows={4} label={t("app.loading")} /></div>
      ) : (
        <div className="machine-grid">
          {machines.map((m) => (
            <article key={m.machine_id} className={`machine${m.use_id ? " is-busy" : ""}`}>
              <span className="machine-code">{m.label}</span>
              <span className="machine-status">
                {m.use_id ? t("laundry.busy", { time: formatTime(m.started_at!, locale) }) : t("laundry.free")}
              </span>
              {m.use_id && m.resident_id && <span className="machine-who">{residentName({ first_name: m.first_name, last_name: m.last_name })}</span>}
              {canWrite && (m.use_id ? (
                <button className="primary" onClick={() => void finish(m)}>{t("laundry.finish")}</button>
              ) : (
                <button onClick={() => setStarting(m)}>{t("laundry.start")}</button>
              ))}
            </article>
          ))}
        </div>
      )}
      {starting && (
        <StartMachine
          machine={starting}
          residents={beds}
          onClose={() => setStarting(null)}
          onDone={() => {
            setStarting(null);
            toast.success(t("laundry.started"));
            void load();
          }}
        />
      )}
    </section>
  );
}

function StartMachine({ machine, residents, onClose, onDone }: { machine: Machine; residents: ReturnType<typeof useOccupancy>["beds"]; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const [stayId, setStayId] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const { error: err } = await supabase.rpc("start_laundry", { p_machine: machine.machine_id, p_stay: stayId || null });
    if (err) return setError(t(errorKey(err)));
    onDone();
  }

  return (
    <Dialog
      title={t("laundry.startTitle", { machine: machine.label })}
      onClose={onClose}
      footer={
        <>
          <DialogCancel>{t("app.cancel")}</DialogCancel>
          <button className="primary" onClick={() => void submit()}>{t("laundry.start")}</button>
        </>
      }
    >
      <label className="form">
        {t("laundry.forResident")}
        <select value={stayId} onChange={(e) => setStayId(e.target.value)} autoFocus>
          <option value="">{t("laundry.noResident")}</option>
          {residents.filter((b) => b.stay_id).map((b) => (
            <option key={b.stay_id!} value={b.stay_id!}>{roomLabel(t, b.room_kind, b.room_code)} · {b.bed_number} — {residentName(b)}</option>
          ))}
        </select>
      </label>
      <Notice kind="error">{error}</Notice>
    </Dialog>
  );
}
