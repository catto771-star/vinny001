import { t } from "./i18n";
export async function api(path, body) {
  const response = await fetch("/api" + path, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw Error("Servidor indisponível. Tente novamente em instantes.");
  }
  if (!response.ok) throw Error(t(data.error || "Não foi possível concluir"));
  return data;
}
export async function persist(old, next) {
  const added = (kind) => next[kind].filter((n) => !old[kind].some((o) => o.id === n.id));
  const students = added("students");
  if (students.length) {
    const s = students[0];
    return api("/students", {
      name: s.name,
      email: s.email,
      goal: s.goal,
      initial: s.initial,
      height: s.height,
    });
  }
  const commands = [];
  for (const kind of ["workouts", "meals", "logs", "measurements", "messages"])
    for (const payload of added(kind)) commands.push({ kind, student: payload.student, payload });
  for (const log of old.logs.filter((l) => !next.logs.some((n) => n.id === l.id)))
    commands.push({ action: "remove-log", student: log.student, payload: { id: log.id } });
  for (const [key, cups] of Object.entries(next.water))
    if (cups !== old.water[key]) {
      const student = old.students.find((s) => key.startsWith(s.id));
      if (student) commands.push({ action: "water", student: student.id, payload: { cups } });
    }
  return commands.length ? api("/commands", { commands }) : old;
}
