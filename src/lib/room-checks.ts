export type RoomCheckProgress = {
  checked: number;
  total: number;
  percent: number;
  complete: boolean;
  remaining: number;
};

export type RoomCheckValidation = {
  ok: boolean;
  error?: string;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

export const DEFAULT_CHECK_TIMES = ["10:00", "19:00"];

export function localDateIso(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function combineOperationalDateTime(day: string, time: string): string | null {
  if (!DATE_PATTERN.test(day) || !TIME_PATTERN.test(time)) return null;

  const normalized = time.length === 5 ? `${time}:00` : time;
  const date = new Date(`${day}T${normalized}`);

  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString();
}

export function normalizeScheduleTimes(
  values: unknown,
  fallback: string[] = DEFAULT_CHECK_TIMES,
): string[] {
  const source = Array.isArray(values) ? values : [];
  const seen = new Set<string>();
  const times: string[] = [];

  source.forEach((value) => {
    if (typeof value !== "string") return;

    const trimmed = value.trim();
    if (!TIME_PATTERN.test(trimmed)) return;

    const short = trimmed.slice(0, 5);
    if (seen.has(short)) return;

    seen.add(short);
    times.push(short);
  });

  times.sort();

  if (times.length === 0) return [...fallback];

  return times;
}

export function computeRoomCheckProgress(total: number, checked: number): RoomCheckProgress {
  const safeTotal = Math.max(0, Math.trunc(Number.isFinite(total) ? total : 0));
  const safeChecked = Math.min(
    safeTotal,
    Math.max(0, Math.trunc(Number.isFinite(checked) ? checked : 0)),
  );

  const percent = safeTotal === 0 ? 0 : Math.round((safeChecked / safeTotal) * 100);

  return {
    checked: safeChecked,
    total: safeTotal,
    percent,
    complete: safeTotal > 0 && safeChecked === safeTotal,
    remaining: safeTotal - safeChecked,
  };
}

export function pendingRoomIds(allRoomIds: string[], checkedRoomIds: string[]): string[] {
  const checked = new Set(checkedRoomIds);
  return allRoomIds.filter((id) => !checked.has(id));
}

export function validateFinishRun(
  progress: RoomCheckProgress,
  incompleteReason: string,
): RoomCheckValidation {
  if (progress.total === 0) {
    return { ok: false, error: "Esta verificação não tem quartos para verificar." };
  }

  if (progress.complete) return { ok: true };

  if (incompleteReason.trim().length === 0) {
    return { ok: false, error: "Indique o motivo para terminar a verificação incompleta." };
  }

  return { ok: true };
}

export function runStatusLabel(status: string): string {
  switch (status) {
    case "in_progress":
      return "Em curso";
    case "completed":
      return "Concluída";
    case "incomplete":
      return "Incompleta";
    default:
      return status;
  }
}
