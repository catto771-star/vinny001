import React from "react";
import { Activity } from "lucide-react";
import { t } from "./i18n";
const fmt = (n, d = 1) =>
  n == null
    ? "—"
    : new Intl.NumberFormat(document.documentElement.lang, { maximumFractionDigits: d }).format(n);
export function LineChart({ rows, field, label, unit = t("") }) {
  const points = rows.filter((r) => Number.isFinite(r[field]));
  if (!points.length)
    return (
      <div className="empty">
        <Activity size={24} />
        <p> {t("Sem registros para este indicador.")} </p>
      </div>
    );
  const min = Math.min(...points.map((r) => r[field])),
    max = Math.max(...points.map((r) => r[field])),
    range = max - min || 1;
  return (
    <div className="line-chart">
      <div className="section-heading">
        <h3> {t(label)} </h3>
        <strong>
          {fmt(points.at(-1)[field])} {unit}
        </strong>
      </div>
      <svg role="img" aria-label={t(label)} viewBox="0 0 600 140">
        <path d="M15 120 H585 M15 70 H585 M15 20 H585" stroke="#edf0e9" fill="none" />
        <polyline
          points={points
            .map(
              (r, i) =>
                `${15 + (i / (points.length - 1 || 1)) * 570},${120 - ((r[field] - min) / range) * 100}`,
            )
            .join(" ")}
          fill="none"
          stroke="#82a95d"
          strokeWidth="3"
        />
        {points.map((r, i) => (
          <circle
            key={i}
            cx={15 + (i / (points.length - 1 || 1)) * 570}
            cy={120 - ((r[field] - min) / range) * 100}
            r="4"
            fill="#82a95d"
          >
            <title>
              {r.date || r.name}: {fmt(r[field])} {unit}
            </title>
          </circle>
        ))}
      </svg>
      <div className="chart-dates">
        <span>{points[0].date || points[0].name}</span>
        <span>{points.at(-1).date || points.at(-1).name}</span>
      </div>
    </div>
  );
}
