import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { useLodgeState } from "@/lib/activeLodge";
import { useI18n, type MessageKey } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { errorKey } from "@/lib/errors";
import { Dialog, DialogCancel } from "@/components/Dialog";
import { LodgeTabs } from "@/components/LodgeTabs";
import { Notice } from "@/components/Notice";
import { Skeleton } from "@/components/Skeleton";
import { Tabs } from "@/components/Tabs";
import { useToast } from "@/components/Toast";

type Bed = { id: string; number: number; active: boolean; status: "in_use" | "out_of_service" };
type Room = { id: string; code: string; kind: "room" | "apartment"; active: boolean; sort_order: number; beds: Bed[] };
type Fridge = { id: string; code: string; name: string; active: boolean };
type Machine = { id: string; code: string; label: string; kind: "wash" | "dry"; active: boolean };
type Tab = "rooms" | "fridges" | "laundry" | "houses";

/** Estrutura (Admin): quartos e camas, geladeiras, máquinas de lavar e dados das casas. "Remover" desativa; o histórico fica. */
export function Structure() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const tab = (["rooms", "fridges", "laundry", "houses"].includes(params.get("tab") ?? "") ? params.get("tab") : "rooms") as Tab;
  const [lodgeId, setLodgeId] = useLodgeState();
  return (
    <section className="page">
      <header className="page-header">
        <div>
          <span className="eyebrow">{t("structure.eyebrow")}</span>
          <h1>{t("structure.title")}</h1>
        </div>
        {tab !== "houses" && <LodgeTabs value={lodgeId} onChange={setLodgeId} />}
      </header>
      <Tabs label={t("structure.title")} value={tab} onChange={(v) => setParams(v === "rooms" ? {} : { tab: v }, { replace: true })}
        items={[
          { value: "rooms", label: t("structure.tabRooms") }, { value: "fridges", label: t("structure.tabFridges") },
          { value: "laundry", label: t("structure.tabLaundry") }, { value: "houses", label: t("structure.tabHouses") },
        ]} />
      {tab === "rooms" && <Rooms lodgeId={lodgeId} />}
      {tab === "fridges" && <Fridges lodgeId={lodgeId} />}
      {tab === "laundry" && <Laundry lodgeId={lodgeId} />}
      {tab === "houses" && <Houses />}
    </section>
  );
}

/** Chama a função do banco; erro vira mensagem clara; sucesso recarrega. */
function useAction(reload: () => Promise<void>) {
  const { t } = useI18n();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async (name: string, args: Record<string, unknown>, ok?: MessageKey) => {
    setError(null);
    const { error: e } = await supabase.rpc(name, args);
    if (e) { setError(t(errorKey(e))); return false; }
    if (ok) toast.success(t(ok));
    await reload();
    return true;
  }, [reload, t, toast]);
  return { run, error };
}

function Removed({ count, children }: { count: number; children: ReactNode }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  if (count === 0) return null;
  return (
    <div className="removed-block">
      <button type="button" className="small" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{t("structure.removed", { n: count })}</button>
      {open && children}
    </div>
  );
}

