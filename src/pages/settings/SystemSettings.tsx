import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Plus, X } from "lucide-react";
import { useI18n, type MessageKey } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { errorKey } from "@/lib/errors";
import { Notice } from "@/components/Notice";
import { Skeleton } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";

type Row = { key: string; value: unknown; valid_from: string; lodge_id: string | null };
type Params = Record<string, unknown>;

/** Valor vigente de cada parâmetro geral (o mais recente que já começou). */
export function currentParams(rows: Row[], now = new Date()): Params {
  const out: Params = {};
  const seen: Record<string, string> = {};
  for (const r of rows) {
    if (r.lodge_id !== null || new Date(r.valid_from) > now) continue;
    if (!seen[r.key] || r.valid_from > seen[r.key]) { out[r.key] = r.value; seen[r.key] = r.valid_from; }
  }
  return out;
}

/** Seção com o próprio botão Salvar: grava só os parâmetros que ela controla. */
function Section({ id, title, hint, children, onSave }: {
  id: string; title: MessageKey; hint: MessageKey; children: ReactNode; onSave: () => Promise<void>;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    setBusy(true);
    setError(null);
    try {
      await onSave();
      toast.success(t("settings.saved"));
    } catch (e) {
      setError(t(errorKey(e as { message: string })));
    }
    setBusy(false);
  }
  return (
    <section className="card system-section" aria-labelledby={`${id}-h`}>
      <h2 className="section-title" id={`${id}-h`}>{t(title)}</h2>
      <p className="hint">{t(hint)}</p>
      <div className="system-fields">{children}</div>
      <Notice kind="error">{error}</Notice>
      <button type="button" className="primary" disabled={busy} onClick={() => void save()}>{busy ? t("app.saving") : t("app.save")}</button>
    </section>
  );
}

async function setParam(key: string, value: unknown) {
  const { error } = await supabase.rpc("set_system_parameter", { p_key: key, p_value: value });
  if (error) throw error;
}

