import { useCallback, useEffect, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useActiveLodge } from "@/lib/lodge";

export const Route = createFileRoute("/handovers")({
  component: HandoversPage,
});

type HandoverRow = {
  id: string;
  summary: string;
  body: string;
  original_language: string;
  occurred_at: string;
  author_id: string;
};

type ProfileRow = {
  id: string;
  display_name: string;
};

type ResidentRow = {
  id: string;
  full_name: string;
};

type WarningRow = {
  id: string;
  resident_id: string;
  original_text: string;
  occurred_at: string;
};

type LinkRow = {
  handover_id: string;
  warning_id: string;
};

const LANGUAGES = [
  { value: "pt", label: "Português" },
  { value: "en", label: "Inglês" },
];

const inputClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring";

const primaryButton =
  "inline-flex items-center justify-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50";

const secondaryButton =
  "inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-2 text-sm font-medium text-foreground transition hover:bg-accent hover:text-accent-foreground disabled:opacity-50";

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" });
}

function HandoversPage() {
  const { lodges, lodgeId, selectLodge, userId, loading: lodgeLoading, error: lodgeError } = useActiveLodge();

  const [handovers, setHandovers] = useState<HandoverRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [residents, setResidents] = useState<ResidentRow[]>([]);
  const [warnings, setWarnings] = useState<WarningRow[]>([]);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [linkChoices, setLinkChoices] = useState<Record<string, string>>({});

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [summary, setSummary] = useState("");
  const [body, setBody] = useState("");
  const [language, setLanguage] = useState("pt");

  const load = useCallback(async () => {
    if (!lodgeId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const [handoverRes, warningRes] = await Promise.all([
      supabase
        .from("handovers")
        .select("id, summary, body, original_language, occurred_at, author_id")
        .eq("lodge_id", lodgeId)
        .order("occurred_at", { ascending: false })
        .limit(50),
      supabase
        .from("resident_warnings")
        .select("id, resident_id, original_text, occurred_at")
        .eq("lodge_id", lodgeId)
        .eq("voided", false)
        .order("occurred_at", { ascending: false })
        .limit(50),
    ]);

    const firstError = handoverRes.error ?? warningRes.error;
    if (firstError) {
      setError(firstError.message);
      setLoading(false);
      return;
    }

    const handoverList = (handoverRes.data ?? []) as HandoverRow[];
    const warningList = (warningRes.data ?? []) as WarningRow[];

    let profileList: ProfileRow[] = [];
    const authorIds = Array.from(new Set(handoverList.map((item) => item.author_id)));

    if (authorIds.length > 0) {
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", authorIds);

      if (profileError) {
        setError(profileError.message);
        setLoading(false);
        return;
      }

      profileList = (profileData ?? []) as ProfileRow[];
    }

    let linkList: LinkRow[] = [];

    if (handoverList.length > 0) {
      const { data: linkData, error: linkError } = await supabase
        .from("handover_warning_links")
        .select("handover_id, warning_id")
        .in(
          "handover_id",
          handoverList.map((item) => item.id),
        );

      if (linkError) {
        setError(linkError.message);
        setLoading(false);
        return;
      }

      linkList = (linkData ?? []) as LinkRow[];
    }

    let residentList: ResidentRow[] = [];
    const residentIds = Array.from(new Set(warningList.map((item) => item.resident_id)));

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

    setHandovers(handoverList);
    setWarnings(warningList);
    setProfiles(profileList);
    setLinks(linkList);
    setResidents(residentList);
    setLoading(false);
  }, [lodgeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const profileById = new Map(profiles.map((item) => [item.id, item] as const));
  const residentById = new Map(residents.map((item) => [item.id, item] as const));
  const warningById = new Map(warnings.map((item) => [item.id, item] as const));

  const linksByHandover = new Map<string, LinkRow[]>();
  links.forEach((link) => {
    const current = linksByHandover.get(link.handover_id) ?? [];
    current.push(link);
    linksByHandover.set(link.handover_id, current);
  });

  function warningLabel(warningId: string) {
    const warning = warningById.get(warningId);
    if (!warning) return "Ocorrência";
    const name = residentById.get(warning.resident_id)?.full_name ?? "Residente";
    const text = warning.original_text.length > 60 ? `${warning.original_text.slice(0, 60)}…` : warning.original_text;
    return `${name} — ${text}`;
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!lodgeId || !userId) {
      setError("Selecione uma unidade e confirme a sessão antes de registar.");
      return;
    }

    const trimmedSummary = summary.trim();
    if (!trimmedSummary) {
      setError("Indique o resumo da passagem de turno.");
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);

    const { error: insertError } = await supabase.from("handovers").insert({
      lodge_id: lodgeId,
      author_id: userId,
      summary: trimmedSummary,
      body: body.trim(),
      original_language: language as "pt" | "en",
      occurred_at: new Date().toISOString(),
    });

    setBusy(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setSummary("");
    setBody("");
    setNotice("Passagem de turno registada.");
    await load();
  }

  async function handleLink(handoverId: string) {
    const warningId = linkChoices[handoverId];

    if (!warningId) {
      setError("Escolha uma ocorrência para ligar.");
      return;
    }

    if (!userId) {
      setError("Sessão sem utilizador associado: volte a iniciar sessão.");
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);

    const { error: insertError } = await supabase.from("handover_warning_links").insert({
      handover_id: handoverId,
      warning_id: warningId,
      linked_by: userId,
    });

    setBusy(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setLinkChoices((prev) => ({ ...prev, [handoverId]: "" }));
    setNotice("Ocorrência ligada à passagem de turno.");
    await load();
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-10">
        <header className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight">Passagens de turno</h1>
            <p className="text-sm text-muted-foreground">
              Registo do que fica para o turno seguinte, com ligação às ocorrências relevantes.
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
          <h2 className="text-lg font-semibold">Nova passagem de turno</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Um resumo curto e um detalhe opcional. O autor é o utilizador com sessão iniciada.
          </p>

          <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={handleCreate}>
            <div className="space-y-1 sm:col-span-2">
              <label className="text-sm font-medium" htmlFor="handover-summary">
                Resumo
              </label>
              <input
                id="handover-summary"
                className={inputClass}
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
                required
              />
            </div>

            <div className="space-y-1 sm:col-span-2">
              <label className="text-sm font-medium" htmlFor="handover-body">
                Detalhe
              </label>
              <textarea
                id="handover-body"
                className={`${inputClass} min-h-28`}
                value={body}
                onChange={(event) => setBody(event.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="handover-language">
                Idioma original
              </label>
              <select
                id="handover-language"
                className={inputClass}
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
                disabled={busy}
              >
                {LANGUAGES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end">
              <button type="submit" className={primaryButton} disabled={busy || !lodgeId}>
                Registar passagem
              </button>
            </div>
          </form>
        </section>

        <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Passagens registadas</h2>
              <p className="text-sm text-muted-foreground">{handovers.length} registo(s) nesta unidade.</p>
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
          ) : handovers.length === 0 ? (
            <p className="mt-6 text-sm text-muted-foreground">Nenhuma passagem de turno registada.</p>
          ) : (
            <ul className="mt-4 space-y-4">
              {handovers.map((handover) => {
                const author = profileById.get(handover.author_id);
                const handoverLinks = linksByHandover.get(handover.id) ?? [];
                const linkedWarningIds = new Set(handoverLinks.map((link) => link.warning_id));
                const availableWarnings = warnings.filter((warning) => !linkedWarningIds.has(warning.id));

                return (
                  <li key={handover.id} className="rounded-lg border border-border p-4">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                      <p className="font-semibold">{handover.summary}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(handover.occurred_at)} · {author?.display_name || "Utilizador"} · idioma{" "}
                        {handover.original_language}
                      </p>
                    </div>

                    {handover.body ? (
                      <p className="mt-2 whitespace-pre-line text-sm text-foreground">{handover.body}</p>
                    ) : null}

                    <div className="mt-4 space-y-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Ocorrências ligadas
                      </p>
                      {handoverLinks.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Nenhuma ocorrência ligada.</p>
                      ) : (
                        <ul className="space-y-1">
                          {handoverLinks.map((link) => (
                            <li key={`${link.handover_id}-${link.warning_id}`} className="text-sm text-foreground">
                              • {warningLabel(link.warning_id)}
                            </li>
                          ))}
                        </ul>
                      )}

                      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                        <div className="w-full space-y-1 sm:max-w-md">
                          <label
                            className="text-xs font-medium text-muted-foreground"
                            htmlFor={`link-${handover.id}`}
                          >
                            Ligar ocorrência
                          </label>
                          <select
                            id={`link-${handover.id}`}
                            className={inputClass}
                            value={linkChoices[handover.id] ?? ""}
                            onChange={(event) =>
                              setLinkChoices((prev) => ({ ...prev, [handover.id]: event.target.value }))
                            }
                            disabled={busy || availableWarnings.length === 0}
                          >
                            <option value="">Escolher…</option>
                            {availableWarnings.map((warning) => (
                              <option key={warning.id} value={warning.id}>
                                {warningLabel(warning.id)}
                              </option>
                            ))}
                          </select>
                        </div>
                        <button
                          type="button"
                          className={secondaryButton}
                          onClick={() => void handleLink(handover.id)}
                          disabled={busy || !linkChoices[handover.id]}
                        >
                          Ligar
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
