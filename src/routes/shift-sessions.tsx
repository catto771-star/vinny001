import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useActiveLodge } from "@/lib/lodge";
import {
  formatDuration,
  normalizeShiftRoles,
  openSessionForUser,
  shiftDurationMinutes,
  shiftStatusLabel,
  summarizeShifts,
  validateShiftEnd,
  validateShiftStart,
  type ShiftSession,
} from "@/lib/shift-sessions";
import { runShiftSessionTests, type ShiftSessionTestSuite } from "@/lib/shift-sessions.tests";

export const Route = createFileRoute("/shift-sessions")({
  component: ShiftSessionsPage,
});

type ProfileRow = {
  id: string;
  display_name: string;
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

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" });
}

function ShiftSessionsPage() {
  const { lodges, lodgeId, selectLodge, userId, loading: lodgeLoading, error: lodgeError } = useActiveLodge();

  const [sessions, setSessions] = useState<ShiftSession[]>([]);
  const [roleOptions, setRoleOptions] = useState<string[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [roleChoice, setRoleChoice] = useState("");
  const [customRole, setCustomRole] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [testSuite, setTestSuite] = useState<ShiftSessionTestSuite | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const load = useCallback(async () => {
    if (!lodgeId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const [sessionRes, roleRes] = await Promise.all([
      supabase
        .from("shift_sessions")
        .select("id, user_id, lodge_id, shift_role, started_at, ended_at")
        .eq("lodge_id", lodgeId)
        .order("started_at", { ascending: false })
        .limit(100),
      supabase.from("shift_sessions").select("shift_role").eq("lodge_id", lodgeId).limit(500),
    ]);

    const firstError = sessionRes.error ?? roleRes.error;
    if (firstError) {
      setError(firstError.message);
      setLoading(false);
      return;
    }

    const sessionList = (sessionRes.data ?? []) as ShiftSession[];
    const roles = normalizeShiftRoles(
      ((roleRes.data ?? []) as { shift_role: string | null }[]).map((row) => row.shift_role),
    );

    const userIds = Array.from(new Set(sessionList.map((row) => row.user_id)));
    let profileList: ProfileRow[] = [];

    if (userIds.length > 0) {
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", userIds);

      if (profileError) {
        setError(profileError.message);
        setLoading(false);
        return;
      }

      profileList = (profileData ?? []) as ProfileRow[];
    }

    setSessions(sessionList);
    setRoleOptions(roles);
    setProfiles(profileList);
    setRoleChoice((current) => (roles.includes(current) ? current : (roles[0] ?? "")));
    setLoading(false);
  }, [lodgeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const profileById = new Map(profiles.map((item) => [item.id, item] as const));
  const openSession = userId ? openSessionForUser(sessions, userId) : null;
  const summary = summarizeShifts(sessions, now);
  const selectedRole = roleOptions.length > 0 ? roleChoice : customRole.trim();

  function userName(id: string) {
    const profile = profileById.get(id);
    if (profile?.display_name) return profile.display_name;
    return id === userId ? "Você" : "Utilizador";
  }

  async function handleStart() {
    if (!lodgeId || !userId) {
      setError("Selecione uma unidade e confirme a sessão antes de iniciar o turno.");
      return;
    }

    const validation = validateShiftStart(selectedRole, Boolean(openSession));
    if (!validation.ok) {
      setError(validation.error ?? "Não é possível iniciar o turno.");
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);

    const { error: insertError } = await supabase.from("shift_sessions").insert({
      user_id: userId,
      lodge_id: lodgeId,
      shift_role: selectedRole,
      started_at: new Date().toISOString(),
    });

    setBusy(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setCustomRole("");
    setNotice("Turno iniciado.");
    await load();
  }

  async function handleEnd(session: ShiftSession) {
    if (!userId) {
      setError("Sessão sem utilizador associado: volte a iniciar sessão.");
      return;
    }

    const validation = validateShiftEnd(session.ended_at === null);
    if (!validation.ok) {
      setError(validation.error ?? "Não é possível terminar este turno.");
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);

    const { error: updateError } = await supabase
      .from("shift_sessions")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", session.id)
      .is("ended_at", null);

    setBusy(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setNotice("Turno terminado.");
    await load();
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-10">
        <header className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight">Sessões de turno</h1>
            <p className="text-sm text-muted-foreground">
              Entrada e saída de turno por utilizador, com histórico e tempos por unidade.
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
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">O seu turno</h2>
              <p className="text-sm text-muted-foreground">
                {userId
                  ? "Cada utilizador só pode ter um turno aberto de cada vez."
                  : "Inicie sessão para registar entradas e saídas de turno."}
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

          {openSession ? (
            <div className="mt-4 flex flex-col gap-4 rounded-lg border border-primary/40 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <p className="font-medium">Turno aberto · {openSession.shift_role}</p>
                <p className="text-xs text-muted-foreground">
                  Início {formatDateTime(openSession.started_at)} · decorrido{" "}
                  {formatDuration(shiftDurationMinutes(openSession.started_at, null, now))}
                </p>
              </div>
              <button
                type="button"
                className={primaryButton}
                onClick={() => void handleEnd(openSession)}
                disabled={busy}
              >
                Terminar turno
              </button>
            </div>
          ) : (
            <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end">
              <div className="space-y-1 sm:max-w-xs">
                <label className="text-sm font-medium" htmlFor="shift-role">
                  Função do turno
                </label>
                {roleOptions.length > 0 ? (
                  <select
                    id="shift-role"
                    className={inputClass}
                    value={roleChoice}
                    onChange={(event) => setRoleChoice(event.target.value)}
                    disabled={busy}
                  >
                    {roleOptions.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id="shift-role"
                    className={inputClass}
                    value={customRole}
                    placeholder="ex.: manhã / noite"
                    onChange={(event) => setCustomRole(event.target.value)}
                    disabled={busy}
                  />
                )}
              </div>
              <button
                type="button"
                className={primaryButton}
                onClick={() => void handleStart()}
                disabled={busy || !lodgeId || !userId}
              >
                Iniciar turno
              </button>
            </div>
          )}

          {roleOptions.length === 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Ainda não há funções de turno nesta unidade, por isso a função é escrita à mão.
            </p>
          ) : null}
        </section>

        <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Resumo</h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-border px-4 py-3">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Turnos</dt>
              <dd className="text-2xl font-semibold">{summary.total}</dd>
            </div>
            <div className="rounded-lg border border-border px-4 py-3">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Em curso</dt>
              <dd className="text-2xl font-semibold">{summary.open}</dd>
            </div>
            <div className="rounded-lg border border-border px-4 py-3">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Tempo total</dt>
              <dd className="text-2xl font-semibold">{formatDuration(summary.totalMinutes)}</dd>
            </div>
            <div className="rounded-lg border border-border px-4 py-3">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Duração média</dt>
              <dd className="text-2xl font-semibold">{formatDuration(summary.averageMinutes)}</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div>
            <h2 className="text-lg font-semibold">Histórico de turnos</h2>
            <p className="text-sm text-muted-foreground">
              Últimos {sessions.length} turno(s) registados nesta unidade.
            </p>
          </div>

          {loading ? (
            <p className="mt-6 text-sm text-muted-foreground">A carregar…</p>
          ) : sessions.length === 0 ? (
            <p className="mt-6 text-sm text-muted-foreground">Ainda não há turnos registados.</p>
          ) : (
            <ul className="mt-4 divide-y divide-border">
              {sessions.map((session) => {
                const isOpen = session.ended_at === null;
                const minutes = shiftDurationMinutes(session.started_at, session.ended_at, now);

                return (
                  <li
                    key={session.id}
                    className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="space-y-1">
                      <p className="font-medium">
                        {userName(session.user_id)} · {session.shift_role}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatTime(session.started_at)} — {session.ended_at ? formatTime(session.ended_at) : "em curso"}{" "}
                        · {formatDuration(minutes)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                        {shiftStatusLabel(isOpen)}
                      </span>
                      {isOpen && session.user_id === userId ? (
                        <button
                          type="button"
                          className={secondaryButton}
                          onClick={() => void handleEnd(session)}
                          disabled={busy}
                        >
                          Terminar
                        </button>
                      ) : null}
                    </div>
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
                Verificações às regras de duração, resumo e validação dos turnos.
              </p>
            </div>
            <button
              type="button"
              className={secondaryButton}
              onClick={() => setTestSuite(runShiftSessionTests())}
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
