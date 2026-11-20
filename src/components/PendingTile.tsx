import { Link } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n, type MessageKey } from "@/i18n";
import { usePendingCounts, type PendingCounts } from "@/lib/pending";

const ROWS: Array<{ key: keyof PendingCounts; label: MessageKey; to: string }> = [
  { key: "checks", label: "pending.checks", to: "/sheet" },
  { key: "rounds", label: "pending.rounds", to: "/handover" },
  { key: "tasks", label: "pending.tasks", to: "/tasks" },
  { key: "no_shows", label: "pending.noShows", to: "/no-shows" },
  { key: "absences", label: "pending.absences", to: "/absences" },
  { key: "maintenance", label: "pending.maintenance", to: "/maintenance" },
];

/** Pendências na tela inicial (s.11): tudo o que está pendente, por seção. Não há tela de passagem de turno. */
export function PendingTile() {
  const { t } = useI18n();
  const { lodges, post, isManagement } = useAuth();
  const lodgeIds = post?.function === "office" && post.lodge_id && !isManagement ? [post.lodge_id] : lodges.map((l) => l.id);
  const counts = usePendingCounts(lodgeIds, null);
  const rows = ROWS.filter((r) => counts[r.key] > 0);

  return (
    <article className="bento-tile span-6 tile-pending">
      <span className="eyebrow">{t("pending.title")}</span>
      {rows.length === 0 ? (
        <p className="pending-empty">{t("pending.none")}</p>
      ) : (
        <ul className="pending-list">
          {rows.map((r) => (
            <li key={r.key}>
              <Link to={r.to}>
                <span className="pending-count">{counts[r.key]}</span>
                <span>{t(r.label, { n: counts[r.key] })}</span>
                <span aria-hidden="true" className="pending-arrow">→</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
