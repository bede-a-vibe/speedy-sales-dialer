/**
 * Records what goes wrong in a rep's browser so "it crashed" can be looked up:
 * uncaught errors, failed promises, the error screen, recording failures, and
 * a tab that died without closing (an out-of-memory or browser crash), noticed
 * on the next load from a heartbeat kept in sessionStorage.
 */
import { supabase } from "@/integrations/supabase/client";

const MAX_PER_SESSION = 25;
const HEARTBEAT_KEY = "sd-heartbeat-v1";
const LISTEN_KEY = "sd-last-listen-v1";
let sent = 0;
const seen = new Set<string>();

function heapMB(): number | null {
  const m = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  return m ? Math.round(m.usedJSHeapSize / 1048576) : null;
}

function safeGet(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string | null) {
  try {
    if (value == null) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, value);
  } catch {
    // Blocked storage: no crash detection, nothing else breaks.
  }
}

export function reportClientError(kind: string, message: string, detail: Record<string, unknown> = {}) {
  try {
    const key = `${kind}|${message}`.slice(0, 300);
    if (seen.has(key) || sent >= MAX_PER_SESSION) return;
    seen.add(key);
    sent += 1;
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;
      await (supabase.from as unknown as (t: string) => { insert: (r: unknown) => Promise<unknown> })("client_errors").insert({
        kind,
        message: message.slice(0, 2000),
        path: window.location.pathname + window.location.search,
        detail: { ...detail, heapMB: heapMB(), lastListen: safeGet(LISTEN_KEY) },
        user_agent: navigator.userAgent.slice(0, 300),
      });
    })().catch(() => undefined);
  } catch {
    // Reporting must never be the thing that breaks the page.
  }
}

/** Breadcrumb: which recording was last being loaded or played. */
export function noteListen(what: string) {
  safeSet(LISTEN_KEY, `${new Date().toISOString()} ${what}`);
}

export function installErrorReporter() {
  if (typeof window === "undefined") return;
  // A heartbeat left behind by the last page in this tab means it never got to
  // close: the tab crashed or was killed.
  const previous = safeGet(HEARTBEAT_KEY);
  if (previous) {
    let beat: Record<string, unknown> = {};
    try {
      beat = JSON.parse(previous);
    } catch {
      beat = { raw: previous };
    }
    // Wait for the session to be restored before writing.
    setTimeout(() => reportClientError("tab_died", "Previous page in this tab ended without closing", { lastBeat: beat }), 4000);
  }
  const beat = () =>
    safeSet(HEARTBEAT_KEY, JSON.stringify({ at: new Date().toISOString(), path: window.location.pathname, heapMB: heapMB() }));
  beat();
  window.setInterval(beat, 10_000);
  window.addEventListener("pagehide", () => safeSet(HEARTBEAT_KEY, null));

  window.addEventListener("error", (e) => {
    if (e.error || e.message) reportClientError("window_error", String(e.message || e.error), { stack: String(e.error?.stack ?? "").slice(0, 3000), source: e.filename, line: e.lineno });
  });
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason as { message?: string; stack?: string } | undefined;
    reportClientError("unhandled_rejection", String(r?.message ?? r ?? "unknown"), { stack: String(r?.stack ?? "").slice(0, 3000) });
  });
}
