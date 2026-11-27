/** Lê todas as páginas de uma consulta paginada (sem limite fixo de linhas). */
export async function fetchAllPages<T>(page: (from: number, to: number) => PromiseLike<T[]>, size = 1000): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += size) {
    const rows = await page(from, from + size - 1);
    all.push(...rows);
    if (rows.length < size) return all;
  }
}
