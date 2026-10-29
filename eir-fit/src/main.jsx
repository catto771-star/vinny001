import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Bell,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock3,
  Dumbbell,
  Flame,
  LayoutDashboard,
  Leaf,
  Menu,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  Target,
  TrendingUp,
  Users,
  Utensils,
  X,
  Zap,
} from "lucide-react";
import "./style.css";
import { api, persist } from "./api";
import { Auth } from "./auth";
import {
  NutritionBoard,
  WorkoutSession,
  DayPicker,
  ScheduleEditor,
  applies,
  isActive,
  todayWeekday,
  weekdays,
  dayName,
} from "./planning";
import { Modules } from "./modules";
import { t, useLocale, setLocale, supported } from "./i18n";
const day = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
const empty = {
  students: [],
  workouts: [],
  meals: [],
  logs: [],
  water: {},
  measurements: [],
  messages: [],
};
const initials = (n) =>
  n
    .split(" ")
    .slice(0, 2)
    .map((s) => s[0])
    .join(t(""));
function Dashboard({ user, onLogout }) {
  const [data, setData] = useState(empty),
    [page, setPage] = useState("overview"),
    [studentId, setStudentId] = useState(t("")),
    [query, setQuery] = useState(t("")),
    [modal, setModal] = useState(null),
    [toast, setToast] = useState(t("")),
    [mobile, setMobile] = useState(false),
    [activeWorkout, setActiveWorkout] = useState(null),
    [workoutDay, setWorkoutDay] = useState(todayWeekday);
  const [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState(t(""));
  const role = user.role === "student" ? "student" : "professional",
    canTrain = ["trainer", "both", "coach"].includes(user.role),
    canDiet = ["nutritionist", "both", "coach"].includes(user.role);
  const dataRef = useRef(empty),
    queue = useRef(Promise.resolve()),
    version = useRef(0);
  const notify = (s) => {
    setToast(t(s));
    setTimeout(() => setToast(t("")), 5000);
  };
  const commit = (d) => {
    dataRef.current = d;
    setData(d);
  };
  const refresh = async () => {
    const v = version.current;
    try {
      const fresh = await api("/state");
      if (v === version.current) commit(fresh);
      setLoadError(t(""));
    } catch (e) {
      setLoadError(e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 20000);
    return () => clearInterval(timer);
  }, []);
  const update = (fn) => {
    const action = queue.current.then(async () => {
      const current = dataRef.current;
      const next = fn(current);
      const saved = await persist(current, next);
      version.current++;
      commit(saved);
      return saved;
    });
    queue.current = action.catch((e) => {
      notify(e.message);
    });
    return action;
  };
  const student = data.students.find((s) => s.id === studentId) ||
      data.students[0] || {
        id: t(""),
        name: t("Aluno"),
        weight: 0,
        height: 0,
        initial: 0,
        goal: t("A definir"),
      },
    mineW = data.workouts.filter((w) => w.student === student.id),
    mineM = data.meals.filter(
      (m) =>
        m.student === student.id &&
        (data.protocols || []).some((p) => p.id === m.protocolId && applies(p, todayWeekday())),
    ),
    today = day();
  const nav = [
    ["overview", LayoutDashboard, t("Visão geral")],
    ...(role === "professional" ? [["students", Users, t("Meus alunos")]] : []),
    ["workouts", Dumbbell, t("Treinos")],
    ["nutrition", Utensils, t("Nutrição")],
    ["progress", TrendingUp, t("Evolução")],
    ["messages", MessageCircle, t("Mensagens")],
    ...(role === "professional"
      ? [
          ["exerciseLibrary", BookOpen, t("Biblioteca de exercícios")],
          ["foodLibrary", Leaf, t("Alimentos")],
          ...(canDiet ? [["dietBuilder", Utensils, t("Construtor de dieta")]] : []),
        ]
      : []),
    ["analytics", TrendingUp, t("Análises")],
    ["assessments", Activity, t("Avaliação física")],
    ["prescriptions", BookOpen, t("Prescrições")],
  ];
  const go = (p) => {
    setPage(p);
    setMobile(false);
    setQuery(t(""));
  };
  const completed = (type, id) =>
    data.logs.some(
      (l) => l.date === today && l.student === student.id && l.type === type && l.item === id,
    );
  const open = (type, extra = {}) => {
    if (type === "meal") {
      go("dietBuilder");
      return;
    }
    if (["meal", "workout", "measurement"].includes(type) && !student.id)
      return notify(t("Cadastre um aluno primeiro."));
    setModal({
      type,
      ...extra,
    });
  };
  async function submit(e) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target)),
      id = crypto.randomUUID();
    try {
      if (modal.type === "student") {
        await update((d) => ({
          ...d,
          students: [
            ...d.students,
            {
              id,
              name: f.name,
              email: f.email,
              goal: f.goal,
              initial: +f.weight,
              weight: +f.weight,
              height: +f.height,
              status: "Em dia",
              color: "#d5e1cd",
            },
          ],
        }));
        notify(t("Aluno cadastrado. Selecione-o para criar os planos."));
      }
      if (modal.type === "workout") {
        const exercises = f.exercises
          .split("\n")
          .filter((s) => s.trim())
          .map((s) => {
            const [name, sets = "3", reps = "12", load = t("A definir")] = s
              .split(";")
              .map((x) => x.trim());
            return {
              name,
              sets,
              reps,
              load,
            };
          });
        await update((d) => ({
          ...d,
          workouts: [
            ...d.workouts,
            {
              id,
              student: f.student,
              name: f.name,
              focus: f.focus,
              duration: +f.duration,
              exercises,
              weekdays: new FormData(e.target).getAll("weekdays").map(Number),
              active: e.target.elements.active.checked,
            },
          ],
        }));
        notify(t("Treino publicado para o aluno"));
      }
      if (modal.type === "measurement") {
        await update((d) => ({
          ...d,
          students: d.students.map((s) =>
            s.id === student.id
              ? {
                  ...s,
                  weight: +f.weight,
                }
              : s,
          ),
          measurements: [
            ...d.measurements,
            {
              id,
              student: student.id,
              date: today,
              weight: +f.weight,
              note: f.note,
            },
          ],
        }));
        notify(t("Evolução registrada"));
      }
      setModal(null);
    } catch (e) {
      notify(e.message);
    }
  }
  const studentPicker = (
    <select
      aria-label={t("Selecionar aluno")}
      value={student.id}
      onChange={(e) => setStudentId(e.target.value)}
    >
      {data.students.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
          {role === "student" ? " · " + s.professionalName : t("")}
        </option>
      ))}
    </select>
  );
  if (loading) return <div className="auth-loading"> {t("Carregando sua conta…")} </div>;
  if (loadError)
    return (
      <div className="auth-loading">
        <p>{loadError}</p>
        <button className="primary" onClick={refresh}>
          {" "}
          {t("Tentar novamente")}{" "}
        </button>
        <button className="secondary" onClick={onLogout}>
          {" "}
          {t("Sair")}{" "}
        </button>
      </div>
    );
  return (
    <div className="app">
      <aside className={mobile ? "sidebar open" : "sidebar"}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            go("overview");
          }}
        >
          <span className="brand-icon">
            <Activity size={26} />
          </span>
          eir fit<span className="brand-dot">.</span>
        </a>
        <div className="workspace">
          <div className="workspace-icon">{initials(user.name)}</div>
          <div>
            <strong>{user.name}</strong>
            <span>{role === "student" ? t("Área do aluno") : t("Área profissional")}</span>
          </div>
          <ChevronDown size={15} />
        </div>
        <div className="nav-label">
          {" "}
          {t("ESPAÇO DE")} {role === "professional" ? t("TRABALHO") : t("EVOLUÇÃO")}
        </div>
        <nav>
          {nav.map(([id, Icon, label]) => (
            <button
              className={page === id ? "nav-item active" : "nav-item"}
              key={id}
              onClick={() => go(id)}
            >
              <Icon size={19} />
              <span>{label}</span>
              {id === "messages" && data.messages.length > 0 && (
                <small>{data.messages.length}</small>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="support-card">
            <span className="spark">✧</span>
            <strong> {t("Mais perto do próximo nível.")} </strong>
            <p> {t("Pequenos passos. Grandes resultados.")} </p>
            <button onClick={() => go("progress")}>
              {" "}
              {t("Ver evolução")} <ArrowUpRight size={16} />
            </button>
          </div>
          <button className="nav-item" onClick={() => open("settings")}>
            <Settings size={19} /> {t("Preferências")}{" "}
          </button>
          <div className="profile">
            <div className="avatar coach">{initials(user.name)}</div>
            <div>
              <strong>{user.name}</strong>
              <span>
                {user.role === "trainer"
                  ? t("Personal trainer")
                  : user.role === "nutritionist"
                    ? t("Nutricionista")
                    : ["both", "coach"].includes(user.role)
                      ? "Coach"
                      : t("Aluno")}
              </span>
            </div>
            <span className="online" />
          </div>
        </div>
      </aside>
      {mobile && <div className="shade" onClick={() => setMobile(false)} />}
      <div className="main">
        <header>
          <div className="breadcrumb">
            <button
              className="mobile-menu icon-btn"
              onClick={() => setMobile(!mobile)}
              aria-label={t("Abrir menu")}
            >
              <Menu />
            </button>
            <span> {t("Workspace")} </span>
            <ChevronRight size={14} />
            <strong>{nav.find((n) => n[0] === page)?.[2]}</strong>
          </div>
          <div className="header-actions">
            <LanguagePicker />
            <button className="secondary" onClick={onLogout}>
              {" "}
              {t("Sair")}{" "}
            </button>
            <button
              className="icon-btn notification"
              aria-label={t("Notificações")}
              onClick={() => open("notifications")}
            >
              <Bell size={20} />
              <i />
            </button>
            <div className="avatar small">{initials(user.name)}</div>
          </div>
        </header>
        <main>
          {!data.students.length && (
            <div className="invite-panel">
              <p>
                {role === "student"
                  ? t(
                      "Sua conta está pronta. Peça ao profissional o link de convite para receber seus treinos e sua dieta.",
                    )
                  : t(
                      "Comece cadastrando um aluno. Depois abra a evolução dele para gerar um convite de acesso.",
                    )}
              </p>
            </div>
          )}
          <div className="page-title">
            <div className="eyebrow">
              <span /> {t("SEU PRÓXIMO NÍVEL COMEÇA AQUI")}{" "}
            </div>
            <div className="title-line">
              <div>
                <h1>
                  {page === "overview"
                    ? role === "professional"
                      ? t("Tudo pronto para evoluir.")
                      : t("Vamos nessa, {name}?").replace("{name}", student.name.split(" ")[0])
                    : nav.find((n) => n[0] === page)?.[2]}
                  <span className="title-dot">.</span>
                </h1>
                <p>
                  {page === "overview"
                    ? role === "professional"
                      ? t("Um olhar sobre seus alunos. E sobre tudo o que vem pela frente.")
                      : t("Seu treino, sua alimentação e cada conquista em um só lugar.")
                    : t("Cada detalhe conta na construção de um resultado duradouro.")}
                </p>
              </div>
              <div className="title-actions">
                {role === "student" ? (
                  studentPicker
                ) : page === "overview" ? (
                  <button className="primary" onClick={() => open("student")}>
                    <Plus size={17} /> {t("Novo aluno")}{" "}
                  </button>
                ) : [
                    "workouts",
                    "nutrition",
                    "progress",
                    "exerciseLibrary",
                    "dietBuilder",
                    "analytics",
                    "assessments",
                    "prescriptions",
                  ].includes(page) ? (
                  studentPicker
                ) : null}
              </div>
            </div>
          </div>
          {page === "overview" && (
            <>
              <div className="stats-grid">
                {(role === "professional"
                  ? [
                      [
                        Users,
                        t("Alunos ativos"),
                        data.students.length,
                        t("Todos os alunos cadastrados"),
                        "lime",
                      ],
                      [
                        Dumbbell,
                        t("Treinos prescritos"),
                        data.workouts.length,
                        t("Planos de treino disponíveis"),
                        "purple",
                      ],
                      [
                        Utensils,
                        t("Refeições planejadas"),
                        data.meals.length,
                        t("Nutrição com propósito"),
                        "peach",
                      ],
                      [
                        CheckCircle2,
                        t("Atividades hoje"),
                        data.logs.filter((l) => l.date === today).length,
                        t("Cada conquista importa"),
                        "blue",
                      ],
                    ]
                  : [
                      [
                        Flame,
                        t("Treinos concluídos"),
                        data.logs.filter((l) => l.student === student.id && l.type === "workout")
                          .length,
                        t("Uma sessão de cada vez"),
                        "lime",
                      ],
                      [Target, t("Objetivo"), student.goal, t("Seu plano, seu ritmo"), "purple"],
                      [
                        Utensils,
                        t("Refeições hoje"),
                        mineM.filter((m) => completed("meal", m.id)).length,
                        t("de {count} refeições previstas").replace("{count}", mineM.length),
                        "peach",
                      ],
                      [
                        TrendingUp,
                        t("Peso atual"),
                        `${student.weight} kg`,
                        t("Acompanhe além da balança"),
                        "blue",
                      ],
                    ]
                ).map(([Icon, label, value, desc, color]) => (
                  <div className="stat-card" key={label}>
                    <div className="stat-top">
                      <span>{label}</span>
                      <div className={"stat-icon " + color}>
                        <Icon size={19} />
                      </div>
                    </div>
                    <strong className="stat-value">{value}</strong>
                    <div className="stat-foot">
                      <span className="tiny-dot" />
                      {desc}
                    </div>
                  </div>
                ))}
              </div>
              <div className="overview-grid">
                <section className="hero">
                  <div className="hero-content">
                    <div className="pill">
                      <span /> {t("CONSISTÊNCIA TRANSFORMA")}{" "}
                    </div>
                    <h2>
                      {" "}
                      {t("O plano é seu.")} <br /> {t("A evolução é de")} <em> {t("todos.")} </em>
                    </h2>
                    <p>
                      {" "}
                      {t("Conecte treino e nutrição. Acompanhe cada passo.")} <br />{" "}
                      {t("Construa resultados que ficam.")}{" "}
                    </p>
                    <button onClick={() => go(role === "professional" ? "students" : "workouts")}>
                      {role === "professional"
                        ? t("Acompanhar meus alunos")
                        : t("Começar meu treino")}
                      <ArrowUpRight size={18} />
                    </button>
                    <div className="hero-bottom">
                      <div className="avatar-stack">
                        {data.students.slice(0, 3).map((s) => (
                          <span
                            key={s.id}
                            style={{
                              background: s.color,
                            }}
                          >
                            {initials(s.name)}
                          </span>
                        ))}
                      </div>
                      <span> {t("Juntos em cada conquista.")} </span>
                    </div>
                  </div>
                  <div className="hero-art" aria-hidden="true">
                    <div className="orbit one" />
                    <div className="orbit two" />
                    <div className="orbit three" />
                    <div className="art-core">
                      <Activity size={82} strokeWidth={1.2} />
                    </div>
                    <div className="art-tag">
                      <span className="tag-icon">
                        <TrendingUp size={20} />
                      </span>
                      <div>
                        <strong> {t("Evolução contínua")} </strong>
                        <span> {t("Um dia melhor que o outro")} </span>
                      </div>
                    </div>
                    <div className="art-spark">✳</div>
                  </div>
                </section>
                <section className="card weekly">
                  <div className="section-heading">
                    <div>
                      <h3> {t("Atividade da semana")} </h3>
                      <span> {t("Registros de treino e alimentação")} </span>
                    </div>
                    <span className="legend-dot" />
                  </div>
                  <div className="chart">
                    <div className="chart-labels">
                      <span>6</span>
                      <span>4</span>
                      <span>2</span>
                      <span>0</span>
                    </div>
                    {Array.from(
                      {
                        length: 7,
                      },
                      (_, i) => {
                        const date = new Date();
                        date.setDate(date.getDate() - (6 - i));
                        const key = new Intl.DateTimeFormat("en-CA", {
                          timeZone: "America/Sao_Paulo",
                        }).format(date);
                        const count = data.logs.filter(
                          (l) =>
                            l.date === key && (role === "professional" || l.student === student.id),
                        ).length;
                        return (
                          <div className="bar-column" key={i}>
                            <div className="bar-track">
                              <div
                                className={i === 6 ? "bar current" : "bar"}
                                style={{
                                  height: count ? `${Math.min((count / 6) * 100, 100)}%` : "3px",
                                }}
                                title={`${count} atividades`}
                              />
                            </div>
                            <span>
                              {new Intl.DateTimeFormat(document.documentElement.lang, {
                                weekday: "short",
                              })
                                .format(date)
                                .replace(".", t(""))}
                            </span>
                          </div>
                        );
                      },
                    )}
                  </div>
                  <div className="weekly-footer">
                    <span>
                      <i /> {t("Atividades registradas")}{" "}
                    </span>
                    <strong>
                      {data.logs.filter((l) => l.date === today).length} {t("hoje")}{" "}
                      <ArrowUpRight size={13} />
                    </strong>
                  </div>
                </section>
              </div>
              <div className="bottom-grid">
                {role === "professional" ? (
                  <section className="card student-panel">
                    <div className="section-heading">
                      <div>
                        <h3>
                          {" "}
                          {t("Seus alunos")} <span className="count">{data.students.length}</span>
                        </h3>
                        <span> {t("De perto, mesmo à distância.")} </span>
                      </div>
                      <button className="text-button" onClick={() => go("students")}>
                        {" "}
                        {t("Ver todos")} <ArrowRight size={15} />
                      </button>
                    </div>
                    <StudentTable
                      students={data.students.slice(0, 4)}
                      onSelect={(s) => {
                        setStudentId(s.id);
                        go("progress");
                      }}
                    />
                  </section>
                ) : (
                  <section className="card">
                    <div className="section-heading">
                      <h3> {t("Seu treino de hoje")} </h3>
                      <Dumbbell size={20} />
                    </div>
                    {mineW.filter((w) => applies(w, todayWeekday())).length ? (
                      <>
                        <h2>{mineW.filter((w) => applies(w, todayWeekday()))[0].name}</h2>
                        <p className="muted">
                          {mineW.filter((w) => applies(w, todayWeekday()))[0].focus} ·{" "}
                          {mineW.filter((w) => applies(w, todayWeekday()))[0].duration} min
                        </p>
                        <button
                          className="primary"
                          onClick={() => {
                            setActiveWorkout(mineW.filter((w) => applies(w, todayWeekday()))[0]);
                          }}
                        >
                          {" "}
                          {t("Iniciar treino")} <ArrowRight size={16} />
                        </button>
                      </>
                    ) : (
                      <Empty text="Seu profissional ainda não publicou um treino." />
                    )}
                  </section>
                )}
                <section className="card quick-panel">
                  <div className="section-heading">
                    <h3> {t("Seu próximo passo")} </h3>
                    <Zap size={18} className="muted" />
                  </div>
                  <button
                    className="quick-link"
                    onClick={() => (canTrain && student.id ? open("workout") : go("workouts"))}
                  >
                    <span className="quick-icon lime">
                      <Dumbbell size={21} />
                    </span>
                    <div>
                      <strong>
                        {role === "professional" ? t("Criar um treino") : t("Meu plano de treino")}
                      </strong>
                      <span> {t("Movimento com intenção")} </span>
                    </div>
                    <ArrowUpRight size={18} />
                  </button>
                  <button
                    className="quick-link"
                    onClick={() => (canDiet && student.id ? open("meal") : go("nutrition"))}
                  >
                    <span className="quick-icon peach">
                      <Leaf size={21} />
                    </span>
                    <div>
                      <strong>
                        {role === "professional"
                          ? t("Planejar alimentação")
                          : t("Meu plano alimentar")}
                      </strong>
                      <span> {t("Nutrir para ir mais longe")} </span>
                    </div>
                    <ArrowUpRight size={18} />
                  </button>
                  <div className="quote">
                    {" "}
                    {t(
                      "“O resultado é a soma de pequenos esforços, repetidos todos os dias.”",
                    )}{" "}
                    <span> {t("CONTINUE EM MOVIMENTO ↗")} </span>
                  </div>
                </section>
              </div>
            </>
          )}
          {page === "students" && (
            <section className="card">
              <div className="section-heading">
                <h3>
                  {" "}
                  {t("Todos os alunos")} <span className="count">{data.students.length}</span>
                </h3>
                <div className="search">
                  <Search size={17} />
                  <input
                    placeholder={t("Buscar aluno…")}
                    aria-label={t("Buscar aluno")}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
              </div>
              <StudentTable
                students={data.students.filter((s) =>
                  (s.name + " " + s.goal).toLowerCase().includes(query.toLowerCase()),
                )}
                onSelect={(s) => {
                  setStudentId(s.id);
                  go("progress");
                }}
              />
              {!data.students.some((s) =>
                (s.name + " " + s.goal).toLowerCase().includes(query.toLowerCase()),
              ) && <Empty text="Nenhum aluno encontrado." />}
            </section>
          )}
          {page === "workouts" && (
            <>
              <div className="section-heading">
                <div>
                  <h3>
                    {" "}
                    {t("Plano de")} {student.name.split(" ")[0]}
                  </h3>
                  <span>
                    {mineW.length} {t("treinos disponíveis ·")} {student.goal}
                  </span>
                </div>
                {canTrain && (
                  <button className="primary" onClick={() => open("workout")}>
                    <Plus size={17} /> {t("Criar treino")}{" "}
                  </button>
                )}
              </div>
              {role === "student" && <DayPicker value={workoutDay} onChange={setWorkoutDay} />}
              <div className="plan-grid">
                {(role === "professional"
                  ? mineW
                  : mineW.filter((w) => applies(w, workoutDay))
                ).map((w, i) => (
                  <section className="card workout-card" key={w.id}>
                    <div className="workout-banner">
                      <span>{String.fromCharCode(65 + i)}</span>
                      <Dumbbell size={46} strokeWidth={1} />
                      <small>{w.focus}</small>
                    </div>
                    <div className="section-heading">
                      <h3>{w.name}</h3>
                      <span className="goal-tag">{t(isActive(w) ? "Ativo" : "Inativo")}</span>
                      {completed("workout", w.id) && <CheckCircle2 size={20} color="#608a37" />}
                    </div>
                    <p className="muted">{(w.weekdays || weekdays).map(dayName).join(" · ")}</p>
                    {canTrain && (
                      <ScheduleEditor plan={w} type="workout" refresh={refresh} notify={notify} />
                    )}
                    <div className="workout-meta">
                      <span>
                        <Clock3 size={15} />
                        {w.duration} min
                      </span>
                      <span>
                        <Activity size={15} />
                        {w.exercises.length} {t("exercícios")}{" "}
                      </span>
                    </div>
                    <div className="exercise-list">
                      {w.exercises.map((ex, j) => (
                        <div key={j}>
                          <span>{String(j + 1).padStart(2, "0")}</span>
                          <div>
                            <strong>{ex.name}</strong>
                            <small>
                              {ex.sets} {t("séries ×")} {ex.reps} · {ex.load}
                            </small>
                            {ex.instructions && <p className="exercise-note">{ex.instructions}</p>}
                            {ex.videoUrl && (
                              <a
                                className="video-link"
                                href={ex.videoUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {t("Assistir no YouTube")} <ArrowUpRight size={14} />
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    <button
                      className="primary full"
                      disabled={role === "student" && !isActive(w)}
                      onClick={() => {
                        setActiveWorkout(w);
                      }}
                    >
                      {role === "professional" ? t("Visualizar sessão") : t("Iniciar treino")}
                      <ArrowRight size={16} />
                    </button>
                  </section>
                ))}
              </div>
              {!mineW.length && <Empty text="Nenhum treino publicado para este aluno." />}
            </>
          )}
          {page === "nutrition" && (
            <NutritionBoard
              data={data}
              student={student}
              user={user}
              refresh={refresh}
              notify={notify}
              canDiet={canDiet}
              onBuild={() => go("dietBuilder")}
            />
          )}
          {page === "progress" && (
            <>
              <div className="section-heading">
                <div>
                  <h3>
                    {" "}
                    {t("A jornada de")} {student.name}
                  </h3>
                  <span>
                    {student.goal} · {student.height} cm
                  </span>
                </div>
                <button className="primary" onClick={() => open("measurement")}>
                  <Plus size={17} /> {t("Registrar evolução")}{" "}
                </button>
              </div>
              {role === "professional" && student.id && (
                <div className="invite-panel">
                  <span>
                    {" "}
                    {t("Vincule esta ficha à conta do aluno por convite de uso único.")}{" "}
                  </span>
                  <button
                    className="secondary"
                    onClick={async () => {
                      try {
                        const r = await api("/invitations", {
                          student: student.id,
                        });
                        open("invite", {
                          url: r.url,
                          email: r.email,
                        });
                      } catch (e) {
                        notify(e.message);
                      }
                    }}
                  >
                    {" "}
                    {t("Gerar convite")}{" "}
                  </button>
                </div>
              )}
              <div className="stats-grid three">
                {[
                  [t("Peso inicial"), `${student.initial} kg`],
                  [t("Peso atual"), `${student.weight} kg`],
                  [t("Variação"), `${(student.weight - student.initial).toFixed(1)} kg`],
                ].map(([label, value]) => (
                  <div className="stat-card" key={label}>
                    <span className="muted">{label}</span>
                    <strong className="stat-value">{value}</strong>
                  </div>
                ))}
              </div>
              <section className="card">
                <div className="section-heading">
                  <h3> {t("Histórico de medidas")} </h3>
                  <TrendingUp size={20} />
                </div>
                <div className="measurement-row">
                  <span> {t("Referência inicial")} </span>
                  <strong>{student.initial} kg</strong>
                </div>
                {data.measurements
                  .filter((m) => m.student === student.id)
                  .map((m) => (
                    <div className="measurement-row" key={m.id}>
                      <div>
                        <strong>
                          {new Date(m.date + "T12:00:00").toLocaleDateString(
                            document.documentElement.lang,
                          )}
                        </strong>
                        <p className="muted">{m.note}</p>
                      </div>
                      <strong>{m.weight} kg</strong>
                    </div>
                  ))}
                {!data.measurements.some((m) => m.student === student.id) && (
                  <p className="muted">
                    {" "}
                    {t(
                      "Registre uma nova medida para acompanhar a evolução ao longo do tempo.",
                    )}{" "}
                  </p>
                )}
              </section>
              <section className="card progress-activities">
                <h3> {t("Atividades registradas")} </h3>
                <p className="muted">
                  {data.logs.filter((l) => l.student === student.id && l.type === "workout").length}{" "}
                  {t("treinos concluídos ·")}{" "}
                  {data.logs.filter((l) => l.student === student.id && l.type === "meal").length}{" "}
                  {t("refeições registradas")}{" "}
                </p>
              </section>
            </>
          )}
          {page === "messages" && (
            <section className="card messaging">
              <div className="section-heading">
                <div>
                  <h3>{role === "professional" ? student.name : t("Seu acompanhamento")}</h3>
                  <span> {t("Conversa de acompanhamento")} </span>
                </div>
                {role === "professional" && studentPicker}
              </div>
              <div className="message-thread">
                <div className="message-notice">
                  <MessageCircle size={26} />
                  <strong> {t("O acompanhamento começa na conversa.")} </strong>
                  <p> {t("Deixe uma dúvida, um feedback ou uma nova conquista.")} </p>
                </div>
                {data.messages
                  .filter((m) => m.student === student.id)
                  .map((m) => (
                    <div className={"message " + (m.role === role ? "own" : t(""))} key={m.id}>
                      <small>{m.sender || student.name}</small>
                      <p>{m.text}</p>
                      <time>
                        {new Date(m.at).toLocaleTimeString(document.documentElement.lang, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                    </div>
                  ))}
              </div>
              <form
                className="message-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.target;
                  const text = new FormData(e.target).get("message").trim();
                  if (!text) return;
                  try {
                    await update((d) => ({
                      ...d,
                      messages: [
                        ...d.messages,
                        {
                          id: crypto.randomUUID(),
                          student: student.id,
                          role,
                          text,
                          at: new Date().toISOString(),
                        },
                      ],
                    }));
                    form.reset();
                  } catch (e) {
                    notify(e.message);
                  }
                }}
              >
                <input
                  name="message"
                  aria-label={t("Mensagem")}
                  placeholder={t("Escreva uma mensagem…")}
                  maxLength={2000}
                  required
                />
                <button className="primary">
                  {" "}
                  {t("Enviar")} <ArrowUpRight size={17} />
                </button>
              </form>
            </section>
          )}
          {[
            "exerciseLibrary",
            "foodLibrary",
            "dietBuilder",
            "analytics",
            "assessments",
            "prescriptions",
          ].includes(page) && (
            <Modules
              key={page + student.id}
              page={page}
              data={data}
              student={student}
              user={user}
              refresh={refresh}
              notify={notify}
              canTrain={canTrain}
              canDiet={canDiet}
            />
          )}
          <footer>
            <span>
              eir fit. <span> {t("Feito para evoluir com você.")} </span>
            </span>
            <span className="demo-label">
              <span /> {t("Conta conectada · dados no servidor")}{" "}
            </span>
          </footer>
        </main>
      </div>
      {toast && (
        <div role="status" className="toast">
          <CheckCircle2 size={19} />
          {toast}
        </div>
      )}
      {modal && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={modal.type}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close icon-btn"
              aria-label={t("Fechar")}
              onClick={() => setModal(null)}
            >
              <X />
            </button>
            {["student", "workout", "measurement"].includes(modal.type) ? (
              <>
                <span className="eyebrow"> {t("CONSTRUA O PRÓXIMO PASSO")} </span>
                <h2>
                  {
                    {
                      student: t("Novo aluno"),
                      workout: t("Criar treino"),
                      meal: t("Nova refeição"),
                      measurement: t("Registrar evolução"),
                    }[modal.type]
                  }
                </h2>
                <form onSubmit={submit}>
                  {modal.type === "student" && (
                    <>
                      <Field label={t("Nome completo")} name="name" required />
                      <Field label={t("E-mail")} name="email" type="email" required />
                      <label>
                        {" "}
                        {t("Objetivo")}{" "}
                        <select name="goal">
                          <option> {t("Hipertrofia")} </option>
                          <option> {t("Emagrecimento")} </option>
                          <option> {t("Condicionamento")} </option>
                          <option> {t("Qualidade de vida")} </option>
                        </select>
                      </label>
                      <div className="form-grid">
                        <Field
                          label={t("Peso inicial (kg)")}
                          name="weight"
                          type="number"
                          min="20"
                          max="400"
                          step="0.1"
                          required
                        />
                        <Field
                          label={t("Altura (cm)")}
                          name="height"
                          type="number"
                          min="80"
                          max="250"
                          required
                        />
                      </div>
                    </>
                  )}
                  {["workout", "meal"].includes(modal.type) && (
                    <label>
                      {" "}
                      {t("Aluno")}{" "}
                      <select name="student" defaultValue={student.id}>
                        {data.students.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                            {role === "student" ? " · " + s.professionalName : t("")}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {modal.type === "workout" && (
                    <>
                      <fieldset className="new-plan-days">
                        <legend>{t("Dias da semana")}</legend>
                        {weekdays.map((day) => (
                          <label className="checkbox-line" key={day}>
                            <input type="checkbox" name="weekdays" value={day} defaultChecked />
                            {dayName(day)}
                          </label>
                        ))}
                        <label className="checkbox-line">
                          <input type="checkbox" name="active" defaultChecked />
                          {t("Plano ativo")}
                        </label>
                      </fieldset>
                      <Field
                        label={t("Nome do treino")}
                        name="name"
                        placeholder="Treino C · Corpo completo"
                        required
                      />
                      <Field
                        label={t("Foco")}
                        name="focus"
                        placeholder="Força e condicionamento"
                        required
                      />
                      <Field
                        label={t("Duração estimada (minutos)")}
                        name="duration"
                        type="number"
                        min="5"
                        max="240"
                        defaultValue="45"
                        required
                      />
                      <label>
                        {" "}
                        {t("Exercícios")}{" "}
                        <textarea
                          aria-label={t("Exercícios")}
                          name="exercises"
                          rows="5"
                          placeholder={"Agachamento; 3; 12; 20 kg\nRemada; 3; 10; 15 kg"}
                          required
                        />
                        <small>
                          {" "}
                          {t("Uma linha por exercício: nome; séries; repetições; carga.")}{" "}
                        </small>
                      </label>
                    </>
                  )}
                  {modal.type === "measurement" && (
                    <>
                      <p className="muted">{student.name}</p>
                      <Field
                        label={t("Peso atual (kg)")}
                        name="weight"
                        type="number"
                        step="0.1"
                        min="20"
                        max="400"
                        defaultValue={student.weight}
                        required
                      />
                      <label>
                        {" "}
                        {t("Observações")}{" "}
                        <textarea
                          name="note"
                          rows="3"
                          placeholder={t("Como você está se sentindo?")}
                        />
                      </label>
                    </>
                  )}
                  <button className="primary full" type="submit">
                    {" "}
                    {t("Salvar")} <Check size={17} />
                  </button>
                </form>
              </>
            ) : modal.type === "invite" ? (
              <>
                <h2> {t("Convite para o aluno")} </h2>
                <p>
                  {" "}
                  {t("Envie este link a")} {modal.email}{" "}
                  {t(
                    ". Válido por 72 horas e apenas para uma conta de aluno com esse e-mail.",
                  )}{" "}
                </p>
                <input
                  aria-label={t("Link de convite")}
                  readOnly
                  value={modal.url}
                  style={{
                    width: "100%",
                  }}
                />
                <p className="muted">
                  {" "}
                  {t("O envio não é automático. Copie e compartilhe com o aluno.")}{" "}
                </p>
              </>
            ) : modal.type === "settings" ? (
              <>
                <h2> {t("Sua conta")} </h2>
                <p>
                  {user.name} · {user.email}
                </p>
                <p>
                  {" "}
                  {t(
                    "Seus dados são armazenados no servidor. Somente profissionais vinculados e o próprio aluno acessam os planos.",
                  )}{" "}
                </p>
                <button className="secondary" onClick={onLogout}>
                  {" "}
                  {t("Sair da conta")}{" "}
                </button>
              </>
            ) : (
              <>
                <h2> {t("Você está em dia.")} </h2>
                <p className="muted">
                  {" "}
                  {t(
                    "Nenhuma nova notificação. As atividades registradas aparecem no painel.",
                  )}{" "}
                </p>
              </>
            )}
          </section>
        </div>
      )}
      {activeWorkout && (
        <WorkoutSession
          key={activeWorkout.id}
          workout={activeWorkout}
          student={student}
          user={user}
          onClose={() => setActiveWorkout(null)}
          onSaved={refresh}
          notify={notify}
        />
      )}
    </div>
  );
}
function Field({ label, ...props }) {
  return (
    <label>
      {label}
      <input {...props} />
    </label>
  );
}
function Empty({ text }) {
  return (
    <div className="empty">
      <BookOpen size={30} />
      <p>{text}</p>
    </div>
  );
}
function StudentTable({ students, onSelect }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th> {t("ALUNO")} </th>
            <th> {t("OBJETIVO")} </th>
            <th> {t("STATUS DO PLANO")} </th>
            <th />
          </tr>
        </thead>
        <tbody>
          {students.map((s) => (
            <tr key={s.id}>
              <td>
                <button className="student-cell" onClick={() => onSelect(s)}>
                  <span
                    className="avatar"
                    style={{
                      background: s.color,
                    }}
                  >
                    {initials(s.name)}
                  </span>
                  <span>
                    <strong>{s.name}</strong>
                    <small>{s.email}</small>
                  </span>
                </button>
              </td>
              <td>
                <span className="goal-tag">{s.goal}</span>
              </td>
              <td>
                <span className={"status " + (s.status === "Atenção" ? "attention" : t(""))}>
                  <i />
                  {s.status}
                </span>
              </td>
              <td>
                <button
                  className="icon-btn"
                  aria-label={`Ver ${s.name}`}
                  onClick={() => onSelect(s)}
                >
                  <ArrowUpRight size={18} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function App() {
  useLocale();
  const [user, setUser] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(t(""));
  async function loadUser() {
    try {
      const r = await api("/auth/me");
      await login(r.user);
    } catch {
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    loadUser();
  }, []);
  async function login(u) {
    setError(t(""));
    if (location.hash.startsWith("#invite=")) {
      try {
        await api("/invitations/accept", {
          token: location.hash.slice(8),
        });
        history.replaceState(null, t(""), location.pathname);
      } catch (e) {
        setError(e.message);
      }
    }
    setUser(u);
  }
  if (loading) return <div className="auth-loading"> {t("Carregando Eir Fit…")} </div>;
  return (
    <>
      {error && (
        <div role="alert" className="invite-error">
          {error}
          <button onClick={() => setError(t(""))}> {t("Fechar")} </button>
        </div>
      )}
      {user ? (
        <Dashboard
          key={user.id}
          user={user}
          onLogout={async () => {
            try {
              await api("/auth/logout", {});
              setUser(null);
            } catch (e) {
              setError(e.message);
            }
          }}
        />
      ) : (
        <Auth onLogin={login} languagePicker={<LanguagePicker />} />
      )}
    </>
  );
}
export function LanguagePicker() {
  return (
    <select
      className="language-picker"
      aria-label="Language"
      value={document.documentElement.lang}
      onChange={(e) => setLocale(e.target.value)}
    >
      {supported.map(([id, name]) => (
        <option key={id} value={id}>
          {name}
        </option>
      ))}
    </select>
  );
}
createRoot(document.getElementById("root")).render(<App />);
