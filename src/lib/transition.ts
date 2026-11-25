/**
 * Revisão 7: transições de tela parecidas com as do iOS/Mac.
 * - push: abrir um detalhe (rota mais funda) — a tela nova chega da direita.
 * - pop: voltar (botão voltar do navegador/celular ou subir de nível) — chega da esquerda.
 * - fade: trocar de seção pelo menu/abas — esmaecer rápido com leve escala, como no Mac.
 */
export type TransitionKind = "push" | "pop" | "fade" | "none";
export type NavType = "PUSH" | "POP" | "REPLACE";

const depth = (p: string) => p.split("/").filter(Boolean).length;
const section = (p: string) => p.split("/")[1] ?? "";

export function transitionKind(prev: string | null, next: string, nav: NavType): TransitionKind {
  if (prev === null || prev === next) return "none";
  if (nav === "POP") return "pop";
  if (section(prev) === section(next) && section(next) !== "") {
    if (depth(next) > depth(prev)) return "push";
    if (depth(next) < depth(prev)) return "pop";
  }
  return "fade";
}
