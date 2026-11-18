import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

/** Loads every row of a table for the signed-in user and reloads on demand. */
export function useTable<T>(table: string, select = '*', order?: { column: string; ascending?: boolean }) {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    let query = supabase.from(table).select(select);
    if (order) query = query.order(order.column, { ascending: order.ascending ?? true });
    const { data, error: err } = await query;
    if (err) setError(err.message);
    else {
      setError(null);
      setRows((data ?? []) as T[]);
    }
    setLoading(false);
  }, [table, select, order?.column, order?.ascending]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { rows, setRows, loading, error, reload };
}

/** Runs a write and surfaces its error instead of failing silently. */
export async function write<T>(promise: PromiseLike<{ error: { message: string } | null; data?: T }>) {
  const { error } = await promise;
  if (error) {
    alert(`Não foi possível salvar: ${error.message}`);
    return false;
  }
  return true;
}
