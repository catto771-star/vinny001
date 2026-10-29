import React, { useState, useEffect } from "react";
import { X, Check, Plus, ArrowUpRight } from "lucide-react";
import { api } from "./api";
import { t, addTranslations } from "./i18n";
export const weekdays = [1, 2, 3, 4, 5, 6, 7];
export const dayName = (d) =>
  t(["", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"][d]);
export const localDay = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
export const todayWeekday = () => {
  const d = new Date(localDay() + "T12:00:00Z").getUTCDay();
  return d || 7;
};
export const isActive = (p) => p.active !== false && !p.archived;
export const applies = (p, d) => isActive(p) && (p.weekdays || weekdays).includes(d);
const number = (n) =>
  new Intl.NumberFormat(document.documentElement.lang, { maximumFractionDigits: 1 }).format(n);
export function DayPicker({ value, onChange, multiple = false }) {
  return (
    <div className="day-picker" role="group" aria-label={t("Dias da semana")}>
      {weekdays.map((d) => (
        <button
          key={d}
          type="button"
          aria-pressed={multiple ? value.includes(d) : value === d}
          onClick={() =>
            onChange(
              multiple ? (value.includes(d) ? value.filter((x) => x !== d) : [...value, d]) : d,
            )
          }
        >
          {dayName(d)}
        </button>
      ))}
    </div>
  );
}
export function ScheduleEditor({ plan, type, refresh, notify }) {
  const [days, setDays] = useState(plan.weekdays || weekdays),
    [active, setActive] = useState(isActive(plan)),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    setDays(plan.weekdays || weekdays);
    setActive(isActive(plan));
  }, [plan.active, JSON.stringify(plan.weekdays)]);
  return (
    <details className="schedule-editor">
      <summary>
        {t("Agenda e estado")} · {t(isActive(plan) ? "Ativo" : "Inativo")}
      </summary>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await api("/plans/schedule", { type, id: plan.id, active, weekdays: days });
            await refresh();
            notify(t("Planejamento atualizado"));
          } catch (e) {
            notify(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="checkbox-line">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          {t("Plano ativo")}
        </label>
        <DayPicker value={days} onChange={setDays} multiple />
        <button className="secondary" disabled={busy || !days.length}>
          {t("Salvar agenda")}
        </button>
      </form>
    </details>
  );
}
export function WorkoutSession({ workout, student, user, onClose, onSaved, notify }) {
  const [session, setSession] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const learner = user.role === "student";
  useEffect(() => {
    if (!learner) return;
    let live = true;
    api("/workout-sessions/start", { student: student.id, workoutId: workout.id })
      .then((s) => {
        if (live) setSession(s);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [workout.id, student.id]);
  const snapshot = session?.workout || workout,
    ready =
      session &&
      snapshot.exercises.every((_, i) => session.sets.some((s) => s.exercise_index === i));
  return (
    <div className="modal-backdrop">
      <section
        className="modal workout-session"
        role="dialog"
        aria-modal="true"
        aria-label={t("Sessão de treino")}
      >
        <button className="modal-close icon-btn" aria-label={t("Fechar sessão")} onClick={onClose}>
          <X />
        </button>
        <span className="eyebrow">{t(learner ? "REGISTRE SUA EXECUÇÃO" : "TREINO PRESCRITO")}</span>
        <h2>{snapshot.name}</h2>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        {learner && !session && !error && <p>{t("Carregando sessão…")}</p>}
        {snapshot.exercises.map((ex, i) => (
          <section className="session-block" key={i}>
            <h3>{ex.name}</h3>
            <p className="muted">
              {ex.sets} × {ex.reps} · {t("Carga prescrita")}: {ex.load}
            </p>
            {ex.videoUrl && (
              <a
                className="video-link"
                href={ex.videoUrl}
                rel="noopener noreferrer"
                target="_blank"
              >
                {t("Assistir no YouTube")}
                <ArrowUpRight size={14} />
              </a>
            )}
            {learner && session && (
              <ExerciseSets
                key={session.id + ":" + i}
                session={session}
                index={i}
                exercise={ex}
                onSaved={(incoming) =>
                  setSession((old) => {
                    const sets = new Map((old?.sets || []).map((s) => [s.id, s]));
                    for (const set of incoming.sets) {
                      const previous = sets.get(set.id);
                      if (!previous || previous.recorded <= set.recorded) sets.set(set.id, set);
                    }
                    return { ...incoming, sets: [...sets.values()] };
                  })
                }
                notify={notify}
              />
            )}
          </section>
        ))}
        {learner && session && (
          <>
            <p className="muted">
              {t(
                "Salve as séries realizadas. Os registros permanecem ao fechar e retomar o treino.",
              )}
            </p>
            <button
              className="primary full"
              disabled={!ready || busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api("/workout-sessions/finish", { sessionId: session.id });
                  await onSaved();
                  notify(t("Treino finalizado com registros de execução"));
                  onClose();
                } catch (e) {
                  notify(e.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t("Concluir treino")}
              <Check size={16} />
            </button>
            <p className="muted">
              {t("Registre ao menos uma série de cada exercício para finalizar.")}
            </p>
          </>
        )}
      </section>
    </div>
  );
}
function ExerciseSets({ session, index, exercise, onSaved, notify }) {
  const existing = session.sets.filter((s) => s.exercise_index === index),
    [count, setCount] = useState(
      Math.min(50, Math.max(1, parseInt(exercise.sets) || 1, ...existing.map((s) => s.set_index))),
    );
  return (
    <>
      <div className="set-head">
        <span>{t("Série")}</span>
        <span>{t("Carga (kg)")}</span>
        <span>{t("Repetições")}</span>
        <span />
      </div>
      {Array.from({ length: count }, (_, i) => (
        <SetRow
          key={i}
          index={index}
          setIndex={i + 1}
          session={session}
          saved={session.sets.find((s) => s.exercise_index === index && s.set_index === i + 1)}
          onSaved={onSaved}
          notify={notify}
        />
      ))}
      <button
        className="text-button"
        disabled={count >= 100}
        onClick={() => setCount((c) => c + 1)}
      >
        <Plus size={14} />
        {t("Adicionar série")}
      </button>
    </>
  );
}
function SetRow({ index, setIndex, session, saved, onSaved, notify }) {
  const [load, setLoad] = useState(saved?.load ?? ""),
    [reps, setReps] = useState(saved?.reps ?? ""),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false);
  return (
    <form
      className="set-row"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const s = await api("/workout-sessions/set", {
            sessionId: session.id,
            exerciseIndex: index,
            setIndex,
            load: +load,
            reps: +reps,
          });
          onSaved(s);
          setDirty(false);
        } catch (e) {
          notify(e.message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <span>{setIndex}</span>
      <input
        aria-label={t("Carga da série") + " " + setIndex}
        type="number"
        min="0"
        max="1500"
        step="0.1"
        value={load}
        onChange={(e) => {
          setLoad(e.target.value);
          setDirty(true);
        }}
        required
      />
      <input
        aria-label={t("Repetições da série") + " " + setIndex}
        type="number"
        min="1"
        max="1000"
        value={reps}
        onChange={(e) => {
          setReps(e.target.value);
          setDirty(true);
        }}
        required
      />
      <button className={saved && !dirty ? "secondary" : "primary"} disabled={busy}>
        {t(saved && !dirty ? "Salva" : "Salvar série")}
      </button>
    </form>
  );
}
export function NutritionBoard({ data, student, user, refresh, notify, canDiet, onBuild }) {
  const [viewDay, setViewDay] = useState(todayWeekday),
    [meal, setMeal] = useState(null);
  const professional = user.role !== "student",
    diets = (data.protocols || []).filter((p) => p.student === student.id),
    matching = diets.filter((p) => applies(p, viewDay));
  const ids = matching.map((p) => p.id),
    meals = data.meals.filter((m) => m.student === student.id && ids.includes(m.protocolId));
  const totals = Object.fromEntries(
    ["kcal", "protein", "carbs", "fat"].map((n) => [n, meals.reduce((sum, m) => sum + m[n], 0)]),
  );
  return (
    <>
      <div className="section-heading">
        <h3>
          {t("Dieta e refeições")} · {student.name}
        </h3>
        {canDiet && (
          <button className="primary" onClick={onBuild}>
            <Plus size={16} />
            {t("Criar ou revisar dieta")}
          </button>
        )}
      </div>
      <DayPicker value={viewDay} onChange={setViewDay} />
      {professional && (
        <div className="diet-plans">
          {diets.map((p) => (
            <section className="card" key={p.id}>
              <div className="section-heading">
                <h3>{p.name}</h3>
                <span className="goal-tag">{t(isActive(p) ? "Ativa" : "Inativa")}</span>
              </div>
              <p className="muted">{(p.weekdays || weekdays).map(dayName).join(" · ")}</p>
              <details className="diet-preview">
                <summary>{t("Ver refeições prescritas")}</summary>
                <p className="muted">
                  {p.items?.length
                    ? p.items
                        .map((i) => `${i.time} · ${i.meal}: ${i.name} (${i.grams} g)`)
                        .join(" | ")
                    : t("Plano anterior sem alimentos estruturados")}
                </p>
              </details>
              {canDiet && <ScheduleEditor plan={p} type="diet" refresh={refresh} notify={notify} />}
            </section>
          ))}
        </div>
      )}
      {matching.length > 1 && (
        <p role="alert" className="form-error">
          {t("Há um conflito de dietas neste dia. O profissional precisa ajustar a agenda.")}
        </p>
      )}
      <section className="nutrition-summary">
        <div>
          <h2>{matching[0]?.name || t("Sem dieta ativa neste dia")}</h2>
          <p className="muted">
            {dayName(viewDay)} · {t("Valores prescritos")}
          </p>
        </div>
        <div className="macro-grid">
          {[
            ["Energia", "kcal"],
            ["Proteína", "protein"],
            ["Carboidratos", "carbs"],
            ["Gorduras", "fat"],
          ].map(([label, key]) => (
            <div key={key}>
              <strong>
                {number(totals[key])}
                <small>{key === "kcal" ? "kcal" : "g"}</small>
              </strong>
              <span>{t(label)}</span>
            </div>
          ))}
        </div>
      </section>
      <h3 className="section-heading">{t("Refeições do dia")}</h3>
      <div className="meal-list">
        {meals.map((m) => {
          const actual = (data.consumptions || []).find(
            (c) => c.mealId === m.id && c.date === localDay(),
          );
          return (
            <section className="card meal" key={m.id}>
              <div className="meal-description">
                <span className="eyebrow">{m.time}</span>
                <h3>{m.name}</h3>
                <p>{m.foods}</p>
                <span className="muted">
                  {t("Previsto")}: {number(m.kcal)} kcal · P {number(m.protein)} / C{" "}
                  {number(m.carbs)} / G {number(m.fat)} g
                </span>
                {actual && viewDay === todayWeekday() && (
                  <p className="actual-intake">
                    {t("Consumido")}: {number(actual.totals.kcal)} kcal · P{" "}
                    {number(actual.totals.protein)} / C {number(actual.totals.carbs)} / G{" "}
                    {number(actual.totals.fat)} g ·{" "}
                    {new Date(actual.executedAt).toLocaleTimeString(document.documentElement.lang, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                )}
              </div>
              {!professional && (
                <button
                  className={actual ? "secondary" : "primary"}
                  disabled={viewDay !== todayWeekday() || matching.length !== 1}
                  onClick={() => setMeal(m)}
                >
                  {t(actual ? "Registrada" : "Registrar")}
                </button>
              )}
            </section>
          );
        })}
      </div>
      {!professional && viewDay !== todayWeekday() && (
        <p className="muted">
          {t("Esta é uma visualização da semana. Registre apenas as refeições de hoje.")}
        </p>
      )}
      {!professional && (
        <section className="card water">
          <div>
            <h3>{t("Hidratação")} 💧</h3>
            <p className="muted">
              {data.water[student.id + localDay()] || 0} {t("de 8 copos · 250 ml por copo")}
            </p>
          </div>
          <div className="water-cups">
            {Array.from({ length: 8 }, (_, i) => (
              <button
                key={i}
                aria-label={`Registrar ${i + 1} copos de água`}
                className={(data.water[student.id + localDay()] || 0) > i ? "filled" : ""}
                onClick={async () => {
                  try {
                    await api("/commands", {
                      commands: [
                        {
                          action: "water",
                          student: student.id,
                          payload: {
                            cups: data.water[student.id + localDay()] === i + 1 ? i : i + 1,
                          },
                        },
                      ],
                    });
                    await refresh();
                  } catch (e) {
                    notify(e.message);
                  }
                }}
              >
                ▰
              </button>
            ))}
          </div>
        </section>
      )}
      {meal && (
        <MealConsumption
          meal={meal}
          student={student}
          current={(data.consumptions || []).find(
            (c) => c.mealId === meal.id && c.date === localDay(),
          )}
          onClose={() => setMeal(null)}
          onSaved={refresh}
          notify={notify}
        />
      )}
    </>
  );
}
function MealConsumption({ meal, student, current, onClose, onSaved, notify }) {
  const [quantities, setQuantities] = useState(
      (current?.items || meal.items || []).map((i) => i.grams),
    ),
    [busy, setBusy] = useState(false);
  const totals = Object.fromEntries(
    ["kcal", "protein", "carbs", "fat"].map((n) => [
      n,
      meal.items?.length
        ? meal.items.reduce(
            (sum, item, i) => sum + (item.per100g[n] * (+quantities[i] || 0)) / 100,
            0,
          )
        : meal[n],
    ]),
  );
  return (
    <div className="modal-backdrop">
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={t("Registrar consumo")}
      >
        <button className="modal-close icon-btn" onClick={onClose} aria-label={t("Fechar")}>
          <X />
        </button>
        <h2>{meal.name}</h2>
        <p className="muted">
          {t(
            "Ajuste somente as quantidades dos alimentos previstos. Use zero para um alimento não consumido.",
          )}
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await api("/meal-consumptions", {
                student: student.id,
                mealId: meal.id,
                quantities: quantities.map(Number),
              });
              await onSaved();
              notify(t("Consumo registrado"));
              onClose();
            } catch (e) {
              notify(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {meal.items?.map((item, i) => (
            <label className="consumption-item" key={i}>
              <span>
                {item.name}
                <small>
                  {t("Previsto")}: {item.grams} g
                </small>
              </span>
              <input
                type="number"
                min="0"
                max="10000"
                step="0.1"
                aria-label={item.name + " (g)"}
                value={quantities[i]}
                onChange={(e) =>
                  setQuantities((a) => a.map((v, j) => (j === i ? e.target.value : v)))
                }
                required
              />
              <span>g</span>
            </label>
          ))}
          {!meal.items?.length && (
            <p className="muted">
              {t(
                "Esta refeição anterior não tem alimentos estruturados. O registro confirma os valores prescritos; peça ao profissional uma revisão para ajustar quantidades.",
              )}
            </p>
          )}
          <p className="intake-totals">
            {number(totals.kcal)} kcal · P {number(totals.protein)} / C {number(totals.carbs)} / G{" "}
            {number(totals.fat)} g
          </p>
          <button className="primary full" disabled={busy}>
            {t("Salvar consumo")}
          </button>
        </form>
      </section>
    </div>
  );
}
addTranslations(`
Segunda|Monday|Lunes
Terça|Tuesday|Martes
Quarta|Wednesday|Miércoles
Quinta|Thursday|Jueves
Sexta|Friday|Viernes
Sábado|Saturday|Sábado
Domingo|Sunday|Domingo
Dias da semana|Weekdays|Días de la semana
Agenda e estado|Schedule and status|Agenda y estado
Ativo|Active|Activo
Inativo|Inactive|Inactivo
Inativa|Inactive|Inactiva
Plano ativo|Active plan|Plan activo
Salvar agenda|Save schedule|Guardar agenda
Planejamento atualizado|Schedule updated|Planificación actualizada
Sessão de treino|Workout session|Sesión de entrenamiento
REGISTRE SUA EXECUÇÃO|RECORD YOUR PERFORMANCE|REGISTRA TU EJECUCIÓN
TREINO PRESCRITO|PRESCRIBED WORKOUT|ENTRENAMIENTO PRESCRITO
Carregando sessão…|Loading session…|Cargando sesión…
Salve as séries realizadas. Os registros permanecem ao fechar e retomar o treino.|Save performed sets. Records remain when you close and resume the workout.|Guarda las series realizadas. Los registros se conservan al cerrar y retomar el entrenamiento.
Treino finalizado com registros de execução|Workout finished with performance records|Entrenamiento finalizado con registros de ejecución
Registre ao menos uma série de cada exercício para finalizar.|Record at least one set of each exercise to finish.|Registra al menos una serie de cada ejercicio para finalizar.
Série|Set|Serie
Carga (kg)|Load (kg)|Carga (kg)
Adicionar série|Add set|Añadir serie
Carga da série|Set load|Carga de la serie
Repetições da série|Set repetitions|Repeticiones de la serie
Salva|Saved|Guardada
Salvar série|Save set|Guardar serie
Dieta e refeições|Diet and meals|Dieta y comidas
Criar ou revisar dieta|Create or revise diet|Crear o revisar dieta
Há um conflito de dietas neste dia. O profissional precisa ajustar a agenda.|There is a diet conflict on this day. The professional must adjust the schedule.|Hay un conflicto de dietas en este día. El profesional debe ajustar la agenda.
Sem dieta ativa neste dia|No active diet for this day|Sin dieta activa para este día
Valores prescritos|Prescribed values|Valores prescritos
Previsto|Planned|Previsto
Consumido|Consumed|Consumido
Esta é uma visualização da semana. Registre apenas as refeições de hoje.|This is a weekly preview. Record only today's meals.|Esta es una vista semanal. Registra solo las comidas de hoy.
Registrar consumo|Record consumption|Registrar consumo
Ajuste somente as quantidades dos alimentos previstos. Use zero para um alimento não consumido.|Adjust only the quantities of planned foods. Use zero for an uneaten food.|Ajusta solo las cantidades de los alimentos previstos. Usa cero para un alimento no consumido.
Consumo registrado|Consumption recorded|Consumo registrado
Esta refeição anterior não tem alimentos estruturados. O registro confirma os valores prescritos; peça ao profissional uma revisão para ajustar quantidades.|This legacy meal has no structured foods. Recording confirms prescribed values; ask your professional to revise it to adjust quantities.|Esta comida anterior no tiene alimentos estructurados. El registro confirma los valores prescritos; pide al profesional una revisión para ajustar cantidades.
Salvar consumo|Save consumption|Guardar consumo
`);
addTranslations(`
Revisão da dieta selecionada. Somente a versão anterior desta dieta será inativada.|Revision of the selected diet. Only its previous version will be deactivated.|Revisión de la dieta seleccionada. Solo se desactivará su versión anterior.
Dietas ativas não podem compartilhar dias. Uma revisão substitui apenas a versão anterior da mesma dieta e preserva os registros.|Active diets cannot share weekdays. A revision replaces only the previous version of the same diet and preserves records.|Las dietas activas no pueden compartir días. Una revisión sustituye solo la versión anterior de la misma dieta y conserva los registros.
Revisar esta dieta|Revise this diet|Revisar esta dieta
Histórico das metas prescritas|Prescribed target history|Historial de metas prescritas
`);
addTranslations(`
Ver refeições prescritas|View prescribed meals|Ver comidas prescritas
Plano anterior sem alimentos estruturados|Legacy plan without structured foods|Plan anterior sin alimentos estructurados
`);
addTranslations(`
Histórico da dieta|Diet history|Historial de la dieta
`);
