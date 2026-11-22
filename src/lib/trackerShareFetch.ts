/**
 * View-only tracker links (23 Nov 2026).
 *
 * On /view/tracker/<token> the page has no login, so the tracker's data
 * requests can't read the database directly. This swaps the browser's fetch
 * before the Supabase client is created: every REST read is sent to the
 * tracker-share edge function with the link's token, and that function checks
 * the token, allows only what the tracker reads, and never writes. Other pages
 * are untouched. main.tsx imports this first so it runs before the client.
 */
export const TRACKER_SHARE_PATH = /^\/view\/tracker\/([a-f0-9]{32,64})\/?$/;

export function trackerShareTokenFromPath(pathname: string): string | null {
  return pathname.match(TRACKER_SHARE_PATH)?.[1] ?? null;
}

const PASS_HEADERS = ["accept", "prefer", "range", "range-unit", "accept-profile", "content-profile"];

export function installTrackerShareFetch(token: string, supabaseUrl: string, publishableKey: string) {
  const restPrefix = `${supabaseUrl}/rest/v1/`;
  const proxyUrl = `${supabaseUrl}/functions/v1/tracker-share`;
  const original = window.fetch.bind(window);

  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : null;
    const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!href.startsWith(restPrefix)) return original(input, init);

    const url = new URL(href);
    const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
    const source = new Headers(init?.headers ?? request?.headers);
    const headers: Record<string, string> = {};
    for (const h of PASS_HEADERS) {
      const v = source.get(h);
      if (v) headers[h] = v;
    }
    const body = typeof init?.body === "string" ? init.body : undefined;

    return original(proxyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: publishableKey, Authorization: `Bearer ${publishableKey}` },
      body: JSON.stringify({ token, method, path: url.pathname, search: url.search, headers, body }),
      signal: init?.signal ?? request?.signal,
    });
  };
}

const token = typeof window !== "undefined" ? trackerShareTokenFromPath(window.location.pathname) : null;
if (token) {
  installTrackerShareFetch(token, import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);
}
