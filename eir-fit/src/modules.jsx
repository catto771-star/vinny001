import { LineChart } from "./charts";
import React, { useState } from "react";
import { Plus, ArrowUpRight, BookOpen, Check, Activity, Trash2 } from "lucide-react";
import { DayPicker, ScheduleEditor, weekdays } from "./planning";
import { IntakeAnalytics } from "./intake-analytics";
import { api } from "./api";
import { t } from "./i18n";
const macros = ["kcal", "protein", "carbs", "fat"];
const fmt = (n, d = 1) =>
  n == null
    ? "—"
    : new Intl.NumberFormat(document.documentElement.lang || "pt-BR", {
        maximumFractionDigits: d,
      }).format(n);
const today = () => new Date().toLocaleDateString("en-CA");
function Field({ label, ...props }) {
  return (
    <label>
      {" "}
      {t(label)} <input {...props} />
    </label>
  );
}
function Form({ title, children, onSubmit, busy }) {
  return (
    <section className="card module-form">
      <h3> {t(title)} </h3>
      <form onSubmit={onSubmit}>
        {children}
        <button className="primary" disabled={busy}>
          <Plus size={16} /> {t("Salvar")}{" "}
        </button>
      </form>
    </section>
  );
}
export function Modules({ page, data, student, user, refresh, notify, canTrain, canDiet }) {
  const [busy, setBusy] = useState(false),
    [selected, setSelected] = useState([]),
    [rows, setRows] = useState([]),
    [dietDays, setDietDays] = useState(weekdays),
    [dietActive, setDietActive] = useState(true),
    [revision, setRevision] = useState(null),
    [workoutDays, setWorkoutDays] = useState(weekdays),
    [search, setSearch] = useState(t("")),
    [remote, setRemote] = useState([]),
    [exerciseFilter, setExerciseFilter] = useState(t("")),
    [field, setField] = useState("weight"),
    [dietFamily, setDietFamily] = useState(""),
    [foodQuery, setFoodQuery] = useState(t(""));
  const professional = user.role !== "student",
    foods = data.foods || [],
    exercises = data.exercises || [];
  const performances = (data.performances || []).filter((p) => p.student === student.id),
    protocols = (data.protocols || []).filter((p) => p.student === student.id),
    assessments = (data.assessments || []).filter((p) => p.student === student.id),
    prescriptions = (data.prescriptions || []).filter((p) => p.student === student.id);
  async function save(path, body, done) {
    setBusy(true);
    try {
      const result = await api(path, body);
      await refresh();
      notify(t("Salvo com sucesso"));
      done?.(result);
      return result;
    } catch (e) {
      notify(t(e.message));
    } finally {
      setBusy(false);
    }
  }
  const submit =
    (path, convert = (v) => v) =>
    async (e) => {
      e.preventDefault();
      const form = e.target;
      await save(path, convert(Object.fromEntries(new FormData(form))), () => form.reset());
    };
  const exerciseOptions = [
    ...new Map(performances.map((p) => [p.exerciseId, p.exercise])).entries(),
  ];
  if (page === "exerciseLibrary")
    return (
      <div className="module-grid">
        <div>
          <div className="section-heading">
            <h3> {t("Biblioteca de exercícios")} </h3>
            {canTrain && (
              <button
                className="secondary"
                disabled={busy}
                onClick={() => save("/library/exercises/starter", {})}
              >
                {" "}
                {t("Adicionar biblioteca inicial")}{" "}
              </button>
            )}
            <input
              aria-label={t("Buscar exercício")}
              placeholder={t("Buscar exercício")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {exercises
            .filter((e) =>
              (e.name + " " + e.muscleGroup).toLowerCase().includes(search.toLowerCase()),
            )
            .map((ex) => (
              <section className="card library-item" key={ex.id}>
                <div className="section-heading">
                  <label className="checkbox-line">
                    <input
                      type="checkbox"
                      checked={selected.includes(ex.id)}
                      onChange={() =>
                        setSelected((s) =>
                          s.includes(ex.id) ? s.filter((id) => id !== ex.id) : [...s, ex.id],
                        )
                      }
                    />
                    <strong>{ex.name}</strong>
                  </label>
                  <span className="goal-tag">{ex.muscleGroup}</span>
                </div>
                <p className="muted">{ex.instructions}</p>
                <small>{ex.equipment}</small>
                {ex.videoUrl && (
                  <a
                    className="video-link"
                    href={ex.videoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {" "}
                    {t("Assistir no YouTube")} <ArrowUpRight size={15} />
                  </a>
                )}
              </section>
            ))}
          {!exercises.length && (
            <div className="empty">
              <BookOpen />
              <p> {t("Cadastre seu primeiro exercício, com ou sem vídeo.")} </p>
            </div>
          )}
          {canTrain && (
            <Form
              title={t("Prescrever exercícios selecionados")}
              busy={busy}
              onSubmit={async (e) => {
                e.preventDefault();
                if (!student.id || !selected.length)
                  return notify(t("Selecione um aluno e ao menos um exercício"));
                const f = Object.fromEntries(new FormData(e.target));
                await save(
                  "/commands",
                  {
                    commands: [
                      {
                        kind: "workouts",
                        student: student.id,
                        payload: {
                          name: f.name,
                          focus: f.focus,
                          duration: +f.duration,
                          weekdays: workoutDays,
                          active: true,
                          exercises: selected.map((id) => {
                            const ex = exercises.find((x) => x.id === id);
                            return {
                              name: ex.name,
                              libraryId: id,
                              sets: f.sets,
                              reps: f.reps,
                              load: f.load,
                            };
                          }),
                        },
                      },
                    ],
                  },
                  () => setSelected([]),
                );
              }}
            >
              <p className="muted">
                {" "}
                {t("Aluno:")} {student.name} · {selected.length} {t("exercícios")}{" "}
              </p>
              <DayPicker multiple value={workoutDays} onChange={setWorkoutDays} />
              <Field label={t("Nome do treino")} name="name" required />
              <Field label={t("Foco")} name="focus" required />
              <div className="form-grid">
                <Field
                  label={t("Duração (min)")}
                  name="duration"
                  type="number"
                  min="5"
                  max="240"
                  defaultValue="45"
                  required
                />
                <Field
                  label={t("Séries")}
                  name="sets"
                  type="number"
                  min="1"
                  defaultValue="3"
                  required
                />
                <Field label={t("Repetições")} name="reps" defaultValue="12" required />
                <Field
                  label={t("Carga prescrita")}
                  name="load"
                  defaultValue={t("A definir")}
                  required
                />
              </div>
            </Form>
          )}
        </div>
        {canTrain && (
          <Form title={t("Novo exercício")} busy={busy} onSubmit={submit("/library/exercises")}>
            <Field label={t("Nome do exercício")} name="name" required />
            <Field
              label={t("Grupo muscular")}
              name="muscleGroup"
              placeholder={t("Quadríceps")}
              required
            />
            <Field label={t("Equipamento")} name="equipment" required />
            <Field
              label={t("Link do YouTube (opcional)")}
              name="videoUrl"
              type="url"
              placeholder="https://www.youtube.com/watch?v=…"
            />
            <label>
              {" "}
              {t("Orientações")} <textarea name="instructions" rows="4" required />
            </label>
            <p className="muted">
              {" "}
              {t(
                "O vídeo permanece no YouTube. O link é validado e salvo com os dados do exercício.",
              )}{" "}
            </p>
          </Form>
        )}
      </div>
    );
  if (page === "foodLibrary")
    return (
      <>
        <div className="module-grid">
          <section>
            <div className="section-heading">
              <h3> {t("Banco de alimentos")} </h3>
              <input
                placeholder={t("Buscar alimento")}
                aria-label={t("Buscar alimento")}
                value={foodQuery}
                onChange={(e) => setFoodQuery(e.target.value)}
              />
            </div>
            <div className="table-scroll card">
              <table>
                <thead>
                  <tr>
                    <th> {t("ALIMENTO / 100 G")} </th>
                    <th>KCAL</th>
                    <th>P / C / G</th>
                    <th> {t("FONTE")} </th>
                  </tr>
                </thead>
                <tbody>
                  {foods
                    .filter((f) => f.name.toLowerCase().includes(foodQuery.toLowerCase()))
                    .map((f) => (
                      <tr key={f.id}>
                        <td>
                          <strong>{f.name}</strong>
                          <small className="block muted">
                            {f.sourceId} · {f.edition}
                          </small>
                        </td>
                        <td>{fmt(f.kcal)}</td>
                        <td>
                          {fmt(f.protein)} / {fmt(f.carbs)} / {fmt(f.fat)}
                        </td>
                        <td>
                          <span className="goal-tag">{f.source.toUpperCase()}</span>
                          <small className="block muted">
                            {" "}
                            {t(f.verified ? t("Verificado na API") : t("Origem declarada"))}{" "}
                          </small>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
              {!foods.length && (
                <p className="muted">
                  {" "}
                  {t("Nenhum alimento importado. Cadastre um alimento ou importe uma fonte.")}{" "}
                </p>
              )}
            </div>
            <section className="card source-card">
              <h3> {t("Consulta USDA FoodData Central")} </h3>
              <form
                className="message-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setBusy(true);
                  try {
                    const r = await api("/foods/usda?q=" + encodeURIComponent(search));
                    setRemote(r.foods);
                  } catch (e) {
                    notify(t(e.message));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <input
                  aria-label={t("Consulta USDA")}
                  placeholder="Search food in English"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  required
                />
                <button className="primary" disabled={busy}>
                  {" "}
                  {t("Buscar")}{" "}
                </button>
              </form>
              {remote.map((f) => (
                <div className="measurement-row" key={f.sourceId}>
                  <div>
                    {f.name}
                    <small className="block muted">
                      USDA #{f.sourceId} · {fmt(f.kcal)} kcal/100 g
                    </small>
                  </div>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      save("/foods/usda/import", {
                        fdcId: f.sourceId,
                      })
                    }
                  >
                    {" "}
                    {t("Importar")}{" "}
                  </button>
                </div>
              ))}
              <p className="muted">
                {" "}
                {t(
                  "A consulta oficial exige USDA_FDC_API_KEY no servidor. Alimentos sem macronutrientes completos não são importados.",
                )}{" "}
              </p>
            </section>
          </section>
          <Form
            title={t("Novo alimento")}
            busy={busy}
            onSubmit={submit("/library/foods", (f) => ({
              ...f,
              kcal: +f.kcal,
              protein: +f.protein,
              carbs: +f.carbs,
              fat: +f.fat,
            }))}
          >
            <p className="muted">
              {" "}
              {t(
                "Valores por 100 g de parte comestível. Cadastro próprio não é certificado por tabelas oficiais.",
              )}{" "}
            </p>
            <Field label={t("Nome do alimento")} name="name" required />
            <Field label={t("Referência / rótulo")} name="sourceId" required />
            <Field label={t("Edição / data da referência")} name="edition" required />
            <div className="form-grid">
              {[
                [t("Energia (kcal)"), "kcal"],
                [t("Proteína (g)"), "protein"],
                [t("Carboidratos (g)"), "carbs"],
                [t("Gorduras (g)"), "fat"],
              ].map(([label, name]) => (
                <Field
                  key={name}
                  label={label}
                  name={name}
                  type="number"
                  min="0"
                  max={name === "kcal" ? 1000 : 100}
                  step="0.01"
                  required
                />
              ))}
            </div>
          </Form>
        </div>
        <section className="card source-card">
          <h3> {t("Tabelas nutricionais e proveniência")} </h3>
          <p className="muted">
            {" "}
            {t(
              "O catálogo de fontes não significa que as bases completas foram carregadas. Cada arquivo importado mantém fonte, edição e código; a origem é declarada pelo importador.",
            )}{" "}
          </p>
          <div className="source-grid">
            {(data.sources || [])
              .filter((s) => s.id !== "custom")
              .map((s) => (
                <a key={s.id} href={s.url} target="_blank" rel="noopener noreferrer">
                  <strong>{s.name}</strong>
                  <span>
                    {s.country} ·{" "}
                    {t(
                      s.status === "requires_key"
                        ? t("Requer chave")
                        : s.method === "file"
                          ? t("Importação por arquivo")
                          : t("Conector configurado"),
                    )}{" "}
                  </span>
                </a>
              ))}
          </div>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.target);
              try {
                const file = f.get("file");
                if (file.size > 90000)
                  throw Error("Arquivo muito grande. Divida em lotes de até 100 alimentos.");
                const parsed = JSON.parse(await file.text());
                await save("/library/import", {
                  source: f.get("source"),
                  edition: f.get("edition"),
                  licenseAccepted: f.get("license") === "on",
                  foods: parsed,
                });
              } catch (e) {
                notify(t(e.message));
              }
            }}
          >
            <div className="form-grid">
              <label>
                {" "}
                {t("Fonte")}{" "}
                <select name="source">
                  {(data.sources || [])
                    .filter((s) => s.method === "file")
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </select>
              </label>
              <Field label={t("Edição do arquivo")} name="edition" required />
              <label>
                {" "}
                {t("Arquivo normalizado (JSON)")}{" "}
                <input type="file" name="file" accept=".json,application/json" required />
              </label>
              <label className="checkbox-line">
                <input type="checkbox" name="license" required />{" "}
                {t("Confirmo os direitos de uso e a procedência do arquivo.")}{" "}
              </label>
            </div>
            <p className="muted">
              {" "}
              {t(
                "Formato: lista de objetos com name, sourceId, kcal, protein, carbs e fat por 100 g. Até 100 alimentos por lote. Campos ausentes não são tratados como zero.",
              )}{" "}
            </p>
            <button className="primary" disabled={busy}>
              {" "}
              {t("Importar arquivo")}{" "}
            </button>
          </form>
        </section>
      </>
    );
  if (page === "dietBuilder") {
    const calculated = rows.map((row) => {
      const f = foods.find((x) => x.id === row.foodId);
      return {
        ...row,
        food: f,
        ...Object.fromEntries(macros.map((n) => [n, f ? (f[n] * (+row.grams || 0)) / 100 : 0])),
      };
    });
    const total = Object.fromEntries(
      macros.map((n) => [n, calculated.reduce((sum, r) => sum + r[n], 0)]),
    );
    return (
      <>
        <section className="nutrition-summary">
          <div>
            <h2> {t("Construtor de dieta")} </h2>
            <p className="muted">
              {student.name} {t("· quantidades em gramas")}{" "}
            </p>
          </div>
          <div className="macro-grid">
            {[
              [t("Energia"), "kcal"],
              [t("Proteína"), "protein"],
              [t("Carboidratos"), "carbs"],
              [t("Gorduras"), "fat"],
            ].map(([label, key]) => (
              <div key={key}>
                <strong>
                  {fmt(total[key])}
                  <small>{key === "kcal" ? "kcal" : "g"}</small>
                </strong>
                <span> {t(label)} </span>
              </div>
            ))}
          </div>
        </section>
        {canDiet ? (
          <section className="card">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!student.id) return notify(t("Selecione um aluno"));
                await save(
                  "/protocols",
                  {
                    student: student.id,
                    weekdays: dietDays,
                    active: dietActive,
                    revisionOf: revision,
                    name: new FormData(e.target).get("name"),
                    items: rows.map((r) => ({
                      ...r,
                      grams: +r.grams,
                    })),
                  },
                  () => {
                    setRows([]);
                    setRevision(null);
                  },
                );
              }}
            >
              <DayPicker multiple value={dietDays} onChange={setDietDays} />
              <label className="checkbox-line">
                <input
                  type="checkbox"
                  checked={dietActive}
                  onChange={(e) => setDietActive(e.target.checked)}
                />
                {t("Plano ativo")}
              </label>
              {revision && (
                <p className="muted">
                  {t(
                    "Revisão da dieta selecionada. Somente a versão anterior desta dieta será inativada.",
                  )}
                </p>
              )}
              <Field
                label={t("Nome do protocolo")}
                name="name"
                placeholder="Protocolo 1 · Manutenção"
                required
              />
              {calculated.map((r, i) => (
                <div className="food-row" key={i}>
                  <label>
                    {" "}
                    {t("Refeição")}{" "}
                    <input
                      value={r.meal}
                      onChange={(e) =>
                        setRows((a) =>
                          a.map((x, j) =>
                            j === i
                              ? {
                                  ...x,
                                  meal: e.target.value,
                                }
                              : x,
                          ),
                        )
                      }
                      required
                    />
                  </label>
                  <label>
                    {" "}
                    {t("Horário")}{" "}
                    <input
                      type="time"
                      value={r.time}
                      onChange={(e) =>
                        setRows((a) =>
                          a.map((x, j) =>
                            j === i
                              ? {
                                  ...x,
                                  time: e.target.value,
                                }
                              : x,
                          ),
                        )
                      }
                      required
                    />
                  </label>
                  <label>
                    {" "}
                    {t("Alimento")}{" "}
                    <select
                      aria-label={t("Alimento")}
                      value={r.foodId}
                      onChange={(e) =>
                        setRows((a) =>
                          a.map((x, j) =>
                            j === i
                              ? {
                                  ...x,
                                  foodId: e.target.value,
                                }
                              : x,
                          ),
                        )
                      }
                      required
                    >
                      <option value=""> {t("Selecione")} </option>
                      {foods.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name} · {f.source.toUpperCase()}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {" "}
                    {t("Quantidade (g)")}{" "}
                    <input
                      type="number"
                      value={r.grams}
                      min="0.1"
                      max="10000"
                      step="0.1"
                      onChange={(e) =>
                        setRows((a) =>
                          a.map((x, j) =>
                            j === i
                              ? {
                                  ...x,
                                  grams: e.target.value,
                                }
                              : x,
                          ),
                        )
                      }
                      required
                    />
                  </label>
                  <span className="muted">{fmt(r.kcal)} kcal</span>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={t("Remover alimento")}
                    onClick={() => setRows((a) => a.filter((_, j) => j !== i))}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              ))}
              <div className="builder-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() =>
                    setRows((r) => [
                      ...r,
                      {
                        foodId: t(""),
                        grams: 100,
                        meal: t("Almoço"),
                        time: "12:00",
                      },
                    ])
                  }
                >
                  <Plus size={16} /> {t("Adicionar alimento")}{" "}
                </button>
                <button className="primary" disabled={busy || !rows.length || !student.id}>
                  {" "}
                  {t("Publicar novo protocolo")}{" "}
                </button>
              </div>
              <p className="muted">
                {" "}
                {t(
                  "Dietas ativas não podem compartilhar dias. Uma revisão substitui apenas a versão anterior da mesma dieta e preserva os registros.",
                )}{" "}
              </p>
            </form>
          </section>
        ) : (
          <div className="empty"> {t("Seu perfil não permite prescrever dietas.")} </div>
        )}
        <section className="card source-card">
          <h3> {t("Histórico de protocolos")} </h3>
          {protocols.map((p) => (
            <div className="measurement-row" key={p.id}>
              <div>
                <strong>
                  v{p.version} · {p.name}
                </strong>
                {canDiet && (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                      setRows(
                        p.items.map((i) => ({
                          foodId: i.foodId,
                          grams: i.grams,
                          meal: i.meal,
                          time: i.time,
                        })),
                      );
                      setDietDays(p.weekdays || weekdays);
                      setDietActive(p.active !== false);
                      setRevision(p.id);
                    }}
                  >
                    {t("Revisar esta dieta")}
                  </button>
                )}
                <small className="block muted">
                  {p.date} · {p.items.length} {t("alimentos")}{" "}
                </small>
              </div>
              {canDiet && <ScheduleEditor plan={p} type="diet" refresh={refresh} notify={notify} />}
              <span>
                {fmt(p.totals.kcal)} kcal · P {fmt(p.totals.protein)} / C {fmt(p.totals.carbs)} / G{" "}
                {fmt(p.totals.fat)} g
              </span>
            </div>
          ))}
          {!protocols.length && <p className="muted"> {t("Sem protocolos publicados.")} </p>}
        </section>
      </>
    );
  }
  if (page === "analytics") {
    const families = [...new Map(protocols.map((p) => [p.dietId || p.id, p.name])).entries()];
    const selectedFamily = dietFamily || families[0]?.[0];
    const protocolHistory = protocols.filter((p) => (p.dietId || p.id) === selectedFamily);

    const selectedExercise = exerciseFilter || exerciseOptions[0]?.[0];
    const filtered = performances.filter((p) => p.exerciseId === selectedExercise);
    const groups = new Map();
    for (const p of performances) {
      const key = p.date + "|" + p.muscleGroup;
      const old = groups.get(key) || {
        date: p.date,
        muscleGroup: p.muscleGroup,
        volume: 0,
        load: 0,
      };
      old.volume += p.volume;
      old.load = Math.max(old.load, p.load);
      groups.set(key, old);
    }
    const groupNames = [...new Set(performances.map((p) => p.muscleGroup))];
    const groupRows = groupNames.map((name) => ({
      name,
      volume: performances.filter((p) => p.muscleGroup === name).reduce((s, p) => s + p.volume, 0),
    }));
    return (
      <>
        <div className="section-heading">
          <h3> {t("Progressão de treino")} </h3>
          <select
            aria-label={t("Filtrar exercício")}
            value={exerciseFilter || exerciseOptions[0]?.[0] || t("")}
            onChange={(e) => setExerciseFilter(e.target.value)}
          >
            {exerciseOptions.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <div className="module-grid">
          <section className="card">
            <LineChart rows={filtered} field="load" label={t("Carga executada")} unit="kg" />
            <p className="muted">
              {exerciseFilter
                ? t("")
                : t("Selecione um exercício para comparar sua própria progressão de carga.")}
            </p>
          </section>
          <section className="card">
            <h3> {t("Volume por grupo muscular")} </h3>
            <p className="muted">
              {" "}
              {t("Volume = carga × repetições × séries. Não é uma estimativa de força.")}{" "}
            </p>
            {groupRows.map((g) => (
              <div className="group-bar" key={g.name}>
                <span>{g.name}</span>
                <div>
                  <i
                    style={{
                      width: `${(g.volume / Math.max(...groupRows.map((g) => g.volume), 1)) * 100}%`,
                    }}
                  />
                </div>
                <strong>{fmt(g.volume)} kg·rep</strong>
              </div>
            ))}
            {!groupRows.length && <p className="muted"> {t("Sem execuções registradas.")} </p>}
          </section>
        </div>
        <section className="card source-card">
          <h3> {t("Evolução por grupo e data")} </h3>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th> {t("DATA")} </th>
                  <th> {t("GRUPO MUSCULAR")} </th>
                  <th> {t("MAIOR CARGA")} </th>
                  <th> {t("VOLUME")} </th>
                </tr>
              </thead>
              <tbody>
                {[...groups.values()]
                  .sort((a, b) => a.date.localeCompare(b.date))
                  .map((g, i) => (
                    <tr key={i}>
                      <td>{g.date}</td>
                      <td>{g.muscleGroup}</td>
                      <td>{fmt(g.load)} kg</td>
                      <td>{fmt(g.volume)} kg·rep</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
        <IntakeAnalytics data={data} student={student} />
        <div className="section-heading source-card">
          <h3> {t("Histórico das metas prescritas")} </h3>
          <select
            aria-label={t("Histórico da dieta")}
            value={selectedFamily || ""}
            onChange={(e) => setDietFamily(e.target.value)}
          >
            {families.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <div className="charts-grid">
          {[
            ["kcal", t("Calorias"), "kcal"],
            ["protein", t("Proteína"), "g"],
            ["carbs", t("Carboidratos"), "g"],
            ["fat", t("Gorduras"), "g"],
          ].map(([key, label, unit]) => (
            <section className="card" key={key}>
              <LineChart
                rows={protocolHistory.map((p) => ({
                  ...p,
                  ...p.totals,
                }))}
                field={key}
                label={label}
                unit={unit}
              />
              {protocolHistory.length > 1 && (
                <span className="delta">
                  Δ {fmt(protocolHistory.at(-1).totals[key] - protocolHistory.at(-2).totals[key])}{" "}
                  {unit} · {t("vs. protocolo anterior")}{" "}
                </span>
              )}
            </section>
          ))}
        </div>
      </>
    );
  }
  if (page === "assessments")
    return (
      <>
        <div className="section-heading">
          <h3>
            {" "}
            {t("Avaliação física ·")} {student.name}
          </h3>
          <select
            value={field}
            aria-label={t("Indicador físico")}
            onChange={(e) => setField(e.target.value)}
          >
            {[
              ["weight", t("Peso")],
              ["bodyFat", t("Gordura corporal")],
              ["waist", t("Cintura")],
              ["hip", t("Quadril")],
              ["chest", t("Tórax")],
              ["arm", t("Braço")],
              ["thigh", t("Coxa")],
              ["calf", t("Panturrilha")],
              ["bmi", t("IMC")],
            ].map(([key, name]) => (
              <option key={key} value={key}>
                {" "}
                {t(name)}{" "}
              </option>
            ))}
          </select>
        </div>
        <div className="module-grid">
          <div>
            <section className="card">
              <LineChart
                rows={assessments}
                field={field}
                label={t("Evolução física")}
                unit={
                  field === "weight"
                    ? "kg"
                    : field === "bodyFat"
                      ? "%"
                      : field === "bmi"
                        ? t("")
                        : "cm"
                }
              />
              <p className="muted">
                {" "}
                {t(
                  "Percentual de gordura informado pelo avaliador. Sem estimativa automática de composição corporal.",
                )}{" "}
              </p>
            </section>
            <section className="card source-card">
              <h3> {t("Histórico de avaliações")} </h3>
              {assessments.map((a) => (
                <div className="assessment-entry" key={a.id}>
                  <strong>
                    {a.date} · {a.authorName}
                  </strong>
                  <p>
                    {" "}
                    {t("Peso")} : {fmt(a.weight)} kg · {t("Gordura corporal")} : {fmt(a.bodyFat)}% ·{" "}
                    {t("Cintura")} : {fmt(a.waist)} cm · IMC {fmt(a.bmi)}
                  </p>
                  <p className="muted">{a.note}</p>
                </div>
              ))}
              {!assessments.length && (
                <p className="muted"> {t("Nenhuma avaliação registrada.")} </p>
              )}
            </section>
          </div>
          {professional && (
            <Form
              title={t("Nova avaliação física")}
              busy={busy}
              onSubmit={submit("/assessments", (f) =>
                Object.fromEntries([
                  ...Object.entries(f).map(([k, v]) => [
                    k,
                    k === "note" ? v : v === t("") ? null : +v,
                  ]),
                  ["student", student.id],
                ]),
              )}
            >
              <p className="muted">
                {" "}
                {t(
                  "Preencha apenas os indicadores medidos. Campos vazios permanecem sem informação.",
                )}{" "}
              </p>
              <div className="form-grid">
                {[
                  [t("Peso (kg)"), "weight", 20, 400],
                  [t("Gordura corporal (%)"), "bodyFat", 0, 75],
                  [t("Cintura (cm)"), "waist", 10, 250],
                  [t("Quadril (cm)"), "hip", 10, 250],
                  [t("Tórax (cm)"), "chest", 10, 250],
                  [t("Braço (cm)"), "arm", 5, 100],
                  [t("Coxa (cm)"), "thigh", 10, 150],
                  [t("Panturrilha (cm)"), "calf", 5, 100],
                ].map(([label, name, min, max]) => (
                  <Field
                    key={name}
                    label={label}
                    name={name}
                    type="number"
                    step="0.1"
                    min={min}
                    max={max}
                  />
                ))}
              </div>
              <label>
                {" "}
                {t("Observações")} <textarea name="note" rows="3" />
              </label>
            </Form>
          )}
        </div>
      </>
    );
  if (page === "prescriptions")
    return (
      <div className="module-grid">
        <section>
          <div className="section-heading">
            <h3>
              {" "}
              {t("Prescrições ·")} {student.name}
            </h3>
          </div>
          {prescriptions.map((p) => (
            <section className="card prescription" key={p.id}>
              <div className="section-heading">
                <h3>{p.name}</h3>
                <span className="goal-tag">
                  {" "}
                  {t(p.status === "active" ? t("Ativa") : t("Suspensa"))}{" "}
                </span>
              </div>
              <p>{p.instructions}</p>
              <p className="muted">
                {p.frequency} · {p.route} · {p.startDate} → {p.endDate}
              </p>
              <small>
                {p.prescriber} · {p.credential}
              </small>
              <p className="muted">{p.notes}</p>
              {p.stopReason && (
                <p className="muted">
                  {" "}
                  {t("Motivo da suspensão")} : {p.stopReason}
                </p>
              )}
              {professional && p.status === "active" && (
                <form
                  className="message-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    save("/prescriptions/stop", {
                      id: p.id,
                      reason: new FormData(e.target).get("reason"),
                    });
                  }}
                >
                  <input name="reason" placeholder={t("Motivo da suspensão")} required />
                  <button className="secondary" disabled={busy}>
                    {" "}
                    {t("Suspender")}{" "}
                  </button>
                </form>
              )}
            </section>
          ))}
          {!prescriptions.length && (
            <div className="empty"> {t("Nenhuma prescrição registrada.")} </div>
          )}
        </section>
        {professional && (
          <Form
            title={t("Registrar prescrição")}
            busy={busy}
            onSubmit={submit("/prescriptions", (f) => ({
              ...f,
              student: student.id,
            }))}
          >
            <p className="muted">
              {" "}
              {t(
                "Registro manual pelo profissional responsável, conforme sua habilitação. A plataforma não recomenda substâncias nem doses; não constitui assinatura digital de receita.",
              )}{" "}
            </p>
            <label>
              {" "}
              {t("Categoria")}{" "}
              <select name="type">
                <option value="supplement"> {t("Suplemento")} </option>
                <option value="substance"> {t("Substância")} </option>
              </select>
            </label>
            <Field label={t("Nome")} name="name" required />
            <label>
              {" "}
              {t("Orientação / dose prescrita")} <textarea name="instructions" required rows="3" />
            </label>
            <Field label={t("Frequência")} name="frequency" required />
            <Field label={t("Via de uso")} name="route" required />
            <div className="form-grid">
              <Field
                label={t("Início")}
                name="startDate"
                type="date"
                defaultValue={today()}
                required
              />
              <Field label={t("Fim")} name="endDate" type="date" required />
            </div>
            <Field label={t("Habilitação / registro do prescritor")} name="credential" required />
            <label>
              {" "}
              {t("Observações e cuidados")} <textarea name="notes" rows="3" />
            </label>
          </Form>
        )}
      </div>
    );
  return null;
}
