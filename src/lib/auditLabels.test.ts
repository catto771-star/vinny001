import { describe, expect, it } from "vitest";
import { MODULES, fieldLabel, formatAuditValue, moduleTables, tableLabel } from "./auditLabels";
import { toCsv } from "./csv";

describe("nomes amigáveis do Audit", () => {
  it("tabelas viram nomes de negócio; desconhecida vira texto legível", () => {
    expect(tableLabel("maintenance_tickets")).toBe("Maintenance request");
    expect(tableLabel("handover_entries")).toBe("Handover entry");
    expect(tableLabel("staff")).toBe("Person");
    expect(tableLabel("some_new_table")).toBe("Some new table");
  });
  it("módulos agrupam as tabelas e nenhuma tabela fica em dois módulos", () => {
    const all = MODULES.flatMap((m) => m.tables);
    expect(new Set(all).size).toBe(all.length);
    expect(moduleTables(["handover"])).toContain("handover_entries");
    expect(moduleTables(["handover", "settings"])).toEqual(expect.arrayContaining(["handover_entries", "parameters"]));
    expect(moduleTables([])).toEqual([]);
    expect(moduleTables(["nao-existe"])).toEqual([]);
  });
  it("campos: tira _id, troca _ por espaço e põe maiúscula inicial", () => {
    expect(fieldLabel("created_by")).toBe("Created by");
    expect(fieldLabel("resident_id")).toBe("Resident");
    expect(fieldLabel("deadline_at")).toBe("Deadline");
    expect(fieldLabel("status")).toBe("Status");
  });
});

describe("valores do Audit", () => {
  const ctx = { names: new Map([["11111111-1111-4111-8111-111111111111", "Ana Lima"]]), format: (iso: string) => `fmt(${iso.slice(0, 10)})` };
  it("resolve UUID de pessoa para o nome; UUID desconhecido vira 8 caracteres", () => {
    expect(formatAuditValue("11111111-1111-4111-8111-111111111111", ctx)).toBe("Ana Lima");
    expect(formatAuditValue("22222222-2222-4222-8222-222222222222", ctx)).toBe("22222222…");
  });
  it("datas, booleanos, vazio, números e objetos", () => {
    expect(formatAuditValue("2026-11-25T10:00:00+00:00", ctx)).toBe("fmt(2026-11-25)");
    expect(formatAuditValue(true, ctx)).toBe("Yes");
    expect(formatAuditValue(false, ctx)).toBe("No");
    expect(formatAuditValue(null, ctx)).toBe("—");
    expect(formatAuditValue(42, ctx)).toBe("42");
    expect(formatAuditValue({ a: 1 }, ctx)).toBe('{"a":1}');
  });
  it("texto longo é cortado com reticências", () => {
    expect(formatAuditValue("x".repeat(200), ctx).length).toBeLessThanOrEqual(81);
  });
});

describe("CSV", () => {
  it("escapa aspas, vírgulas e quebras de linha e protege contra fórmulas de planilha", () => {
    expect(toCsv([["a", 'b "q"', "c,d", "e\nf"]])).toBe('a,"b ""q""","c,d","e\nf"');
    expect(toCsv([["=SUM(A1)", "@x", "-2+3", "+cmd|' /C calc'!A0"]])).toBe(`'=SUM(A1),'@x,'-2+3,'+cmd|' /C calc'!A0`);
    // números e durações simples (inclusive negativos) passam como estão: não são fórmulas
    expect(toCsv([["-2", "+1", "-0:30", "12:00", "-3,5"]])).toBe('-2,+1,-0:30,12:00,"-3,5"');
  });
  it("usa CRLF entre linhas e começa com BOM para o Excel abrir em UTF-8 quando pedido", () => {
    expect(toCsv([["a"], ["b"]])).toBe("a\r\nb");
    expect(toCsv([["é"]], { bom: true }).charCodeAt(0)).toBe(0xfeff);
  });
});
