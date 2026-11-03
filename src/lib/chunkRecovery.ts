const RECOVERY_KEY = "speedy:chunk-recovery";

export function isChunkLoadError(error: Error): boolean {
  return /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk .+ failed|Failed to load module script|Unable to preload CSS/i.test(error.message);
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
/**
 * Vite fires `vite:preloadError` when a lazy chunk or its CSS 404s, which is what
 * an open tab sees right after a deploy (old asset hashes are deleted at once).
 * Reload once into the new build instead of letting the route fail.
 */
export function installPreloadErrorRecovery(target: Window = window): void {
  target.addEventListener("vite:preloadError", (event) => {
    const payload = (event as Event & { payload?: unknown }).payload;
    const error = payload instanceof Error ? payload : new Error(String(payload ?? "Failed to fetch dynamically imported module"));
    try {
      if (recoverChunkLoad(error, target.sessionStorage, () => target.location.reload())) event.preventDefault();
    } catch {
      // Storage blocked: fall through to the ErrorBoundary's manual reload.
    }
  });
}
