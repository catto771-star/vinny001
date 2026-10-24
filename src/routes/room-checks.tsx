import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useActiveLodge } from "@/lib/lodge";
import {
  combineOperationalDateTime,
  computeRoomCheckProgress,
  localDateIso,
  normalizeScheduleTimes,
  runStatusLabel,
  validateFinishRun,
} from "@/lib/room-checks";
import { runRoomCheckTests, type RoomCheckTestSuite } from "@/lib/room-checks.tests";

export const Route = createFileRoute("/room-checks")({
  component: RoomChecksPage,
});

type Accommodation = {
  id: string;
  code: string;
  kind: string;
  floor: string | null;
};

type RunRow = {
  id: string;
  scheduled_at: string;
  operational_day: string;
  is_main: boolean;
  status: string;
  started_at: string;
  finished_at: string | null;
  incomplete_reason: string | null;
};

type CheckedRoomRow = {
  id: string;
  run_id: string;
  accommodation_id: string;
  checked_at: string;
};

const KIND_LABELS: Record<string, string> = {
  room: "Quarto",
  dorm: "Dormitório",
  dormitory: "Dormitório",
  suite: "Suite",
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

function RoomChecksPage() {
  const { lodges, lodgeId, selectLodge, userId, loading: lodgeLoading, error: lodgeError } = useActiveLodge();

  const [day, setDay] = useState(() => localDateIso());
  const [accommodations, setAccommodations] = useState<Accommodation[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [checkedRooms, setCheckedRooms] = useState<CheckedRoomRow[]>([]);
  const [scheduleTimes, setScheduleTimes] = useState<string[]>(normalizeScheduleTimes(null));

  const [time, setTime] = useState("");
  const [isMain, setIsMain] = useState(true);
  const [finishReasons, setFinishReasons] = useState<Record<string, string>>({});

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [testSuite, setTestSuite] = useState<RoomCheckTestSuite | null>(null);

  const load = useCallback(async () => {
    if (!lodgeId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const [accommodationRes, runRes, settingsRes] = await Promise.all([
      supabase
        .from("accommodations")
        .select("id, code, kind, floor")
        .eq("lodge_id", lodgeId)
        .eq("active", true)
        .order("code", { ascending: true }),
      supabase
        .from("room_check_runs")
        .select(
          "id, scheduled_at, operational_day, is_main, status, started_at, finished_at, incomplete_reason",
        )
        .eq("lodge_id", lodgeId)
        .eq("operational_day", day)
        .order("scheduled_at", { ascending: true }),
      supabase.from("lodge_settings").select("check_times").eq("lodge_id", lodgeId).maybeSingle(),
    ]);

    const firstError = accommodationRes.error ?? runRes.error ?? settingsRes.error;
    if (firstError) {
      setError(firstError.message);
      setLoading(false);
      return;
    }

    const runList = (runRes.data ?? []) as RunRow[];
    let checkedList: CheckedRoomRow[] = [];

    if (runList.length > 0) {
      const { data: checkedData, error: checkedError } = await supabase
        .from("room_check_rooms")
        .select("id, run_id, accommodation_id, checked_at")
        .in(
          "run_id",
          runList.map((run) => run.id),
        );

      if (checkedError) {
        setError(checkedError.message);
        setLoading(false);
        return;
      }

      checkedList = (checkedData ?? []) as CheckedRoomRow[];
    }

    const configuredTimes = (settingsRes.data as { check_times: string[] | null } | null)?.check_times ?? null;
    const times = normalizeScheduleTimes(configuredTimes);

    setAccommodations((accommodationRes.data ?? []) as Accommodation[]);
    setRuns(runList);
    setCheckedRooms(checkedList);
    setScheduleTimes(times);
    setTime((current) => (times.includes(current) ? current : (times[0] ?? "")));
    setLoading(false);
  }, [lodgeId, day]);

  useEffect(() => {
    void load();
  }, [load]);

  const accommodationById = new Map(accommodations.map((item) => [item.id, item] as const));

  const checkedByRun = new Map<string, CheckedRoomRow[]>();
  checkedRooms.forEach((row) => {
    const current = checkedByRun.get(row.run_id) ?? [];
    current.push(row);
    checkedByRun.set(row.run_id, current);
  });

  async function handleStart() {
    if (!lodgeId || !userId) {
      setError("Selecione uma unidade e confirme a sessão antes de iniciar.");
      return;
    }

    const scheduledAt = combineOperationalDateTime(day, time);
    if (!scheduledAt) {
      setError("Indique uma hora válida para a verificação.");
      return;
    }

    const duplicate = runs.some(
      (run) => new Date(run.scheduled_at).getTime() === new Date(scheduledAt).getTime(),
    );

    if (duplicate) {
      setError("Já existe uma verificação agendada para esta hora neste dia.");
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);

    const { error: insertError } = await supabase.from("room_check_runs").insert({
      lodge_id: lodgeId,
      scheduled_at: scheduledAt,
      operational_day: day,
      is_main: isMain,
      status: "in_progress",
      started_by: userId,
    });

    setBusy(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setNotice("Verificação iniciada.");
    await load();
  }

  async function handleCheckRoom(run: RunRow, accommodation: Accommodation) {
    if (!userId) {
      setError("Sessão sem utilizador associado: volte a iniciar sessão.");
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);

    const { error: insertError } = await supabase.from("room_check_rooms").insert({
      run_id: run.id,
      accommodation_id: accommodation.id,
      checked_by: userId,
    });

    setBusy(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setNotice(`${accommodationById.get(accommodation.id)?.code ?? accommodation.code} verificada.`);
    await load();
  }

  async function handleFinish(run: RunRow) {
    if (!userId) {
      setError("Sessão sem utilizador associado: volte a iniciar sessão.");
      return;
    }

    const checkedCount = (checkedByRun.get(run.id) ?? []).length;
    const progress = computeRoomCheckProgress(accommodations.length, checkedCount);
    const reason = finishReasons[run.id] ?? "";
    const validation = validateFinishRun(progress, reason);

    if (!validation.ok) {
      setError(validation.error ?? "Não é possível terminar esta verificação.");
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);

    const { error: updateError } = await supabase
      .from("room_check_runs")
      .update({
        status: progress.complete ? "completed" : "incomplete",
        finished_by: userId,
        finished_at: new Date().toISOString(),
        incomplete_reason: progress.complete ? null : reason.trim(),
      })
      .eq("id", run.id);

    setBusy(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setFinishReasons((prev) => ({ ...prev, [run.id]: "" }));
    setNotice(progress.complete ? "Verificação concluída." : "Verificação terminada como incompleta.");
    await load();
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-10">
        <header className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight">Verificações de quarto</h1>
            <p className="text-sm text-muted-foreground">
              Rondas de verificação dos quartos da unidade, com progresso e fecho do turno.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
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
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-muted-foreground" htmlFor="check-day">
                Dia
              </label>
              <input
                id="check-day"
                type="date"
                className={inputClass}
                value={day}
                onChange={(event) => setDay(event.target.value)}
              />
            </div>
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
          <h2 className="text-lg font-semibold">Iniciar verificação</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            As horas sugeridas vêm das configurações da unidade. A verificação fica em curso até ser terminada.
          </p>

          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="space-y-1 sm:max-w-40">
              <label className="text-sm font-medium" htmlFor="check-time">
                Hora agendada
              </label>
              <select
                id="check-time"
                className={inputClass}
                value={time}
                onChange={(event) => setTime(event.target.value)}
                disabled={busy}
              >
                {scheduleTimes.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>

            <label className="flex items-center gap-2 text-sm font-medium" htmlFor="check-main">
              <input
                id="check-main"
                type="checkbox"
                className="h-4 w-4 rounded border-input"
                checked={isMain}
                onChange={(event) => setIsMain(event.target.checked)}
                disabled={busy}
              />
              Verificação principal
            </label>

            <button
              type="button"
              className={primaryButton}
              onClick={() => void handleStart()}
              disabled={busy || !lodgeId || !time}
            >
              Iniciar verificação
            </button>
          </div>

          {accommodations.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Esta unidade ainda não tem quartos registados em acomodações.
            </p>
          ) : null}
        </section>

        <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Verificações do dia</h2>
              <p className="text-sm text-muted-foreground">
                {runs.length} verificação(ões) em {day} · {accommodations.length} quarto(s) na unidade.
              </p>
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

          {loading ? (
            <p className="mt-6 text-sm text-muted-foreground">A carregar…</p>
          ) : runs.length === 0 ? (
            <p className="mt-6 text-sm text-muted-foreground">Nenhuma verificação agendada para este dia.</p>
          ) : (
            <ul className="mt-4 space-y-4">
              {runs.map((run) => {
                const runChecks = checkedByRun.get(run.id) ?? [];
                const checkedMap = new Map(runChecks.map((row) => [row.accommodation_id, row] as const));
                const progress = computeRoomCheckProgress(accommodations.length, runChecks.length);

                return (
                  <li key={run.id} className="rounded-lg border border-border p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
                      <div className="space-y-1">
                        <p className="font-semibold">
                          {formatTime(run.scheduled_at)} · {run.is_main ? "Principal" : "Extra"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Iniciada às {formatTime(run.started_at)}
                          {run.finished_at ? ` · terminada às ${formatTime(run.finished_at)}` : ""}
                        </p>
                      </div>
                      <span className="w-fit rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                        {runStatusLabel(run.status)}
                      </span>
                    </div>

                    <div className="mt-3 space-y-1">
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${progress.percent}%` }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {progress.checked}/{progress.total} quartos verificados · {progress.percent}%
                      </p>
                    </div>

                    {accommodations.length === 0 ? (
                      <p className="mt-4 text-sm text-muted-foreground">Sem quartos para verificar.</p>
                    ) : (
                      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                        {accommodations.map((accommodation) => {
                          const checked = checkedMap.get(accommodation.id);

                          return (
                            <li
                              key={accommodation.id}
                              className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
                            >
                              <div className="space-y-0.5">
                                <p className="text-sm font-medium">{accommodation.code}</p>
                                <p className="text-xs text-muted-foreground">
                                  {accommodation.floor ?? "sem piso"} ·{" "}
                                  {KIND_LABELS[accommodation.kind] ?? accommodation.kind}
                                </p>
                              </div>
                              {checked ? (
                                <span className="text-xs text-muted-foreground">
                                  verificado às {formatTime(checked.checked_at)}
                                </span>
                              ) : run.status === "in_progress" ? (
                                <button
                                  type="button"
                                  className={secondaryButton}
                                  onClick={() => void handleCheckRoom(run, accommodation)}
                                  disabled={busy}
                                >
                                  Verificar
                                </button>
                              ) : (
                                <span className="text-xs text-destructive">não verificada</span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    {run.status === "in_progress" ? (
                      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
                        <div className="w-full space-y-1 sm:max-w-md">
                          <label
                            className="text-xs font-medium text-muted-foreground"
                            htmlFor={`reason-${run.id}`}
                          >
                            Motivo (obrigatório se ficar incompleta)
                          </label>
                          <input
                            id={`reason-${run.id}`}
                            className={inputClass}
                            value={finishReasons[run.id] ?? ""}
                            onChange={(event) =>
                              setFinishReasons((prev) => ({ ...prev, [run.id]: event.target.value }))
                            }
                          />
                        </div>
                        <button
                          type="button"
                          className={primaryButton}
                          onClick={() => void handleFinish(run)}
                          disabled={busy}
                        >
                          Terminar verificação
                        </button>
                      </div>
                    ) : run.incomplete_reason ? (
                      <p className="mt-3 text-xs text-muted-foreground">Motivo: {run.incomplete_reason}</p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Testes automáticos da etapa</h2>
              <p className="text-sm text-muted-foreground">
                Verificações às regras de horário, progresso e fecho das verificações de quarto.
              </p>
            </div>
            <button
              type="button"
              className={secondaryButton}
              onClick={() => setTestSuite(runRoomCheckTests())}
            >
              Correr testes
            </button>
          </div>

          {testSuite ? (
            <ul className="mt-4 divide-y divide-border text-sm">
              <li className="py-2 font-medium">
                {testSuite.passed} passaram · {testSuite.failed} falharam
              </li>
              {testSuite.results.map((result) => (
                <li
                  key={result.name}
                  className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span>{result.name}</span>
                  <span className={result.passed ? "text-primary" : "text-destructive"}>
                    {result.passed ? "passou" : `falhou — ${result.message}`}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">Ainda não foram corridos nesta sessão.</p>
          )}
        </section>
      </div>
    </div>
  );
}
