const RECOVERY_KEY = "speedy:chunk-recovery";

export function isChunkLoadError(error: Error): boolean {
  return /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk .+ failed|Failed to load module script/i.test(error.message);
}

/** A stale deployment chunk needs a new document, not another React render. */
export function recoverChunkLoad(
  error: Error,
  storage: Pick<Storage, "getItem" | "setItem">,
  reload: () => void,
): boolean {
  if (!isChunkLoadError(error)) return false;
  try {
    if (storage.getItem(RECOVERY_KEY) === error.message) return false;
    storage.setItem(RECOVERY_KEY, error.message);
  } catch {
    // Without a persistent guard, automatic reloads could loop.
    return false;
  }
  reload();
  return true;
}