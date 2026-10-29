import React from "react";
import { t, addTranslations } from "./i18n";
import { LineChart } from "./charts";
export function IntakeAnalytics({ data, student }) {
  const records = (data.consumptions || []).filter((c) => c.student === student.id),
    days = new Map();
  for (const c of records) {
    const day = days.get(c.date) || {
      date: c.date,
      kcal: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      plannedKcal: 0,
      meals: 0,
    };
    for (const n of ["kcal", "protein", "carbs", "fat"]) day[n] += c.totals[n];
    day.plannedKcal += c.planned.totals.kcal;
    day.meals++;
    days.set(c.date, day);
  }
  const rows = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
  const fmt = (n) =>
    new Intl.NumberFormat(document.documentElement.lang, { maximumFractionDigits: 1 }).format(n);
  return (
    <>
      <div className="section-heading source-card">
        <h3>{t("Evolução do consumo registrado")}</h3>
      </div>
      <p className="muted">
        {t(
          "Os gráficos usam as quantidades confirmadas pelo aluno. Ausência de registro não significa consumo zero.",
        )}
      </p>
      <div className="charts-grid">
        {[
          ["kcal", "Calorias consumidas", "kcal"],
          ["protein", "Proteína consumida", "g"],
          ["carbs", "Carboidratos consumidos", "g"],
          ["fat", "Gorduras consumidas", "g"],
        ].map(([field, label, unit]) => (
          <section className="card" key={field}>
            <LineChart rows={rows} field={field} label={label} unit={unit} />
          </section>
        ))}
      </div>
      <section className="card source-card">
        <h3>{t("Diário alimentar")}</h3>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{t("DATA")}</th>
                <th>{t("Refeição")}</th>
                <th>{t("Horário previsto")}</th>
                <th>{t("Registro")}</th>
                <th>{t("Previsto")}</th>
                <th>{t("Consumido")}</th>
                <th>Δ kcal</th>
              </tr>
            </thead>
            <tbody>
              {records.map((c) => (
                <tr key={c.id}>
                  <td>{c.date}</td>
                  <td>{c.mealName}</td>
                  <td>{c.scheduledTime}</td>
                  <td>
                    {new Date(c.executedAt).toLocaleTimeString(document.documentElement.lang, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td>{fmt(c.planned.totals.kcal)} kcal</td>
                  <td>{fmt(c.totals.kcal)} kcal</td>
                  <td>{fmt(c.totals.kcal - c.planned.totals.kcal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!records.length && <p className="muted">{t("Nenhum consumo registrado.")}</p>}
      </section>
      <section className="card source-card">
        <h3>{t("Histórico das sessões de treino")}</h3>
        {(data.workoutSessions || [])
          .filter((s) => s.student === student.id)
          .map((s) => (
            <div className="measurement-row" key={s.id}>
              <div>
                <strong>{s.workout.name}</strong>
                <p className="muted">
                  {new Date(s.started).toLocaleString(document.documentElement.lang)}
                </p>
              </div>
              <span>
                {s.sets.length} {t("séries registradas")} ·{" "}
                {t(s.finished ? "Finalizada" : "Em andamento")}
              </span>
            </div>
          ))}
      </section>
    </>
  );
}
addTranslations(`
Evolução do consumo registrado|Recorded consumption trends|Evolución del consumo registrado
Os gráficos usam as quantidades confirmadas pelo aluno. Ausência de registro não significa consumo zero.|Charts use student-confirmed quantities. Missing records do not mean zero consumption.|Los gráficos usan cantidades confirmadas por el alumno. La ausencia de registros no significa consumo cero.
Calorias consumidas|Consumed calories|Calorías consumidas
Proteína consumida|Consumed protein|Proteína consumida
Carboidratos consumidos|Consumed carbohydrates|Carbohidratos consumidos
Gorduras consumidas|Consumed fat|Grasas consumidas
Diário alimentar|Food diary|Diario alimentario
Horário previsto|Scheduled time|Horario previsto
Registro|Recorded at|Registro
Nenhum consumo registrado.|No consumption recorded.|Sin consumos registrados.
Histórico das sessões de treino|Workout session history|Historial de sesiones de entrenamiento
séries registradas|recorded sets|series registradas
Finalizada|Finished|Finalizada
Em andamento|In progress|En curso
`);
