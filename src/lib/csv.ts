/** CSV seguro: aspas/vírgulas/quebras escapadas e células que começam com = + - @ ganham apóstrofo (injeção de fórmula). */
export function toCsv(rows: string[][], opts: { bom?: boolean } = {}): string {
  const cell = (raw: string) => {
    let v = raw ?? "";
    // Proteção contra fórmula de planilha; número ou duração simples (ex.: -2, +1, -0:30) não é fórmula.
    if (/^[=+\-@]/.test(v) && !/^[-+]?\d+([.,:]\d+)*$/.test(v)) v = `'${v}`;
    return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  const body = rows.map((r) => r.map(cell).join(",")).join("\r\n");
  return (opts.bom ? "﻿" : "") + body;
}
