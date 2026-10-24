import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useActiveLodge } from "@/lib/lodge";

export const Route = createFileRoute("/presence")({
  component: PresencePage,
});

type StayRow = {
  id: string;
  resident_id: string;
  started_at: string;
};

type ResidentRow = {
  id: string;
  full_name: string;
};

type Observation = {
  id: string;
  stay_id: string;
  result: string;
  occurred_at: string;
  location: string | null;
  source: string;
};

type Delivery = {
  id: string;
  stay_id: string;
  service_date: string;
  delivered_at: string;
};

const inputClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring";

const primaryButton =
  "inline-flex items-center justify-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50";

const secondaryButton =
  "inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-2 text-sm font-medium text-foreground transition hover:bg-accent hover:text-accent-foreground disabled:opacity-50";

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
}

function localDateIso(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function PresencePage() {
  const { lodges, lodgeId, selectLodge, userId, loading: lodgeLoading, error: lodgeError } = useActiveLodge();

  const [stays, setStays] = useState<StayRow[]>([]);
  const [residents, setResidents] = useState<ResidentRow[]>([]);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [location, setLocation] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const today = useMemo(() => localDateIso(), []);

  const load = useCallback(async () => {
    if (!lodgeId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);

    const [stayRes, observationRes, deliveryRes] = await Promise.all([
      supabase
        .from("stays")
        .select("id, resident_id, started_at")
        .eq("lodge_id", lodgeId)
        .is("ended_at", null)
        .order("started_at", { ascending: true }),
      supabase
        .from("presence_observations")
        .select("id, stay_id, result, occurred_at, location, source")
        .eq("lodge_id", lodgeId)
        .eq("voided", false)
        .gte("occurred_at", dayStart.toISOString())
        .order("occurred_at", { ascending: false }),
      supabase
        .from("dinner_deliveries")
        .select("id, stay_id, service_date, delivered_at")
        .eq("lodge_id", lodgeId)
        .eq("voided", false)
        .eq("service_date", today)
        .order("delivered_at", { ascending: false }),
    ]);

    const firstError = stayRes.error ?? observationRes.error ?? deliveryRes.error;
    if (firstError) {
      setError(firstError.message);
      setLoading(false);
      return;
    }

    const stayList = (stayRes.data ?? []) as StayRow[];
    const residentIds = stayList.map((stay) => stay.resident_id);
    let residentList: ResidentRow[] = [];

    if (residentIds.length > 0) {
      const { data: residentData, error: residentError } = await supabase
        .from("residents")
        .select("id, full_name")
        .in("id", residentIds);

      if (residentError) {
        setError(residentError.message);
        setLoading(false);
        return;
      }

      residentList = (residentData ?? []) as ResidentRow[];
    }

    setStays(stayList);
    setResidents(residentList);
    setObservations((observationRes.data ?? []) as Observation[]);
    setDeliveries((deliveryRes.data ?? []) as Delivery[]);
    setLoading(false);
  }, [lodgeId, today]);

  useEffect(() => {
    void load();
  }, [load]);

  const residentById = new Map(residents.map((item) => [item.id, item] as const));
  const stayById = new Map(stays.map((item) => [item.id, item] as const));

  const latestPresenceByStay = new Map<string, Observation>();
  observations.forEach((observation) => {
    if (!latestPresenceByStay.has(observation.stay_id)) {
      latestPresenceByStay.set(observation.stay_id, observation);
    }
  });

  const deliveredStayIds = new Set(deliveries.map((delivery) => delivery.stay_id));

  function residentNameForStay(stayId: string) {
    const stay = stayById.get(stayId);
    if (!stay) return "—";
    return residentById.get(stay.resident_id)?.full_name ?? "—";
  }

  async function markPresence(stayId: string, result: "present" | "absent") {
    if (!lodgeId || !userId) {
      setError("Selecione uma unidade e confirme a sessão antes de registar.");
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);

    const { error: insertError } = await supabase.from("presence_observations").insert({
      stay_id: stayId,
      lodge_id: lodgeId,
      result,
      source: "manual",
      location: location.trim() || null,
      occurred_at: new Date().toISOString(),
      actor_id: userId,
    });

    setBusy(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setNotice(result === "present" ? "Presença registada." : "Ausência registada.");
    await load();
  }

  async function deliverDinner(stayId: string) {
    if (!lodgeId || !userId) {
      setError("Selecione uma unidade e confirme a sessão antes de registar.");
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);

    const { error: insertError } = await supabase.from("dinner_deliveries").insert({
      stay_id: stayId,
      lodge_id: lodgeId,
      service_date: today,
      delivered_at: new Date().toISOString(),
      actor_id: userId,
    });

    setBusy(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setNotice("Entrega de jantar registada.");
    await load();
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-10">
        <header className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight">Presença e refeições</h1>
            <p className="text-sm text-muted-foreground">
              Registo de presença, ausência e entrega de jantar para as estadias ativas.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-muted-foreground" htmlFor="lodge-select">
              Unidade
            </label>
            <select
              id="lodge-select"
              className={inputClass}
              value={lodgeId ?? ""}
              onChange={(event) => selectLodge(event.target.value)}
              disabled={lodgeLoading || lodges.length === 0}
            >
              {lodges.length === 0 ? <option value="">Sem unidades</option> : null}
              {lodges.map((lodge) => (
                <option key={lodge.id} value={lodge.id}>
                  {lodge.name}
                </option>
              ))}
            </select>
          </div>
        </header>

        {error ?? lodgeError ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error ?? lodgeError}
          </div>
        ) : null}

        {notice ? (
          <div className="rounded-md border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-foreground">
            {notice}
          </div>
        ) : null}

        <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1 sm:max-w-xs">
              <label className="text-sm font-medium" htmlFor="presence-location">
                Local (opcional)
              </label>
              <input
                id="presence-location"
                className={inputClass}
                value={location}
                placeholder="ex.: sala comum"
                onChange={(event) => setLocation(event.target.value)}
              />
            </div>
            <button
              type="button"
              className={secondaryButton}
              onClick={() => void load()}
              disabled={loading || !lodgeId}
            >
              Atualizar
            </button>
          </div>

          <div className="mt-6">
            <h2 className="text-lg font-semibold">Estadias ativas</h2>
            <p className="text-sm text-muted-foreground">{today}</p>
          </div>

          {loading ? (
            <p className="mt-6 text-sm text-muted-foreground">A carregar…</p>
          ) : stays.length === 0 ? (
            <p className="mt-6 text-sm text-muted-foreground">Nenhuma estadia ativa nesta unidade.</p>
          ) : (
            <ul className="mt-4 divide-y divide-border">
              {stays.map((stay) => {
                const resident = residentById.get(stay.resident_id);
                const latest = latestPresenceByStay.get(stay.id);
                const dinnerDone = deliveredStayIds.has(stay.id);

                return (
                  <li key={stay.id} className="flex flex-col gap-3 py-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="space-y-1">
                      <p className="font-medium">{resident?.full_name ?? "Residente"}</p>
                      <p className="text-xs text-muted-foreground">
                        {latest ? `Última marca: ${latest.result} às ${formatTime(latest.occurred_at)}` : "Sem registo hoje"}
                        {" · "}
                        {dinnerDone ? "Jantar entregue" : "Jantar pendente"}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className={primaryButton}
                        onClick={() => void markPresence(stay.id, "present")}
                        disabled={busy || !lodgeId}
                      >
                        Presente
                      </button>
                      <button
                        type="button"
                        className={secondaryButton}
                        onClick={() => void markPresence(stay.id, "absent")}
                        disabled={busy || !lodgeId}
                      >
                        Ausente
                      </button>
                      <button
                        type="button"
                        className={secondaryButton}
                        onClick={() => void deliverDinner(stay.id)}
                        disabled={busy || !lodgeId || dinnerDone}
                      >
                        Entregar jantar
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Registos de hoje</h2>
          {observations.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">Nenhuma observação registada hoje.</p>
          ) : (
            <ul className="mt-4 divide-y divide-border">
              {observations.map((observation) => (
                <li key={observation.id} className="flex items-center justify-between py-3 text-sm">
                  <span className="font-medium">{residentNameForStay(observation.stay_id)}</span>
                  <span className="text-muted-foreground">
                    {observation.result} · {formatTime(observation.occurred_at)}
                    {observation.location ? ` · ${observation.location}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
