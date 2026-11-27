import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { rulerPosition, rulerTicks, type RulerTick } from "@/lib/shiftRuler";
import { formatTime, operationalDay } from "@/lib/time";
import { useLatestRequest } from "@/lib/useLatestRequest";

const HOURS = ["07", "10", "13", "16", "19", "22", "01", "04", "07"];

type Row = { lodgeId: string; name: string; ticks: RulerTick[] };

/**
 * Assinatura visual do DS Lodge: a régua do dia operacional (07:00 → 07:00) com as rondas
 * e os checks de cada Lodge — feitos, atrasados, vencendo e por vir — e o "agora".
 */
export function ShiftRuler({ lodgeIds }: { lodgeIds: string[] }) {
  const { t, locale } = useI18n();
  const { lodges, serverOffsetMs } = useAuth();
  const latest = useLatestRequest();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [now, setNow] = useState(() => new Date(Date.now() + serverOffsetMs));
  const day = operationalDay(now);
  const key = lodgeIds.join(",");

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date(Date.now() + serverOffsetMs)), 60_000);
    return () => window.clearInterval(id);
  }, [serverOffsetMs]);

  useEffect(() => {
    const isLatest = latest();
    const ids = key ? key.split(",") : [];
    void Promise.all([
      supabase.rpc("round_slots"),
      ...ids.map((id) =>
        Promise.all([
          supabase.rpc("check_slots", { p_lodge: id, p_day: day }),
          supabase.from("room_check_runs").select("slot, status").eq("lodge_id", id).eq("operational_day", day),
          supabase.from("handover_entries").select("round_slot").eq("lodge_id", id).eq("operational_day", day).eq("kind", "round"),
        ]),
      ),
    ]).then(([rounds, ...perLodge]) => {
      if (!isLatest()) return;
      const roundSlots = ((rounds as { data: string[] | null }).data ?? []) as string[];
      setRows(
        ids.map((id, i) => {
          const [slots, runs, entries] = perLodge[i] as [{ data: unknown }, { data: unknown }, { data: unknown }];
          return {
            lodgeId: id,
            name: lodges.find((l) => l.id === id)?.short_name ?? "",
            ticks: rulerTicks({
              day,
              now: new Date(Date.now() + serverOffsetMs),
              checkSlots: (slots.data ?? []) as string[],
              launchedChecks: ((runs.data ?? []) as { slot: string; status: string }[]).filter((r) => r.status === "launched").map((r) => r.slot),
              roundSlots,
              recordedRounds: ((entries.data ?? []) as { round_slot: string }[]).map((e) => e.round_slot),
            }),
          };
        }),
      );
    });
  }, [key, day, lodges, serverOffsetMs, latest]);

  const nowPos = rulerPosition(day, now);
  const stateLabel = (s: RulerTick["state"]) =>
    s === "done" ? t("today.stateDone") : s === "late" ? t("today.stateLate") : s === "due" ? t("today.stateDue") : t("today.stateUpcoming");

  return (
    <section className="ruler-card" aria-label={t("today.rulerTitle")}>
      <header className="ruler-head">
        <h2>{t("today.rulerTitle")}</h2>
        <ul className="ruler-legend" aria-hidden="true">
          <li><i className="tick-dot is-done" />{t("today.stateDone")}</li>
          <li><i className="tick-dot is-late" />{t("today.stateLate")}</li>
          <li><i className="tick-dot is-upcoming" />{t("today.stateUpcoming")}</li>
        </ul>
      </header>
      <div className="ruler-rows">
        {(rows ?? lodgeIds.map((id) => ({ lodgeId: id, name: lodges.find((l) => l.id === id)?.short_name ?? "", ticks: [] }))).map((row) => {
          const rounds = row.ticks.filter((x) => x.kind === "round" || x.kind === "check");
          const past = rounds.filter((x) => x.state !== "upcoming");
          const checks = row.ticks.filter((x) => x.kind === "check");
          return (
            <div className="ruler-row" key={row.lodgeId}>
              <div className="ruler-label">
                <span className="ruler-lodge">{row.name}</span>
                <Link to="/handover" className="ruler-stat">
                  <span>{t("today.rulerRounds", { done: past.filter((x) => x.state === "done").length, total: past.length })}</span>
                  <span>{t("today.rulerChecks", { done: checks.filter((x) => x.state === "done").length, total: checks.length })}</span>
                </Link>
              </div>
              <div className="ruler-track">
                <div className="ruler-past" style={{ width: `${nowPos * 100}%` }} />
                <div className="ruler-night" style={{ left: "50%" }} />
                {row.ticks.map((x) => (
                  <span
                    key={`${x.kind}-${x.slot}`}
                    className={`ruler-tick kind-${x.kind} is-${x.state}`}
                    style={{ left: `${x.position * 100}%` }}
                    title={`${x.kind === "check" ? t("today.check") : t("today.round")} ${x.slot} · ${stateLabel(x.state)}`}
                  >
                    {x.kind === "check" && <em>{x.slot}</em>}
                  </span>
                ))}
                <span className="ruler-now" style={{ left: `${nowPos * 100}%` }}>
                  <em>{formatTime(now, locale)}</em>
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="ruler-hours" aria-hidden="true">
        {HOURS.map((h, i) => (
          <span key={i} style={{ left: `${(i / 8) * 100}%` }}>{h}</span>
        ))}
      </div>
    </section>
  );
}
