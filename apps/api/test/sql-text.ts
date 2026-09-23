/**
 * Render a drizzle `sql` fragment (or any nested query builder) into plain
 * SQL text so repository tests can assert statement contents and ordering.
 * Column references contribute their table-qualified name.
 */
export function sqlText(query: unknown): string {
  const parts: string[] = [];
  const visit = (node: unknown): void => {
    if (typeof node === 'string') {
      parts.push(node);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!node || typeof node !== 'object') return;
    const obj = node as Record<string, unknown>;
    if (Array.isArray(obj.queryChunks)) {
      obj.queryChunks.forEach(visit);
      return;
    }
    // Column reference: emit "table.column".
    if (typeof obj.name === 'string' && obj.table) {
      const table = obj.table as { name?: unknown };
      const tableName = typeof table.name === 'string' ? table.name : '';
      parts.push(tableName ? `${tableName}.${obj.name}` : String(obj.name));
      return;
    }
    if ('value' in obj) visit(obj.value);
  };
  const chunks = (query as { queryChunks?: unknown[] } | null)?.queryChunks;
  if (Array.isArray(chunks)) chunks.forEach(visit);
  return parts.join('');
}
