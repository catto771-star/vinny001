export type FieldChange = { field: string; before: unknown; after: unknown };

const IGNORED = new Set(["version", "id", "created_at"]);

/** Campos que mudaram entre o valor anterior e o novo de um registro auditado. */
export function diffRecord(oldData: Record<string, unknown> | null, newData: Record<string, unknown> | null): FieldChange[] {
  const keys = new Set([...Object.keys(oldData ?? {}), ...Object.keys(newData ?? {})]);
  const changes: FieldChange[] = [];
  for (const field of keys) {
    if (IGNORED.has(field)) continue;
    const before = oldData?.[field] ?? null;
    const after = newData?.[field] ?? null;
    if (JSON.stringify(before) !== JSON.stringify(after)) changes.push({ field, before, after });
  }
  return changes;
}