function SimpleDialog({ title, submit, onClose, onSave, children, ready }: {
  title: string; submit: string; onClose: () => void; onSave: () => Promise<boolean>; children: ReactNode; ready: boolean;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  async function go(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    if (await onSave()) onClose();
    setBusy(false);
  }
  return (
    <Dialog title={title} onClose={onClose}
      footer={<><DialogCancel>{t("app.cancel")}</DialogCancel><button type="submit" form="structure-form" className="primary" disabled={busy || !ready}>{submit}</button></>}>
      <form id="structure-form" className="form" onSubmit={(e) => void go(e)}>{children}</form>
    </Dialog>
  );
}

function Rooms({ lodgeId }: { lodgeId: string }) {
  const { t } = useI18n();
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [occupied, setOccupied] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<Room | null>(null);

  const load = useCallback(async () => {
    const [{ data: r }, { data: o }] = await Promise.all([
      supabase.from("rooms").select("id, code, kind, active, sort_order, beds(id, number, active, status)").eq("lodge_id", lodgeId).order("sort_order"),
      supabase.from("bed_occupancy").select("bed_id, stay_id").eq("lodge_id", lodgeId),
    ]);
    setRooms(((r ?? []) as Room[]).map((x) => ({ ...x, beds: [...x.beds].sort((a, b) => a.number - b.number) })));
    setOccupied(new Set(((o ?? []) as { bed_id: string; stay_id: string | null }[]).filter((x) => x.stay_id).map((x) => x.bed_id)));
  }, [lodgeId]);
  useEffect(() => { setRooms(null); void load(); }, [load]);
  const { run, error } = useAction(load);

  if (!rooms) return <div className="card"><Skeleton rows={5} label={t("app.loading")} /></div>;
  const label = (r: Room) => t(r.kind === "apartment" ? "structure.apartmentN" : "structure.roomN", { code: r.code });
  const active = rooms.filter((r) => r.active);
  const gone = rooms.filter((r) => !r.active);
  const beds = active.reduce((n, r) => n + r.beds.filter((b) => b.active).length, 0);
  return (
    <>
      <div className="toolbar">
        <span className="muted">{t("structure.summary", { rooms: active.length, beds })}</span>
        <button type="button" className="primary" onClick={() => setAdding(true)}><Plus size={16} aria-hidden="true" /> {t("structure.addRoom")}</button>
      </div>
      <Notice kind="error">{error}</Notice>
      <div className="structure-grid">
        {active.map((r) => (
          <article className="card structure-room" key={r.id}>
            <header>
              <h3>{label(r)}</h3>
              <div className="inline">
                <button type="button" className="small" onClick={() => void run("add_bed", { p_room: r.id })}>{t("structure.addBed")}</button>
                <button type="button" className="small" onClick={() => setRenaming(r)}>{t("structure.rename")}</button>
                <button type="button" className="small danger-outline" onClick={() => void run("set_room_active", { p_room: r.id, p_active: false })}>{t("structure.removeRoom")}</button>
              </div>
            </header>
            <ul className="bed-list">
              {r.beds.map((b) => (
                <li key={b.id} className={b.active ? "" : "is-removed"}>
                  <span>{t("structure.bedN", { n: b.number })}</span>
                  {occupied.has(b.id) && <span className="tag">{t("structure.occupied")}</span>}
                  {b.active && !occupied.has(b.id) && (
                    <button type="button" className="chip-x" aria-label={t("structure.removeBed", { n: b.number })} onClick={() => void run("set_bed_active", { p_bed: b.id, p_active: false })}>×</button>
                  )}
                  {!b.active && <button type="button" className="small" aria-label={t("structure.restoreBed", { n: b.number })} onClick={() => void run("set_bed_active", { p_bed: b.id, p_active: true })}>{t("structure.restore")}</button>}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
      <Removed count={gone.length}>
        <ul className="removed-list">
          {gone.map((r) => (
            <li key={r.id}>
              <span>{label(r)}</span>
              <button type="button" className="small" aria-label={t("structure.restoreRoom", { code: r.code })} onClick={() => void run("set_room_active", { p_room: r.id, p_active: true })}>{t("structure.restore")}</button>
            </li>
          ))}
        </ul>
      </Removed>
      {adding && <AddRoom lodgeId={lodgeId} onClose={() => setAdding(false)} run={run} />}
      {renaming && <RenameRoom room={renaming} onClose={() => setRenaming(null)} run={run} />}
    </>
  );
}

function AddRoom({ lodgeId, onClose, run }: { lodgeId: string; onClose: () => void; run: ReturnType<typeof useAction>["run"] }) {
  const { t } = useI18n();
  const [code, setCode] = useState("");
  const [kind, setKind] = useState<"room" | "apartment">("room");
  const [beds, setBeds] = useState("1");
  return (
    <SimpleDialog title={t("structure.addRoom")} submit={t("structure.addRoom")} onClose={onClose} ready={code.trim() !== ""}
      onSave={() => run("add_room", { p_lodge: lodgeId, p_code: code, p_kind: kind, p_beds: Number(beds) }, "structure.saved")}>
      <label>{t("structure.room")}<input required value={code} maxLength={20} onChange={(e) => setCode(e.target.value)} autoFocus /></label>
      <label>{t("structure.type")}
        <select value={kind} onChange={(e) => setKind(e.target.value as "room" | "apartment")}>
          <option value="room">{t("structure.kindRoom")}</option>
          <option value="apartment">{t("structure.kindApartment")}</option>
        </select>
      </label>
      <label>{t("structure.beds")}<input type="number" min={1} max={12} value={beds} onChange={(e) => setBeds(e.target.value)} /></label>
    </SimpleDialog>
  );
}

function RenameRoom({ room, onClose, run }: { room: Room; onClose: () => void; run: ReturnType<typeof useAction>["run"] }) {
  const { t } = useI18n();
  const [code, setCode] = useState(room.code);
  return (
    <SimpleDialog title={t("structure.rename")} submit={t("app.save")} onClose={onClose} ready={code.trim() !== ""} onSave={() => run("rename_room", { p_room: room.id, p_code: code }, "structure.saved")}>
      <label>{t("structure.room")}<input required value={code} maxLength={20} onChange={(e) => setCode(e.target.value)} autoFocus /></label>
    </SimpleDialog>
  );
}

function Fridges({ lodgeId }: { lodgeId: string }) {
  const { t } = useI18n();
  const [list, setList] = useState<Fridge[] | null>(null);
  const [dialog, setDialog] = useState<null | "add" | Fridge>(null);
  const load = useCallback(async () => {
    const { data } = await supabase.from("fridges").select("id, code, name, active, sort_order").eq("lodge_id", lodgeId).order("sort_order");
    setList((data ?? []) as Fridge[]);
  }, [lodgeId]);
  useEffect(() => { setList(null); void load(); }, [load]);
  const { run, error } = useAction(load);
  if (!list) return <div className="card"><Skeleton rows={3} label={t("app.loading")} /></div>;
  const active = list.filter((f) => f.active);
  const gone = list.filter((f) => !f.active);
  return (
    <>
      <div className="toolbar"><span className="muted">{t("structure.fridgesCount", { n: active.length })}</span><button type="button" className="primary" onClick={() => setDialog("add")}><Plus size={16} aria-hidden="true" /> {t("structure.addFridge")}</button></div>
      <Notice kind="error">{error}</Notice>
      <ul className="item-list">
        {active.map((f) => (
          <li key={f.id} className="card">
            <span><strong>{f.name}</strong> <span className="muted">{f.code}</span></span>
            <span className="inline">
              <button type="button" className="small" onClick={() => setDialog(f)}>{t("structure.rename")}</button>
              <button type="button" className="small danger-outline" aria-label={t("structure.removeNamed", { name: f.name })} onClick={() => void run("set_fridge_active", { p_fridge: f.id, p_active: false })}>{t("structure.remove")}</button>
            </span>
          </li>
        ))}
      </ul>
      <Removed count={gone.length}>
        <ul className="removed-list">
          {gone.map((f) => (
            <li key={f.id}><span>{f.name}</span><button type="button" className="small" aria-label={t("structure.restoreNamed", { name: f.name })} onClick={() => void run("set_fridge_active", { p_fridge: f.id, p_active: true })}>{t("structure.restore")}</button></li>
          ))}
        </ul>
      </Removed>
      {dialog && <NamedDialog title={dialog === "add" ? t("structure.addFridge") : t("structure.rename")} submit={dialog === "add" ? t("structure.addFridge") : t("app.save")} initial={dialog === "add" ? "" : dialog.name}
        onClose={() => setDialog(null)} onSave={(name) => (dialog === "add" ? run("add_fridge", { p_lodge: lodgeId, p_name: name }, "structure.saved") : run("rename_fridge", { p_fridge: dialog.id, p_name: name }, "structure.saved"))} />}
    </>
  );
}

function NamedDialog({ title, submit, initial, onClose, onSave, kind }: {
  title: string; submit: string; initial: string; onClose: () => void; onSave: (name: string, kind: "wash" | "dry") => Promise<boolean>; kind?: boolean;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(initial);
  const [k, setK] = useState<"wash" | "dry">("wash");
  return (
    <SimpleDialog title={title} submit={submit} onClose={onClose} ready={name.trim() !== ""} onSave={() => onSave(name, k)}>
      <label>{t("structure.name")}<input required value={name} maxLength={40} onChange={(e) => setName(e.target.value)} autoFocus /></label>
      {kind && (
        <label>{t("structure.type")}
          <select value={k} onChange={(e) => setK(e.target.value as "wash" | "dry")}>
            <option value="wash">{t("structure.wash")}</option>
            <option value="dry">{t("structure.dry")}</option>
          </select>
        </label>
      )}
    </SimpleDialog>
  );
}

function Laundry({ lodgeId }: { lodgeId: string }) {
  const { t } = useI18n();
  const [list, setList] = useState<Machine[] | null>(null);
  const [dialog, setDialog] = useState<null | "add" | Machine>(null);
  const load = useCallback(async () => {
    const { data } = await supabase.from("laundry_machines").select("id, code, label, kind, active, sort_order").eq("lodge_id", lodgeId).order("sort_order");
    setList((data ?? []) as Machine[]);
  }, [lodgeId]);
  useEffect(() => { setList(null); void load(); }, [load]);
  const { run, error } = useAction(load);
  if (!list) return <div className="card"><Skeleton rows={3} label={t("app.loading")} /></div>;
  const active = list.filter((m) => m.active);
  const gone = list.filter((m) => !m.active);
  return (
    <>
      <div className="toolbar"><span className="muted">{t("structure.machinesCount", { n: active.length })}</span><button type="button" className="primary" onClick={() => setDialog("add")}><Plus size={16} aria-hidden="true" /> {t("structure.addMachine")}</button></div>
      <Notice kind="error">{error}</Notice>
      <ul className="item-list">
        {active.map((m) => (
          <li key={m.id} className="card">
            <span><strong>{m.label}</strong> <span className="tag">{t(m.kind === "wash" ? "structure.wash" : "structure.dry")}</span></span>
            <span className="inline">
              <button type="button" className="small" onClick={() => setDialog(m)}>{t("structure.rename")}</button>
              <button type="button" className="small danger-outline" aria-label={t("structure.removeNamed", { name: m.label })} onClick={() => void run("set_laundry_machine_active", { p_machine: m.id, p_active: false })}>{t("structure.remove")}</button>
            </span>
          </li>
        ))}
      </ul>
      <Removed count={gone.length}>
        <ul className="removed-list">
          {gone.map((m) => (
            <li key={m.id}><span>{m.label}</span><button type="button" className="small" aria-label={t("structure.restoreNamed", { name: m.label })} onClick={() => void run("set_laundry_machine_active", { p_machine: m.id, p_active: true })}>{t("structure.restore")}</button></li>
          ))}
        </ul>
      </Removed>
      {dialog && <NamedDialog kind={dialog === "add"} title={dialog === "add" ? t("structure.addMachine") : t("structure.rename")} submit={dialog === "add" ? t("structure.addMachine") : t("app.save")} initial={dialog === "add" ? "" : dialog.label}
        onClose={() => setDialog(null)}
        onSave={(name, kind) => (dialog === "add" ? run("add_laundry_machine", { p_lodge: lodgeId, p_kind: kind, p_label: name }, "structure.saved") : run("rename_laundry_machine", { p_machine: dialog.id, p_label: name }, "structure.saved"))} />}
    </>
  );
}

function Houses() {
  const { lodges } = useAuth();
  return (
    <div className="settings-grid">
      {lodges.map((l) => <HouseForm key={l.id} lodge={l} />)}
    </div>
  );
}

function HouseForm({ lodge }: { lodge: { id: string; name: string; short_name: string; has_dinner: boolean; has_laundry: boolean } }) {
  const { t } = useI18n();
  const { refresh } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(lodge.name);
  const [short, setShort] = useState(lodge.short_name);
  const [dinner, setDinner] = useState(lodge.has_dinner);
  const [laundry, setLaundry] = useState(lodge.has_laundry);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    setError(null);
    const { error: e } = await supabase.rpc("update_lodge", { p_lodge: lodge.id, p_name: name, p_short_name: short, p_has_dinner: dinner, p_has_laundry: laundry });
    if (e) return setError(t(errorKey(e)));
    await refresh?.();
    toast.success(t("structure.saved"));
  }
  return (
    <article className="card system-section">
      <h2 className="section-title">{lodge.short_name}</h2>
      <div className="system-fields">
        <label className="filter-field"><span>{t("structure.name")}</span><input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} /></label>
        <label className="filter-field"><span>{t("structure.shortName")}</span><input value={short} maxLength={30} onChange={(e) => setShort(e.target.value)} /></label>
      </div>
      <label className="switch-row"><span>{t("structure.dinner")}</span><input type="checkbox" role="switch" checked={dinner} onChange={(e) => setDinner(e.target.checked)} aria-label={t("structure.dinner")} /></label>
      <label className="switch-row"><span>{t("structure.laundry")}</span><input type="checkbox" role="switch" checked={laundry} onChange={(e) => setLaundry(e.target.checked)} aria-label={t("structure.laundry")} /></label>
      <Notice kind="error">{error}</Notice>
      <button type="button" className="primary" onClick={() => void save()}>{t("app.save")}</button>
    </article>
  );
}
