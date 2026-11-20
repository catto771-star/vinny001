import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { errorKey } from "@/lib/errors";
import { isOutOfRange, parseTemperature } from "@/lib/services";
import { formatDateTime } from "@/lib/time";
import { staffName } from "@/lib/types";
import { useLatestRequest } from "@/lib/useLatestRequest";
import { useStaffList } from "@/lib/useStaffList";
import { LodgeTabs, useDefaultLodge } from "@/components/LodgeTabs";
import { Notice } from "@/components/Notice";
import { Skeleton } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";

type Reading = { id: string; temperature: string; range_min: string; range_max: string; out_of_range: boolean; note: string | null; recorded_by: string; recorded_at: string };

/** Fridge / Temperatura (s.8): só a geladeira; fora de 0–5 °C alerta o Manager; salvar conclui a tarefa. */
export function Fridge() {
  const { t, locale } = useI18n();
  const { canWriteLodge } = useAuth();
  const toast = useToast();
  const staffList = useStaffList();
  const [lodgeId, setLodgeId] = useState(useDefaultLodge());
  const [readings, setReadings] = useState<Reading[] | null>(null);
  const [range, setRange] = useState({ min: 0, max: 5 });
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const begin = useLatestRequest();

  const load = useCallback(async () => {
    const isLatest = begin();
    setReadings(null);
    const [{ data }, { data: r }] = await Promise.all([
      supabase.from("fridge_readings").select("id, temperature, range_min, range_max, out_of_range, note, recorded_by, recorded_at").eq("lodge_id", lodgeId).order("recorded_at", { ascending: false }).limit(30),
      supabase.rpc("param_value", { p_key: "fridge.range_celsius", p_lodge: lodgeId }),
    ]);
    if (!isLatest()) return;
    setReadings((data ?? []) as Reading[]);
    const rr = r as { min?: number; max?: number } | null;
    if (rr) setRange({ min: Number(rr.min ?? 0), max: Number(rr.max ?? 5) });
  }, [lodgeId, begin]);

  useEffect(() => {
    void load();
  }, [load]);

  const parsed = parseTemperature(value);
  const last = readings?.[0];

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (parsed === null) return setError(t("fridge.blankHint"));
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.rpc("record_fridge_temperature", { p_lodge: lodgeId, p_temperature: parsed, p_note: note });
    setBusy(false);
    if (err) return setError(t(errorKey(err)));
    if (isOutOfRange(parsed, range.min, range.max)) toast.error(t("fridge.savedAlert"));
    else toast.success(t("fridge.saved"));
    setValue("");
    setNote("");
    await load();
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <span className="eyebrow">{t("fridge.eyebrow")}</span>
          <h1>{t("fridge.title")}</h1>
        </div>
        <LodgeTabs value={lodgeId} onChange={setLodgeId} />
      </header>

      <div className="bento">
        <article className={`bento-tile span-3 temp-tile${last?.out_of_range ? " is-out" : ""}`}>
          <span className="eyebrow">{t("fridge.last")}</span>
          {readings === null ? (
            <Skeleton rows={2} label={t("app.loading")} />
          ) : last ? (
            <>
              <div className="big-number">{Number(last.temperature).toFixed(1)}<small>°C</small></div>
              <p className={last.out_of_range ? "warn-text" : "ok-text"}>{last.out_of_range ? t("fridge.outOfRange") : t("fridge.inRange")}</p>
              <p className="muted small-text">{formatDateTime(last.recorded_at, locale)} · {staffName(staffList.find((s) => s.id === last.recorded_by))}</p>
            </>
          ) : (
            <p className="muted">{t("fridge.none")}</p>
          )}
          <p className="hint">{t("fridge.range", { min: range.min, max: range.max })}</p>
        </article>

        {canWriteLodge(lodgeId) && (
          <form className="bento-tile span-3 form" onSubmit={submit}>
            <label>
              {t("fridge.temperature")}
              <input
                className={`temp-input${parsed !== null && isOutOfRange(parsed, range.min, range.max) ? " is-out" : ""}`}
                inputMode="decimal"
                autoComplete="off"
                required
                placeholder="4,0"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                autoFocus
              />
            </label>
            {parsed !== null && isOutOfRange(parsed, range.min, range.max) && <p className="warn-text small-text">{t("fridge.outOfRange")}</p>}
            <label>
              {t("fridge.note")} <small>({t("app.optional")})</small>
              <input value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
            <p className="hint">{t("fridge.blankHint")}</p>
            <Notice kind="error">{error}</Notice>
            <button type="submit" className="primary" disabled={busy || parsed === null}>{t("fridge.save")}</button>
          </form>
        )}
      </div>

      <h2 className="section-title">{t("fridge.history")}</h2>
      {readings && readings.length > 0 && (
        <table className="table table-cards">
          <tbody>
            {readings.map((r) => (
              <tr key={r.id}>
                <td className="cell-main">
                  <span className={r.out_of_range ? "warn-text" : ""}>{Number(r.temperature).toFixed(1)} °C</span>
                  {r.out_of_range && <span className="tag tag-danger">{t("fridge.outOfRange")}</span>}
                </td>
                <td className="nowrap">{formatDateTime(r.recorded_at, locale)}</td>
                <td>{staffName(staffList.find((s) => s.id === r.recorded_by))}</td>
                <td>{r.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
