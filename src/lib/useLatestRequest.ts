import { useCallback, useRef } from "react";

/**
 * Proteção contra resposta atrasada: ao trocar dia/Lodge, só a consulta mais recente
 * pode atualizar a tela. Uso: `const isLatest = begin();` ... `if (!isLatest()) return;`
 */
export function useLatestRequest(): () => () => boolean {
  const seq = useRef(0);
  return useCallback(() => {
    const id = ++seq.current;
    return () => id === seq.current;
  }, []);
}
