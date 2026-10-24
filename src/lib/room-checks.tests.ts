import {
  combineOperationalDateTime,
  computeRoomCheckProgress,
  localDateIso,
  normalizeScheduleTimes,
  pendingRoomIds,
  runStatusLabel,
  validateFinishRun,
} from "./room-checks";

export type RoomCheckTestResult = {
  name: string;
  passed: boolean;
  message: string;
};

export type RoomCheckTestSuite = {
  passed: number;
  failed: number;
  results: RoomCheckTestResult[];
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

const tests: { name: string; run: () => void }[] = [
  {
    name: "localDateIso devolve o dia local em formato ISO",
    run: () => {
      equal(localDateIso(new Date(2024, 0, 5)), "2024-01-05", "data");
      equal(localDateIso(new Date(2024, 11, 31)), "2024-12-31", "data fim de ano");
    },
  },
  {
    name: "combineOperationalDateTime junta dia e hora",
    run: () => {
      const result = combineOperationalDateTime("2024-03-05", "10:30");
      assert(result !== null, "devia devolver uma data");
      assert(result !== null && result.endsWith("Z"), "devia devolver ISO em UTC");

      const parsed = new Date(result as string);
      equal(parsed.getFullYear(), 2024, "ano");
      equal(parsed.getMonth(), 2, "mês");
      equal(parsed.getDate(), 5, "dia");
      equal(parsed.getHours(), 10, "hora");
      equal(parsed.getMinutes(), 30, "minutos");
    },
  },
  {
    name: "combineOperationalDateTime rejeita valores inválidos",
    run: () => {
      equal(combineOperationalDateTime("05/03/2024", "10:30"), null, "dia inválido");
      equal(combineOperationalDateTime("2024-03-05", "25:00"), null, "hora inválida");
      equal(combineOperationalDateTime("2024-03-05", "dez"), null, "hora em texto");
    },
  },
  {
    name: "normalizeScheduleTimes aceita horas da unidade e ordena",
    run: () => {
      equal(normalizeScheduleTimes(["19:00", "08:30", "19:00"]), ["08:30", "19:00"], "horas");
      equal(normalizeScheduleTimes(["07:15:00"]), ["07:15"], "hora com segundos");
    },
  },
  {
    name: "normalizeScheduleTimes usa fallback quando não há horas válidas",
    run: () => {
      equal(normalizeScheduleTimes(null), ["10:00", "19:00"], "sem valores");
      equal(normalizeScheduleTimes(["manhã", "99:99"]), ["10:00", "19:00"], "valores inválidos");
      equal(normalizeScheduleTimes([], ["12:00"]), ["12:00"], "fallback próprio");
    },
  },
  {
    name: "computeRoomCheckProgress calcula percentagem e pendentes",
    run: () => {
      equal(
        computeRoomCheckProgress(4, 1),
        { checked: 1, total: 4, percent: 25, complete: false, remaining: 3 },
        "progresso a meio",
      );

      equal(
        computeRoomCheckProgress(2, 5),
        { checked: 2, total: 2, percent: 100, complete: true, remaining: 0 },
        "verificados acima do total",
      );
    },
  },
  {
    name: "computeRoomCheckProgress trata unidade sem quartos",
    run: () => {
      equal(
        computeRoomCheckProgress(0, 0),
        { checked: 0, total: 0, percent: 0, complete: false, remaining: 0 },
        "sem quartos",
      );
    },
  },
  {
    name: "pendingRoomIds devolve apenas os quartos por verificar",
    run: () => {
      equal(pendingRoomIds(["a", "b", "c"], ["b"]), ["a", "c"], "pendentes");
      equal(pendingRoomIds([], []), [], "lista vazia");
    },
  },
  {
    name: "validateFinishRun exige motivo quando fica incompleta",
    run: () => {
      const partial = computeRoomCheckProgress(4, 2);
      equal(validateFinishRun(partial, "   ").ok, false, "sem motivo");
      equal(validateFinishRun(partial, "Quarto ocupado").ok, true, "com motivo");
      equal(validateFinishRun(computeRoomCheckProgress(3, 3), "").ok, true, "completa");
      equal(validateFinishRun(computeRoomCheckProgress(0, 0), "motivo").ok, false, "sem quartos");
    },
  },
  {
    name: "runStatusLabel traduz os estados da verificação",
    run: () => {
      equal(runStatusLabel("in_progress"), "Em curso", "em curso");
      equal(runStatusLabel("completed"), "Concluída", "concluída");
      equal(runStatusLabel("incomplete"), "Incompleta", "incompleta");
      equal(runStatusLabel("outro"), "outro", "desconhecido");
    },
  },
];

export function runRoomCheckTests(): RoomCheckTestSuite {
  const results: RoomCheckTestResult[] = tests.map((test) => {
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
