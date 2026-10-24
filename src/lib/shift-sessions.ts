export type ShiftSession = {
  id: string;
  user_id: string;
  lodge_id: string;
  shift_role: string;
  started_at: string;
  ended_at: string | null;
};

export type ShiftSummary = {
  total: number;
  open: number;
  closed: number;
  totalMinutes: number;
  averageMinutes: number;
  longestMinutes: number;
};

export type ShiftValidation = {
  ok: boolean;
  error?: string;
};

export function normalizeShiftRoles(values: unknown): string[] {
  const source = Array.isArray(values) ? values : [];
  const seen = new Set<string>();
  const roles: string[] = [];

  source.forEach((value) => {
    if (typeof value !== "string") return;

    const trimmed = value.trim();
    if (trimmed.length === 0) return;

    const key = trimmed.toLowerCase();
    if (seen.has(key)) return;

    seen.add(key);
    roles.push(trimmed);
  });

  roles.sort((a, b) => a.localeCompare(b, "pt"));

  return roles;
}

export function shiftDurationMinutes(
  startedAt: string,
  endedAt: string | null,
  now: Date = new Date(),
): number {
  const start = new Date(startedAt).getTime();
  if (Number.isNaN(start)) return 0;

  const end = endedAt ? new Date(endedAt).getTime() : now.getTime();
  if (Number.isNaN(end)) return 0;

  const diff = end - start;
  if (diff <= 0) return 0;

  return Math.round(diff / 60000);
}

export function formatDuration(minutes: number): string {
  const safe = Math.max(0, Math.trunc(Number.isFinite(minutes) ? minutes : 0));
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;

  if (hours === 0) return `${rest} min`;
  if (rest === 0) return `${hours}h`;

  return `${hours}h ${rest}min`;
}

export function summarizeShifts(
  sessions: ShiftSession[],
  now: Date = new Date(),
): ShiftSummary {
  let open = 0;
  let closed = 0;
  let totalMinutes = 0;
  let closedMinutes = 0;
  let longestMinutes = 0;

  sessions.forEach((session) => {
    const minutes = shiftDurationMinutes(session.started_at, session.ended_at, now);

    totalMinutes += minutes;

    if (session.ended_at) {
      closed += 1;
      closedMinutes += minutes;
    } else {
      open += 1;
    }

    if (minutes > longestMinutes) longestMinutes = minutes;
  });

  return {
    total: sessions.length,
    open,
    closed,
    totalMinutes,
    averageMinutes: closed > 0 ? Math.round(closedMinutes / closed) : 0,
    longestMinutes,
  };
}

export function openSessionForUser(
  sessions: ShiftSession[],
  userId: string,
): ShiftSession | null {
  if (!userId) return null;

  return (
    sessions.find((session) => session.user_id === userId && session.ended_at === null) ?? null
  );
}

export function validateShiftStart(role: string, hasOpenSession: boolean): ShiftValidation {
  if (hasOpenSession) {
    return { ok: false, error: "Já existe um turno aberto. Termine-o antes de iniciar outro." };
  }

  if (role.trim().length === 0) {
    return { ok: false, error: "Escolha a função do turno antes de iniciar." };
  }

  return { ok: true };
}

export function validateShiftEnd(hasOpenSession: boolean): ShiftValidation {
  if (!hasOpenSession) {
    return { ok: false, error: "Este turno já está terminado." };
  }

  return { ok: true };
}

export function shiftStatusLabel(isOpen: boolean): string {
  return isOpen ? "Em curso" : "Terminado";
}
