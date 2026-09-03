/** Save/Save As path handling that never abandons a working path prematurely. */

export type SaveTransactionResult<Result> =
  | { status: 'cancelled'; path: string | null }
  | { status: 'failed'; path: string | null; result: Result }
  | { status: 'saved'; path: string; result: Result };

export async function runSaveTransaction<Result extends { ok: boolean }>(
  currentPath: string | null,
  saveAs: boolean,
  choosePath: () => Promise<string | null>,
  write: (path: string) => Promise<Result>,
): Promise<SaveTransactionResult<Result>> {
  const candidate = !saveAs && currentPath ? currentPath : await choosePath();
  if (!candidate) return { status: 'cancelled', path: currentPath };
  const result = await write(candidate);
  return result.ok
    ? { status: 'saved', path: candidate, result }
    : { status: 'failed', path: currentPath, result };
}
