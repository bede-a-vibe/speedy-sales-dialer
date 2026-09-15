/**
 * "Stay signed in" policy.
 *
 * When ON (default) the session persists like normal — the login is remembered
 * across browser restarts until the refresh token expires.
 *
 * When OFF we shorten the effective session on this device:
 *  - the login is dropped as soon as the browser/tab session ends (no sessionStorage marker),
 *  - it is dropped after 30 minutes of inactivity (sliding),
 *  - and it is dropped 8 hours after signing in no matter what.
 */

const STAY_KEY = "auth.stay_signed_in";
const MARKER_KEY = "auth.short_session";

export const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
export const ABSOLUTE_TIMEOUT_MS = 8 * 60 * 60 * 1000;

interface ShortSessionMarker {
  startedAt: number;
  lastActiveAt: number;
}

export function getStaySignedIn(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(STAY_KEY) !== "0";
}

function readMarker(): ShortSessionMarker | null {
  try {
    const raw = window.sessionStorage.getItem(MARKER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ShortSessionMarker;
    if (typeof parsed?.startedAt !== "number" || typeof parsed?.lastActiveAt !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeMarker(marker: ShortSessionMarker) {
  try {
    window.sessionStorage.setItem(MARKER_KEY, JSON.stringify(marker));
  } catch {
    // Storage unavailable — policy simply falls back to sign-out on next check.
  }
}

/** Call right after a successful sign-in. */
export function setStaySignedIn(stay: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STAY_KEY, stay ? "1" : "0");
  if (stay) {
    window.sessionStorage.removeItem(MARKER_KEY);
  } else {
    const now = Date.now();
    writeMarker({ startedAt: now, lastActiveAt: now });
  }
}

/** Records user activity so the idle window slides forward. */
export function touchShortSession() {
  if (typeof window === "undefined" || getStaySignedIn()) return;
  const marker = readMarker();
  if (!marker) return;
  writeMarker({ ...marker, lastActiveAt: Date.now() });
}

export type SessionPolicyVerdict = "ok" | "browser-closed" | "idle" | "expired";

/** Returns why the short session should end, or "ok" to keep it. */
export function evaluateSessionPolicy(now = Date.now()): SessionPolicyVerdict {
  if (typeof window === "undefined" || getStaySignedIn()) return "ok";
  const marker = readMarker();
  if (!marker) return "browser-closed";
  if (now - marker.lastActiveAt > IDLE_TIMEOUT_MS) return "idle";
  if (now - marker.startedAt > ABSOLUTE_TIMEOUT_MS) return "expired";
  return "ok";
}

export function clearShortSessionMarker() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(MARKER_KEY);
}

/** Minutes left before the short session ends, or null when staying signed in. */
export function shortSessionMinutesLeft(now = Date.now()): number | null {
  if (typeof window === "undefined" || getStaySignedIn()) return null;
  const marker = readMarker();
  if (!marker) return 0;
  const idleLeft = IDLE_TIMEOUT_MS - (now - marker.lastActiveAt);
  const absoluteLeft = ABSOLUTE_TIMEOUT_MS - (now - marker.startedAt);
  return Math.max(0, Math.round(Math.min(idleLeft, absoluteLeft) / 60000));
}
