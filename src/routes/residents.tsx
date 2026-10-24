import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useActiveLodge } from "@/lib/lodge";

export const Route = createFileRoute("/residents")({
  component: ResidentsPage,
});

type Resident = {
  id: string;
  full_name: string;
  reference: string | null;
  nationality: string | null;
  phone: string | null;
  date_of_birth: string | null;
};

type Stay = {
  id: string;
  resident_id: string;
  started_at: string;
  ended_at: string | null;
  exit_reason: string | null;
};

type Accommodation = {
  id: string;
  code: string;
  kind: string;
  floor: string | null;
};

type Bed = {
  id: string;
  accommodation_id: string;
  label: string;
};

type Assignment = {
  id: string;
  stay_id: string;
  bed_id: string;
  started_at: string;
};

const inputClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring";

const primaryButton =
  "inline-flex items-center justify-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50";

const secondaryButton =
  "inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-2 text-sm font-medium text-foreground transition hover:bg-accent hover:text-accent-foreground disabled:opacity-50";

function formatDateTime(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" });
}

function ResidentsPage() {
  const { lodges, lodgeId, selectLodge, userId, loading: lodgeLoading, error: lodgeError } = useActiveLodge();

  const [residents, setResidents] = useState<Resident[]>([]);
  const [stays, setStays] = useState<Stay[]>([]);
  const [accommodations, setAccommodations] = useState<Accommodation[]>([]);
  const [beds, setBeds] = useState<Bed[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [search, setSearch] = useState("");
  const [fullName, setFullName] = useState("");
  const [reference, setReference] = useState("");
  const [nationality, setNationality] = useState("");
  const [phone, setPhone] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [exitReasons, setExitReasons] = useState<Record<string, string>>({});
  const [bedChoices, setBedChoices] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!lodgeId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const [residentRes, stayRes, accommodationRes] = await Promise.all([
      supabase
        .from("residents")
        .select("id, full_name, reference, nationality, phone, date_of_birth")
        .order("full_name", { ascending: true }),
      supabase
        .from("stays")
        .select("id, resident_id, started_at, ended_at, exit_reason")
        .eq("lodge_id", lodgeId)
        .order("started_at", { ascending: false }),
      supabase
        .from("accommodations")
        .select("id, code, kind, floor")
        .eq("lodge_id", lodgeId)
        .eq("active", true)
        .order("code", { ascending: true }),
    ]);

    const firstError = residentRes.error ?? stayRes.error ?? accommodationRes.error;
    if (firstError) {
      setError(firstError.message);
      setLoading(false);
      return;
    }

    const accommodationList = (accommodationRes.data ?? []) as Accommodation[];
    let bedList: Bed[] = [];

    if (accommodationList.length > 0) {
      const { data: bedData, error: bedError } = await supabase
        .from("beds")
        .select("id, accommodation_id, label")
        .in("accommodation_id", accommodationList.map((item) => item.id))
        .order("label", { ascending: true });

      if (bedError) {
        setError(bedError.message);
        setLoading(false);
        return;
      }

      bedList = (bedData ?? []) as Bed[];
    }

    const { data: assignmentData, error: assignmentError } = await supabase
      .from("bed_assignments")
      .select("id, stay_id, bed_id, started_at")
      .eq("lodge_id", lodgeId)
      .is("ended_at", null);

    if (assignmentError) {
      setError(assignmentError.message);
      setLoading(false);
      return;
    }

    setResidents((residentRes.data ?? []) as Resident[]);
    setStays((stayRes.data ?? []) as Stay[]);
    setAccommodations(accommodationList);
    setBeds(bedList);
    setAssignments((assignmentData ?? []) as Assignment[]);
    setLoading(false);
  }, [lodgeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeStays = stays.filter((stay) => stay.ended_at === null);

  const residentById = new Map(residents.map((item) => [item.id, item] as const));
  const accommodationById = new Map(accommodations.map((item) => [item.id, item] as const));
  const bedById = new Map(beds.map((item) => [item.id, item] as const));
  const assignmentByStay = new Map(assignments.map((item) => [item.stay_id, item] as const));
  const activeStayByResident = new Map(activeStays.map((item) => [item.resident_id, item] as const));
  const occupiedBedIds = new Set(assignments.map((item) => item.bed_id));

  const filteredResidents = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return residents;
    return residents.filter((item) =>
      [item.full_name, item.reference ?? "", item.nationality ?? ""].some((value) =>
        value.toLowerCase().includes(term),
      ),
    );
  }, [residents, search]);

  function bedLabel(bedId: string) {
    const bed = bedById.get(bedId);
    if (!bed) return "—";
    const accommodation = accommodationById.get(bed.accommodation_id);
    return `${accommodation?.code ?? "?"} · ${bed.label}`;
  }

  async function handleCreateResident(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!userId) {
      setError("Sessão sem utilizador associado: volte a iniciar sessão.");
      return;
    }

    const trimmedName = fullName.trim();
    if (!trimmedName) {
      setError("Indique o nome completo do residente.");
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);

    const { error: insertError } = await supabase.from("residents").insert({
      full_name: trimmedName,
      reference: reference.trim() || null,
      nationality: nationality.trim() || null,
      phone: phone.trim() || null,
      date_of_birth: dateOfBirth || null,
      created_by: userId,
    });

    setBusy(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setFullName("");
    setReference("");
    setNationality("");
    setPhone("");
    setDateOfBirth("");
    setNotice("Residente criado.");
    await load();
  }

  async function handleCheckIn(residentId: string) {
    if (!lodgeId || !userId) {
      setError("Selecione uma unidade e confirme a sessão antes do check-in.");
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);

    const { error: insertError } = await supabase.from("stays").insert({
      resident_id: residentId,
      lodge_id: lodgeId,
      started_at: new Date().toISOString(),
      created_by: userId,
    });

    setBusy(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setNotice("Check-in registado.");
    await load();
  }

  async function handleCheckOut(stay: Stay) {
    setBusy(true);
    setError(null);
    setNotice(null);

    const now = new Date().toISOString();
    const reason = (exitReasons[stay.id] ?? "").trim();

    const { error: updateError } = await supabase
      .from("stays")
      .update({ ended_at: now, exit_reason: reason || null })
      .eq("id", stay.id);

    if (updateError) {
      setBusy(false);
      setError(updateError.message);
      return;
    }

    await supabase
      .from("bed_assignments")
      .update({ ended_at: now })
      .eq("stay_id", stay.id)
      .is("ended_at", null);

    setBusy(false);
    setNotice("Check-out registado.");
    await load();
  }

  async function handleAssignBed(stay: Stay) {
    const bedId = bedChoices[stay.id];

    if (!bedId) {
      setError("Escolha uma cama para atribuir.");
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);

    const { error: insertError } = await supabase.from("bed_assignments").insert({
      stay_id: stay.id,
      bed_id: bedId,
      started_at: new Date().toISOString(),
      lodge_id: lodgeId,
    });

    setBusy(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setBedChoices((prev) => ({ ...prev, [stay.id]: "" }));
    setNotice("Cama atribuída.");
    await load();
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-10">
        <header className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight">Residentes e estadias</h1>
            <p className="text-sm text-muted-foreground">
              Check-in, check-out e atribuição de camas para a unidade selecionada.
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
          <h2 className="text-lg font-semibold">Novo residente</h2>
          <p className="mt-1 text-sm text-muted-foreground">Cria o registo base antes do check-in.</p>
          <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={handleCreateResident}>
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="resident-name">
                Nome completo
              </label>
              <input
                id="resident-name"
                className={inputClass}
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="resident-reference">
                Referência
              </label>
              <input
                id="resident-reference"
                className={inputClass}
                value={reference}
                onChange={(event) => setReference(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="resident-nationality">
                Nacionalidade
              </label>
              <input
                id="resident-nationality"
                className={inputClass}
                value={nationality}
                onChange={(event) => setNationality(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="resident-phone">
                Telefone
              </label>
              <input
                id="resident-phone"
                className={inputClass}
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="resident-dob">
                Data de nascimento
              </label>
              <input
                id="resident-dob"
                type="date"
                className={inputClass}
                value={dateOfBirth}
                onChange={(event) => setDateOfBirth(event.target.value)}
              />
            </div>
            <div className="flex items-end">
              <button type="submit" className={primaryButton} disabled={busy || !lodgeId}>
                Guardar residente
              </button>
            </div>
          </form>
        </section>

        <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Estadias em curso</h2>
              <p className="text-sm text-muted-foreground">{activeStays.length} estadia(s) ativa(s).</p>
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
          ) : activeStays.length === 0 ? (
            <p className="mt-6 text-sm text-muted-foreground">Nenhuma estadia ativa nesta unidade.</p>
          ) : (
            <ul className="mt-4 divide-y divide-border">
              {activeStays.map((stay) => {
                const resident = residentById.get(stay.resident_id);
                const assignment = assignmentByStay.get(stay.id);
                const freeBeds = beds.filter((bed) => !occupiedBedIds.has(bed.id));

                return (
                  <li key={stay.id} className="py-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                      <div className="space-y-1">
                        <p className="font-medium">{resident?.full_name ?? "Residente"}</p>
                        <p className="text-sm text-muted-foreground">Entrada: {formatDateTime(stay.started_at)}</p>
                        <p className="text-sm text-muted-foreground">
                          Cama: {assignment ? bedLabel(assignment.bed_id) : "sem cama atribuída"}
                        </p>
                      </div>

                      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                        <div className="space-y-1">
                          <label
                            className="text-xs font-medium text-muted-foreground"
                            htmlFor={`bed-${stay.id}`}
                          >
                            Atribuir cama
                          </label>
                          <select
                            id={`bed-${stay.id}`}
                            className={inputClass}
                            value={bedChoices[stay.id] ?? ""}
                            onChange={(event) =>
                              setBedChoices((prev) => ({ ...prev, [stay.id]: event.target.value }))
                            }
                            disabled={busy || freeBeds.length === 0}
                          >
                            <option value="">Escolher…</option>
                            {freeBeds.map((bed) => (
                              <option key={bed.id} value={bed.id}>
                                {bedLabel(bed.id)}
                              </option>
                            ))}
                          </select>
                        </div>
                        <button
                          type="button"
                          className={secondaryButton}
                          onClick={() => void handleAssignBed(stay)}
                          disabled={busy || !bedChoices[stay.id]}
                        >
                          Atribuir
                        </button>
                        <div className="space-y-1">
                          <label
                            className="text-xs font-medium text-muted-foreground"
                            htmlFor={`exit-${stay.id}`}
                          >
                            Motivo de saída
                          </label>
                          <input
                            id={`exit-${stay.id}`}
                            className={inputClass}
                            value={exitReasons[stay.id] ?? ""}
                            placeholder="opcional"
                            onChange={(event) =>
                              setExitReasons((prev) => ({ ...prev, [stay.id]: event.target.value }))
                            }
                          />
                        </div>
                        <button
                          type="button"
                          className={primaryButton}
                          onClick={() => void handleCheckOut(stay)}
                          disabled={busy}
                        >
                          Check-out
                        </button>
                      </div>
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
              <h2 className="text-lg font-semibold">Residentes</h2>
              <p className="text-sm text-muted-foreground">
                Check-in direto para quem ainda não tem estadia ativa.
              </p>
            </div>
            <input
              className={`${inputClass} sm:max-w-xs`}
              value={search}
              placeholder="Procurar por nome…"
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <ul className="mt-4 divide-y divide-border">
            {filteredResidents.map((resident) => {
              const activeStay = activeStayByResident.get(resident.id);

              return (
                <li
                  key={resident.id}
                  className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium">{resident.full_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {[resident.reference, resident.nationality, resident.phone]
                        .filter(Boolean)
                        .join(" · ") || "sem referência"}
                    </p>
                  </div>
                  {activeStay ? (
                    <span className="rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-medium">
                      Em estadia
                    </span>
                  ) : (
                    <button
                      type="button"
                      className={secondaryButton}
                      onClick={() => void handleCheckIn(resident.id)}
                      disabled={busy || !lodgeId}
                    >
                      Fazer check-in
                    </button>
                  )}
                </li>
              );
            })}
            {filteredResidents.length === 0 ? (
              <li className="py-3 text-sm text-muted-foreground">Sem residentes para mostrar.</li>
            ) : null}
          </ul>
        </section>
      </div>
    </div>
  );
}
