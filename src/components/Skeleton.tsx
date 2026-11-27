/** Carregamento: linhas com brilho no lugar do conteúdo (sem "Carregando…" seco). */
export function Skeleton({ rows = 5, label = "…" }: { rows?: number; label?: string }) {
  return (
    <div className="skeleton" role="status" aria-busy="true" aria-label={label}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton-line" style={{ width: `${92 - ((i * 17) % 35)}%`, animationDelay: `${i * 60}ms` }} />
      ))}
    </div>
  );
}
