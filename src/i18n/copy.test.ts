// Revisão 12: guia de estilo dos textos (inglês da Irlanda, enxuto). Falha se uma frase voltar a violar uma regra.
import { describe, expect, it } from "vitest";
import enIE from "./en-IE";

function flat(o: unknown, path = ""): [string, string][] {
  if (typeof o === "string") return [[path, o]];
  if (o && typeof o === "object") return Object.entries(o).flatMap(([k, v]) => flat(v, path ? `${path}.${k}` : k));
  return [];
}
const all = flat(enIE);
const bad = (re: RegExp, skip: string[] = []) => all.filter(([k, v]) => !skip.includes(k) && re.test(v)).map(([k, v]) => `${k}: ${v}`);

describe("estilo dos textos", () => {
  it("sem 'Please' (diga o que fazer, sem rodeio)", () => expect(bad(/\bplease\b/i)).toEqual([]));
  it("sem ponto de exclamação", () => expect(bad(/!/)).toEqual([]));
  it("sem grafia americana (colour, organisation, centre, cancelled, favourite, behaviour, licence, programme)", () =>
    expect(bad(/\b(color|colors|organization|center|canceled|favorite|behavior|license|program|neighbor|analyze|catalog|gray)\b/i)).toEqual([]));
  it("sem espaço duplo (fora da linha de assinatura da folha impressa) nem espaço nas pontas", () => {
    expect(bad(/ {2}/, ["sheet.printShift"])).toEqual([]);
    expect(all.filter(([, v]) => v !== v.trim()).map(([k]) => k)).toEqual([]);
  });
  it("sem 'the system' (o sistema não precisa se anunciar)", () => expect(bad(/\bthe system\b/i)).toEqual([]));
  it("'house' no texto da interface; 'Lodge' só no nome da organização", () => expect(bad(/\bLodges?\b/, ["app.name"])).toEqual([]));
  it("sem reticências de três pontos (usa …)", () => expect(bad(/\.\.\./)).toEqual([]));
  it("rótulos e botões curtos não terminam em ponto", () => {
    const labelKeys = /(^|\.)(title|save|cancel|add|new|edit|void|close|open|confirm|back|print|export|search|filter|all|day|week|month)$/;
    expect(all.filter(([k, v]) => labelKeys.test(k) && v.length < 30 && v.endsWith(".")).map(([k]) => k)).toEqual([]);
  });
  it("nenhuma frase passa de 110 caracteres (quem precisa de mais, vira tooltip ou é dividida)", () => {
    expect(all.filter(([, v]) => v.length > 110).map(([k, v]) => `${k} (${v.length})`)).toEqual([]);
  });
});
