import { useCallback, useEffect, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useActiveLodge } from "@/lib/lodge";

export const Route = createFileRoute("/warnings")({
  component: WarningsPage,
});

type ResidentRow = {
  id: string;
  full_name: string;
};

type StayRow = {
  id: string;
  resident_id: string;
};

type WarningRow = {
  id: string;
  resident_id: string;
  stay_id: string;
  original_text: string;
  original_language: string;
  occurred_at: string;
  author_id: string;
  category: string;
  voided: boolean;
};

const CATEGORIES = [
  { value: "verbal", label: "Verbal" },
  { value: "physical", label: "Físico" },
  { value: "property", label: "Danos / propriedade" },
  { value: "safety", label: "Segurança" },
  { value: "other", label: "Outro" },
];

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

function categoryLabel(value: string) {
  return CATEGORIES.find((item) => item.value === value)?.label ?? value;
}

function WarningsPage() {
  const { lodges, lodgeId, selectLodge, userId, loading: lodgeLoading, error: lodgeError } = useActiveLodge();

  const [residents, setResidents] = useState<ResidentRow[]>([]);
  const [stays, setStays] = useState<StayRow[]>([]);
  const [warnings, setWarnings] = useState<WarningRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [residentId, setResidentId] = useState("");
  const [category, setCategory] = useState("verbal");
  const [language, setLanguage] = useState("pt");
  const [originalText, setOriginalText] = useState("");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    if (!lodgeId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const [residentRes, stayRes, warningRes] = await Promise.all([
      supabase.from("residents").select("id, full_name").order("full_name", { ascending: true }),
      supabase
        .from("stays")
        .select("id, resident_id")
        .eq("lodge_id", lodgeId)
        .is("ended_at", null),
      supabase
        .from("resident_warnings")
        .select(
          "id, resident_id, stay_id, original_text, original_language, occurred_at, author_id, category, voided",
        )
        .eq("lodge_id", lodgeId)
        .order("occurred_at", { ascending: false })
        .limit(100),
    ]);

    const firstError = residentRes.error ?? stayRes.error ?? warningRes.error;
    if (firstError) {
      setError(firstError.message);
      setLoading(false);
      return;
    }

    setResidents((residentRes.data ?? []) as ResidentRow[]);
    setStays((stayRes.data ?? []) as StayRow[]);
    setWarnings((warningRes.data ?? []) as WarningRow[]);
    setLoading(false);
  }, [lodgeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const residentById = new Map(residents.map((item) => [item.id, item] as const));
  const activeStayByResident = new Map(stays.map((item) => [item.resident_id, item] as const));
  const residentsInStay = residents.filter((resident) => activeStayByResident.has(resident.id));

  const term = search.trim().toLowerCase();
  const filteredWarnings = term
    ? warnings.filter((warning) => {
        const name = residentById.get(warning.resident_id)?.full_name ?? "";
        return `${name} ${warning.original_text}`.toLowerCase().includes(term);
      })
    : warnings;

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!lodgeId || !userId) {
      setError("Selecione uma unidade e confirme a sessão antes de registar.");
      return;
    }

    const stay = activeStayByResident.get(residentId);
    if (!residentId || !stay) {
      setError("Escolha um residente com estadia ativa.");
      return;
    }

    const text = originalText.trim();
    if (!text) {
      setError("Escreva o texto da ocorrência.");
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);

    const { error: insertError } = await supabase.from("resident_warnings").insert({
      resident_id: residentId,
      stay_id: stay.id,
      lodge_id: lodgeId,
      original_text: text,
      original_language: language as "pt" | "en",
      occurred_at: new Date().toISOString(),
      author_id: userId,
      category,
    });

    setBusy(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setOriginalText("");
    setResidentId("");
    setNotice("Ocorrência registada.");
    await load();
  }

  async function handleVoid(warning: WarningRow) {
    setBusy(true);
    setError(null);
    setNotice(null);

    const { error: updateError } = await supabase
      .from("resident_warnings")
      .update({ voided: true, correction_reason: "Anulada a partir da lista de ocorrências." })
      .eq("id", warning.id);

    setBusy(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setNotice("Ocorrência anulada.");
    await load();
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-10">
        <header className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight">Ocorrências de residentes</h1>
            <p className="text-sm text-muted-foreground">
              Registos de incidentes por residente, ligados à estadia ativa na unidade selecionada.
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
          <h2 className="text-lg font-semibold">Nova ocorrência</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Escreva o texto original no idioma em que foi comunicado.
          </p>

          <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={handleCreate}>
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="warning-resident">
                Residente
              </label>
              <select
                id="warning-resident"
                className={inputClass}
                value={residentId}
                onChange={(event) => setResidentId(event.target.value)}
                disabled={busy || residentsInStay.length === 0}
              >
                <option value="">Escolher…</option>
                {residentsInStay.map((resident) => (
                  <option key={resident.id} value={resident.id}>
                    {resident.full_name}
                  </option>
                ))}
              </select>
              {residentsInStay.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Nenhum residente com estadia ativa nesta unidade.
                </p>
              ) : null}
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="warning-category">
                Categoria
              </label>
              <select
                id="warning-category"
                className={inputClass}
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                disabled={busy}
              >
                {CATEGORIES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="warning-language">
                Idioma original
              </label>
              <select
                id="warning-language"
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

            <div className="space-y-1 sm:col-span-2">
              <label className="text-sm font-medium" htmlFor="warning-text">
                Texto da ocorrência
              </label>
              <textarea
                id="warning-text"
                className={`${inputClass} min-h-24`}
                value={originalText}
                onChange={(event) => setOriginalText(event.target.value)}
                required
              />
            </div>

            <div className="flex items-end sm:col-span-2">
              <button
                type="submit"
                className={primaryButton}
                disabled={busy || !lodgeId || residentsInStay.length === 0}
              >
                Registar ocorrência
              </button>
            </div>
          </form>
        </section>

        <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Ocorrências registadas</h2>
              <p className="text-sm text-muted-foreground">{warnings.length} registo(s) nesta unidade.</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                className={`${inputClass} sm:max-w-xs`}
                value={search}
                placeholder="Procurar por residente ou texto…"
                onChange={(event) => setSearch(event.target.value)}
              />
              <button
                type="button"
                className={secondaryButton}
                onClick={() => void load()}
                disabled={loading || !lodgeId}
              >
                Atualizar
              </button>
            </div>
          </div>

          {loading ? (
            <p className="mt-6 text-sm text-muted-foreground">A carregar…</p>
          ) : filteredWarnings.length === 0 ? (
            <p className="mt-6 text-sm text-muted-foreground">Sem ocorrências para mostrar.</p>
          ) : (
            <ul className="mt-4 divide-y divide-border">
              {filteredWarnings.map((warning) => {
                const resident = residentById.get(warning.resident_id);

                return (
                  <li
                    key={warning.id}
                    className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{resident?.full_name ?? "Residente"}</p>
                        <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                          {categoryLabel(warning.category)}
                        </span>
                        {warning.voided ? (
                          <span className="rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
                            anulada
                          </span>
                        ) : null}
                      </div>
                      <p className="whitespace-pre-line text-sm text-foreground">{warning.original_text}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(warning.occurred_at)} · idioma {warning.original_language}
                      </p>
                    </div>
                    {warning.voided ? null : (
                      <button
                        type="button"
                        className={secondaryButton}
                        onClick={() => void handleVoid(warning)}
                        disabled={busy}
                      >
                        Anular
                      </button>
                    )}
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
