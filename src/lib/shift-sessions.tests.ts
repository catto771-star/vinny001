import {
  formatDuration,
  normalizeShiftRoles,
  openSessionForUser,
  shiftDurationMinutes,
  shiftStatusLabel,
  summarizeShifts,
  validateShiftEnd,
  validateShiftStart,
  type ShiftSession,
} from "./shift-sessions";

export type ShiftSessionTestResult = {
  name: string;
  passed: boolean;
  message: string;
};

export type ShiftSessionTestSuite = {
  passed: number;
  failed: number;
  results: ShiftSessionTestResult[];
};

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function equal(actual: unknown, expected: unknown, label: string): void {
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${label}: esperado ${JSON.stringify(expected)}, obtido ${JSON.stringify(actual)}`,
  );
}

function makeSession(overrides: Partial<ShiftSession> & { id: string }): ShiftSession {
  return {
    id: overrides.id,
    user_id: overrides.user_id ?? "u1",
    lodge_id: overrides.lodge_id ?? "l1",
    shift_role: overrides.shift_role ?? "day",
    started_at: overrides.started_at ?? "2024-01-01T08:00:00.000Z",
    ended_at: "ended_at" in overrides ? (overrides.ended_at ?? null) : "2024-01-01T16:00:00.000Z",
  };
}

const tests: { name: string; run: () => void }[] = [
  {
    name: "normalizeShiftRoles limpa, deduplica e ordena as funções de turno",
    run: () => {
      equal(
        normalizeShiftRoles(["night", "day", "Day", "  night  ", ""]),
        ["day", "night"],
        "funções",
      );
      equal(normalizeShiftRoles(null), [], "sem valores");
      equal(normalizeShiftRoles([1, {}, "  "]), [], "valores inválidos");
    },
  },
  {
    name: "shiftDurationMinutes mede a duração de um turno fechado",
    run: () => {
      equal(
        shiftDurationMinutes("2024-01-01T08:00:00.000Z", "2024-01-01T16:30:00.000Z"),
        510,
        "duração",
      );
    },
  },
  {
    name: "shiftDurationMinutes conta o turno aberto até agora",
    run: () => {
      const now = new Date("2024-01-02T12:00:00.000Z");
      equal(shiftDurationMinutes("2024-01-02T08:00:00.000Z", null, now), 240, "em curso");
    },
  },
  {
    name: "shiftDurationMinutes ignora datas inválidas e inversões",
    run: () => {
      equal(shiftDurationMinutes("não é data", null), 0, "início inválido");
      equal(
        shiftDurationMinutes("2024-01-01T16:00:00.000Z", "2024-01-01T08:00:00.000Z"),
        0,
        "fim antes do início",
      );
    },
  },
  {
    name: "formatDuration escreve horas e minutos",
    run: () => {
      equal(formatDuration(0), "0 min", "zero");
      equal(formatDuration(45), "45 min", "minutos");
      equal(formatDuration(60), "1h", "hora exata");
      equal(formatDuration(135), "2h 15min", "horas e minutos");
      equal(formatDuration(-30), "0 min", "negativo");
    },
  },
  {
    name: "summarizeShifts conta turnos abertos, fechados e tempos",
    run: () => {
      const now = new Date("2024-01-02T12:00:00.000Z");
      const summary = summarizeShifts(
        [
          makeSession({
            id: "s1",
            started_at: "2024-01-01T08:00:00.000Z",
            ended_at: "2024-01-01T16:00:00.000Z",
          }),
          makeSession({
            id: "s2",
            started_at: "2024-01-01T20:00:00.000Z",
            ended_at: "2024-01-01T22:30:00.000Z",
          }),
          makeSession({
            id: "s3",
            started_at: "2024-01-02T08:00:00.000Z",
            ended_at: null,
          }),
        ],
        now,
      );

      equal(summary.total, 3, "total");
      equal(summary.open, 1, "abertos");
      equal(summary.closed, 2, "fechados");
      equal(summary.totalMinutes, 870, "minutos totais");
      equal(summary.averageMinutes, 315, "média dos fechados");
      equal(summary.longestMinutes, 480, "mais longo");
    },
  },
  {
    name: "summarizeShifts devolve zeros sem turnos",
    run: () => {
      equal(
        summarizeShifts([], new Date("2024-01-02T12:00:00.000Z")),
        { total: 0, open: 0, closed: 0, totalMinutes: 0, averageMinutes: 0, longestMinutes: 0 },
        "sem turnos",
      );
    },
  },
  {
    name: "openSessionForUser encontra apenas o turno aberto do utilizador",
    run: () => {
      const sessions = [
        makeSession({ id: "s1", user_id: "u1", ended_at: "2024-01-01T16:00:00.000Z" }),
        makeSession({ id: "s2", user_id: "u1", ended_at: null }),
        makeSession({ id: "s3", user_id: "u2", ended_at: null }),
      ];

      equal(openSessionForUser(sessions, "u1")?.id, "s2", "turno do u1");
      equal(openSessionForUser(sessions, "u3"), null, "utilizador sem turno");
      equal(openSessionForUser(sessions, ""), null, "sem utilizador");
    },
  },
  {
    name: "validateShiftStart bloqueia turno duplicado e função vazia",
    run: () => {
      equal(validateShiftStart("day", false).ok, true, "início válido");
      equal(validateShiftStart("day", true).ok, false, "turno já aberto");
      equal(validateShiftStart("   ", false).ok, false, "sem função");
    },
  },
  {
    name: "validateShiftEnd exige um turno aberto",
    run: () => {
      equal(validateShiftEnd(true).ok, true, "turno aberto");
      equal(validateShiftEnd(false).ok, false, "turno já terminado");
    },
  },
  {
    name: "shiftStatusLabel traduz o estado do turno",
    run: () => {
      equal(shiftStatusLabel(true), "Em curso", "em curso");
      equal(shiftStatusLabel(false), "Terminado", "terminado");
    },
  },
];

export function runShiftSessionTests(): ShiftSessionTestSuite {
  const results: ShiftSessionTestResult[] = tests.map((test) => {
    try {
      test.run();
      return { name: test.name, passed: true, message: "ok" };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { name: test.name, passed: false, message };
    }
  });

  const passed = results.filter((result) => result.passed).length;

  return { passed, failed: results.length - passed, results };
}
