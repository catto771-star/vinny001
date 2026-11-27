import { useAuth } from "@/auth/AuthProvider";
import { useI18n } from "@/i18n";
import { formatCivilDate, formatDateTime } from "@/lib/time";
import { loadSnapshot, useContinuitySnapshot, type SnapBed, type Snapshot } from "@/lib/continuity";
import { useOnDuty } from "@/lib/useOnDuty";
import { Notice } from "@/components/Notice";
import { Printer, RefreshCw } from "lucide-react";

const NOTE_KEY: Record<Exclude<SnapBed["status"], "present">, "continuity.sAbsent" | "continuity.sCancelled" | "continuity.sFree" | "continuity.sOos"> = {
  absent: "continuity.sAbsent", cancelled: "continuity.sCancelled", free: "continuity.sFree", oos: "continuity.sOos",
};

/** Folha de continuidade: ocupação e chamada de incêndio, imprimível e disponível sem internet (cópia guardada no aparelho). */
export function ContinuitySheet({ snap, online, onRefresh, standalone = false }: { snap: Snapshot | null; online: boolean; onRefresh?: () => void; standalone?: boolean }) {
  const { t, locale } = useI18n();
  return (
    <section className={`page continuity${standalone ? " is-standalone" : ""}`}>
      <header className="page-header">
        <div>
          <span className="eyebrow">{t("continuity.eyebrow")}</span>
          <h1>{t("continuity.title")}</h1>
        </div>
        <div className="toolbar no-print">
          {onRefresh && <button type="button" onClick={onRefresh}><RefreshCw size={15} aria-hidden="true" /> {t("continuity.refresh")}</button>}
          <button type="button" className="primary" onClick={() => window.print()} disabled={!snap}><Printer size={15} aria-hidden="true" /> {t("continuity.print")}</button>
        </div>
      </header>
      {!online && <Notice kind="info">{t("continuity.offline")}</Notice>}
      {!snap ? (
        <div className="card empty-state"><p className="muted">{t("continuity.none")}</p></div>
      ) : (
        <>
          <p className="muted continuity-stamp">
            {online ? t("continuity.liveCopy", { time: formatDateTime(snap.at, locale) }) : t("continuity.savedCopy", { time: formatDateTime(snap.at, locale) })}
            {snap.float ? ` · ${t("continuity.float", { name: snap.float })}` : ""}
          </p>
          <p className="hint no-print">{t("continuity.hint")}</p>
          {snap.houses.map((h) => {
            const present = h.rooms.flatMap((r) => r.beds).filter((b) => b.status === "present" || b.status === "absent" || b.status === "cancelled").length;
            return (
              <article key={h.id} className="card continuity-house">
                <header className="continuity-head">
                  <h2>{h.name}</h2>
                  <span className="muted">{t("continuity.count", { n: present })}{h.onDuty ? ` · ${t("continuity.office", { name: h.onDuty })}` : ""}</span>
                </header>
                <table className="table continuity-table">
                  <thead>
                    <tr><th>{t("continuity.room")}</th><th>{t("continuity.bed")}</th><th>{t("continuity.resident")}</th><th>{t("continuity.dob")}</th><th>PASS ID</th><th>{t("continuity.note")}</th><th className="roll">{t("continuity.outside")}</th></tr>
                  </thead>
                  <tbody>
                    {h.rooms.flatMap((r) => r.beds.map((b, i) => (
                      <tr key={`${r.code}-${b.n}`} className={`st-${b.status}`}>
                        <td>{i === 0 ? r.code : ""}</td>
                        <td>{b.n}</td>
                        <td className="cell-main">{b.name ?? "—"}{b.fw && <span className="tag tag-danger fw-tag" title={t("warnings.t_final_warning")}>FW</span>}</td>
                        <td>{b.dob ? formatCivilDate(b.dob, locale) : "—"}</td>
                        <td>{b.passId ?? "—"}</td>
                        <td>{b.status === "present" ? "" : t(NOTE_KEY[b.status])}</td>
                        <td className="roll">{b.name && b.status !== "cancelled" ? <span className="rollbox" aria-hidden="true" /> : ""}</td>
                      </tr>
                    )))}
                  </tbody>
                </table>
              </article>
            );
          })}
        </>
      )}
    </section>
  );
}

export function Continuity() {
  const { lodges, staff } = useAuth();
  const { posts } = useOnDuty();
  const { snap, online, refresh } = useContinuitySnapshot(staff?.id ?? null, !!staff, lodges, posts);
  return <ContinuitySheet snap={snap} online={online} onRefresh={() => void refresh()} />;
}

/** Aberta sem internet e sem sessão válida: mostra só a cópia guardada no aparelho. */
export function ContinuityOffline() {
  return (
    <div className="center-top">
      <ContinuitySheet snap={loadSnapshot()} online={false} standalone />
    </div>
  );
}