function NumberField({ label, value, onChange, step = 1 }: { label: MessageKey; value: string; onChange: (v: string) => void; step?: number }) {
  const { t } = useI18n();
  return (
    <label className="filter-field">
      <span>{t(label)}</span>
      <input type="number" inputMode="decimal" step={step} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function TimeList({ times, onChange, inputLabel, addLabel }: { times: string[]; onChange: (t: string[]) => void; inputLabel: MessageKey; addLabel: MessageKey }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState("");
  const add = () => {
    if (!/^\d{2}:\d{2}$/.test(draft) || times.includes(draft)) return;
    onChange([...times, draft].sort());
    setDraft("");
  };
  return (
    <div className="time-list">
      <div className="chip-row">
        {times.map((x) => (
          <span className="filter-chip" key={x}>
            {x}
            <button type="button" aria-label={t("settings.removeTime", { time: x })} onClick={() => onChange(times.filter((y) => y !== x))}><X size={12} aria-hidden="true" /></button>
          </span>
        ))}
      </div>
      <div className="inline">
        <input type="time" aria-label={t(inputLabel)} value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button type="button" aria-label={t(addLabel)} onClick={add}><Plus size={14} aria-hidden="true" /> {t("settings.addTime")}</button>
      </div>
    </div>
  );
}

const num = (v: string) => (v.trim() === "" ? NaN : Number(v.replace(",", ".")));

/** Configurações do sistema (só Admin): parâmetros reais, cada um validado no banco. */
export function SystemSettings() {
  const { t } = useI18n();
  const [p, setP] = useState<Params | null>(null);
  const [version, setVersion] = useState(0);

  const load = useCallback(async () => {
    const { data } = await supabase.from("parameters").select("key, value, valid_from, lodge_id").is("lodge_id", null).order("valid_from", { ascending: false });
    setP(currentParams((data ?? []) as Row[]));
    setVersion((v) => v + 1);
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (!p) return <div className="card"><Skeleton rows={6} label={t("app.loading")} /></div>;
  return <SystemForms key={version} p={p} onSaved={load} />;
}

function SystemForms({ p, onSaved }: { p: Params; onSaved: () => Promise<void> }) {
  const { t } = useI18n();
  const str = (v: unknown, d = "") => (v === undefined || v === null ? d : String(v));
  const [checks, setChecks] = useState<string[]>((p["presence.check_times"] as string[]) ?? []);
  const [rounds, setRounds] = useState<string[]>((p["rounds.hours"] as string[]) ?? []);
  const fr = (p["fridge.range_celsius"] as { min: number; max: number }) ?? { min: 0, max: 5 };
  const [fMin, setFMin] = useState(str(fr.min));
  const [fMax, setFMax] = useState(str(fr.max));
  const dl = (p["maintenance.default_deadline_hours"] as { urgent: number; normal: number; low: number }) ?? { urgent: 24, normal: 168, low: 720 };
  const [dUrgent, setDUrgent] = useState(str(dl.urgent));
  const [dNormal, setDNormal] = useState(str(dl.normal));
  const [dLow, setDLow] = useState(str(dl.low));
  const [reminder, setReminder] = useState(str(p["maintenance.reminder_hours"]));
  const [correction, setCorrection] = useState(str(p["records.correction_window_hours"]));
  const [noShow, setNoShow] = useState(str(p["presence.no_show_monthly_alert"]));
  const [idle, setIdle] = useState(str(p["security.session_idle_minutes"]));
  const after = (fn: () => Promise<void>) => async () => { await fn(); await onSaved(); };

  return (
    <div className="settings-grid">
      <p className="hint settings-wide">{t("settings.systemHint")}</p>

      <Section id="s-checks" title="settings.sRoomCheck" hint="settings.sRoomCheckHint" onSave={after(() => setParam("presence.check_times", checks))}>
        <TimeList times={checks} onChange={setChecks} inputLabel="settings.newCheckTime" addLabel="settings.addCheckTime" />
      </Section>

      <Section id="s-rounds" title="settings.sRounds" hint="settings.sRoundsHint" onSave={after(() => setParam("rounds.hours", rounds))}>
        <TimeList times={rounds} onChange={setRounds} inputLabel="settings.newRoundTime" addLabel="settings.addRoundTime" />
      </Section>

      <Section id="s-fridges" title="settings.sFridges" hint="settings.sFridgesHint" onSave={after(() => setParam("fridge.range_celsius", { min: num(fMin), max: num(fMax) }))}>
        <NumberField label="settings.fridgeMin" value={fMin} onChange={setFMin} step={0.5} />
        <NumberField label="settings.fridgeMax" value={fMax} onChange={setFMax} step={0.5} />
      </Section>

      <Section id="s-maint" title="settings.sMaintenance" hint="settings.sMaintenanceHint"
        onSave={after(async () => {
          await setParam("maintenance.default_deadline_hours", { urgent: num(dUrgent), normal: num(dNormal), low: num(dLow) });
          await setParam("maintenance.reminder_hours", num(reminder));
        })}>
        <NumberField label="settings.deadlineUrgent" value={dUrgent} onChange={setDUrgent} />
        <NumberField label="settings.deadlineNormal" value={dNormal} onChange={setDNormal} />
        <NumberField label="settings.deadlineLow" value={dLow} onChange={setDLow} />
        <NumberField label="settings.reminderHours" value={reminder} onChange={setReminder} />
      </Section>

      <Section id="s-records" title="settings.sRecords" hint="settings.sRecordsHint"
        onSave={after(async () => {
          await setParam("records.correction_window_hours", num(correction));
          await setParam("presence.no_show_monthly_alert", num(noShow));
        })}>
        <NumberField label="settings.correctionWindow" value={correction} onChange={setCorrection} />
        <NumberField label="settings.noShowAlert" value={noShow} onChange={setNoShow} />
      </Section>

      <Section id="s-security" title="settings.sSecurity" hint="settings.sSecurityHint" onSave={after(() => setParam("security.session_idle_minutes", num(idle)))}>
        <NumberField label="settings.idleMinutes" value={idle} onChange={setIdle} />
      </Section>
    </div>
  );
}
