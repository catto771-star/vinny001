import { describe, expect, it } from "vitest";
import { errorKey } from "./errors";

describe("errorKey", () => {
  it("mapeia erros do banco para mensagens", () => {
    expect(errorKey({ message: 'duplicate key value violates unique constraint "stays_one_open_per_bed"' })).toBe("errors.bedTaken");
    expect(errorKey({ message: "new row violates row-level security policy" })).toBe("errors.notAuthorised");
    expect(errorKey({ message: "stale_version" })).toBe("errors.staleVersion");
    expect(errorKey(new TypeError("Failed to fetch"))).toBe("errors.network");
    expect(errorKey(null)).toBe("errors.generic");
    expect(errorKey({ message: "not_author" })).toBe("errors.notAuthor");
    expect(errorKey({ message: "not_authorised" })).toBe("errors.notAuthorised");
    expect(errorKey({ message: "not_author: Author only" })).toBe("errors.notAuthor");
    expect(errorKey({ message: "unmarked_residents" })).toBe("sheet.markAll");
    expect(errorKey({ message: "checks_pending" })).toBe("noShows.incomplete");
  });

  it("mapeia erros da gestão (Fase 3)", () => {
    expect(errorKey({ message: "staff_overlap" })).toBe("errors.staffOverlap");
    expect(errorKey({ message: "float_overlap" })).toBe("errors.floatOverlap");
    expect(errorKey({ message: "role_not_allowed" })).toBe("errors.roleNotAllowed");
    expect(errorKey({ message: "exceeds_purchased_quantity" })).toBe("errors.exceedsPurchased");
    expect(errorKey({ message: "same_lodge" })).toBe("errors.sameLodge");
    expect(errorKey({ message: "invalid_period" })).toBe("errors.invalidPeriod");
  });

  it("campo em branco e entradas fora dos limites (varredura em massa) têm mensagem própria", () => {
    for (const m of [
      'new row for relation "residents" violates check constraint "residents_first_name_check"',
      'new row for relation "maintenance_tickets" violates check constraint "maintenance_tickets_location_check"',
      'new row for relation "task_extras" violates check constraint "task_extras_title_check"',
      'new row for relation "products" violates check constraint "products_name_check"',
      "supplier_required",
    ]) expect(errorKey({ message: m }), m).toBe("errors.fieldRequired");
    expect(errorKey({ message: "invalid_range" })).toBe("errors.invalidRange");
    expect(errorKey({ message: "range_too_large" })).toBe("errors.invalidRange");
    expect(errorKey({ message: "invalid_month" })).toBe("errors.invalidRange");
    expect(errorKey({ message: "interval_too_long" })).toBe("errors.intervalTooLong");
    expect(errorKey({ message: "in_future" })).toBe("errors.inFuture");
    expect(errorKey({ message: "invalid_quantity" })).toBe("errors.invalidQuantity");
    expect(errorKey({ message: "invalid_line" })).toBe("errors.invalidQuantity");
    expect(errorKey({ message: "lines_required" })).toBe("errors.fieldRequired");
  });

  it("registro inexistente ou id inválido (link velho, URL editada) tem mensagem própria", () => {
    for (const m of ["resident_not_found", "ticket_not_found", "run_not_found", "post_not_found", "line_not_found", 'invalid input syntax for type uuid: "not-a-uuid"'])
      expect(errorKey({ message: m }), m).toBe("errors.notFound");
  });

  it("residente que não está no Lodge e hora do visto no futuro", () => {
    expect(errorKey({ message: "resident_not_in_lodge" })).toBe("errors.residentNotInLodge");
    expect(errorKey({ message: "invalid_seen_time" })).toBe("errors.inFuture");
  });
});
