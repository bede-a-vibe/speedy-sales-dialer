/**
 * Demo mode (Coach role) — read-only safeguard.
 *
 * Strategy:
 *  - The DB already blocks all writes (coach has no INSERT/UPDATE/DELETE policies).
 *  - This module installs a tiny client-side interceptor that fires a friendly
 *    "Demo mode — change not saved" toast BEFORE the request leaves the browser
 *    so the coach sees clear feedback instead of a raw RLS error.
 *
 *  The interceptor does NOT block the request itself — RLS remains the source
 *  of truth. We intentionally keep the request going so any UI optimistic
 *  updates that auto-revert on error continue to work as designed.
 */
import { toast } from "sonner";

let demoModeActive = false;
let lastToastAt = 0;

export function setDemoModeActive(active: boolean) {
  demoModeActive = active;
}

export function isDemoModeActive() {
  return demoModeActive;
}

/**
 * Show a single demo-mode toast (debounced so a burst of writes only shows one).
 */
export function notifyDemoBlocked(actionLabel?: string) {
  if (!demoModeActive) return;
  const now = Date.now();
  if (now - lastToastAt < 1500) return;
  lastToastAt = now;
  toast.info("🎓 Demo mode — change not saved", {
    description: actionLabel
      ? `${actionLabel} would have been recorded for a real account.`
      : "Coaching accounts can explore every screen but cannot write data.",
    duration: 4000,
  });
}

/**
 * Inline guard for explicit call-sites:
 *   if (guardDemoWrite("Save target")) return;
 * Returns true when the caller should bail out of the mutation.
 */
export function guardDemoWrite(actionLabel?: string): boolean {
  if (!demoModeActive) return false;
  notifyDemoBlocked(actionLabel);
  return true;
}

/**
 * Install a global fetch shim that watches for Supabase write requests
 * (POST/PATCH/PUT/DELETE to /rest/v1/) and surfaces the demo-mode toast.
 * The request itself is still sent — RLS blocks it on the server.
 */
let installed = false;
export function installDemoFetchInterceptor() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (demoModeActive) {
      const method = (init?.method || "GET").toUpperCase();
      const url = typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
      if (
        url.includes("/rest/v1/") &&
        (method === "POST" || method === "PATCH" || method === "PUT" || method === "DELETE")
      ) {
        // Skip auth-only RPCs that are read-only by convention
        notifyDemoBlocked();
      }
    }
    return originalFetch(input as RequestInfo, init);
  };
}