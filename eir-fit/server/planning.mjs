export const allDays = [1, 2, 3, 4, 5, 6, 7];
export function weekdays(value = allDays) {
  if (
    !Array.isArray(value) ||
    !value.length ||
    value.some((v) => !Number.isInteger(v) || v < 1 || v > 7)
  )
    throw Object.assign(Error("Selecione ao menos um dia válido da semana"), { status: 400 });
  return [...new Set(value)].sort((a, b) => a - b);
}
export function weekday(date) {
  const d = new Date(date + "T12:00:00Z").getUTCDay();
  return d === 0 ? 7 : d;
}
export function activePlan(plan) {
  return plan.active !== false && !plan.archived;
}
export function scheduled(plan, date) {
  return activePlan(plan) && weekdays(plan.weekdays).includes(weekday(date));
}
export function scheduleInput(body) {
  if (body.active !== undefined && typeof body.active !== "boolean")
    throw Object.assign(Error("Estado ativo inválido"), { status: 400 });
  return { active: body.active !== false, weekdays: weekdays(body.weekdays) };
}
