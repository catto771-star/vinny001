import { Link } from "react-router-dom";
import { useI18n } from "@/i18n";
import type { BedOccupancy, Lodge } from "@/lib/types";
import { summarise } from "@/lib/useOccupancy";

/** Quadro de camas do Lodge: cada quarto com as suas camas, ocupadas, livres, com Out decidido ou fora de uso. */
export function BedBoard({ lodge, beds }: { lodge: Lodge; beds: BedOccupancy[] }) {
  const { t } = useI18n();
  const s = summarise(beds);
  const rooms: { id: string; code: string; kind: string; beds: BedOccupancy[] }[] = [];
  for (const b of beds) {
    let room = rooms.find((r) => r.id === b.room_id);
    if (!room) rooms.push((room = { id: b.room_id, code: b.room_code, kind: b.room_kind, beds: [] }));
    room.beds.push(b);
  }
  const state = (b: BedOccupancy) =>
    b.stay_id ? (b.stay_status === "out_pending" ? "out" : "occ") : b.bed_status === "out_of_service" ? "oos" : "free";

  return (
    <Link to="/beds" className="board-card" aria-label={`${lodge.name}: ${t("today.boardOpen")}`}>
      <header className="board-head">
        <div>
          <span className="eyebrow">{t("today.boardTitle")} · {lodge.name}</span>
          <div className="big-number">
            {s.occupied}<small>{t("today.beds", { total: s.total })}</small>
          </div>
        </div>
        <ul className="board-legend">
          <li><i className="bed-cell occ" />{s.occupied - s.outPending} {t("today.occupied")}</li>
          <li><i className="bed-cell free" />{s.free} {t("today.free")}</li>
          {s.outPending > 0 && <li><i className="bed-cell out" />{s.outPending} {t("today.boardOutPending")}</li>}
          {s.outOfService > 0 && <li><i className="bed-cell oos" />{s.outOfService} {t("today.boardOos")}</li>}
        </ul>
      </header>
      <div className="board-rooms">
        {rooms.map((r) => (
          <div key={r.id} className="board-room" title={r.code}>
            <span className="board-code">{r.kind === "apartment" ? `A${r.code}` : r.code}</span>
            <span className="board-beds">
              {r.beds.map((b) => <i key={b.bed_id} className={`bed-cell ${state(b)}${b.final_warning ? " fw" : ""}`} />)}
            </span>
          </div>
        ))}
      </div>
    </Link>
  );
}
