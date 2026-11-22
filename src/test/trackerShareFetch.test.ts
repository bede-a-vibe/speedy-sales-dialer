import { afterEach, describe, expect, it, vi } from "vitest";
import { installTrackerShareFetch, trackerShareTokenFromPath } from "@/lib/trackerShareFetch";

const TOKEN = "a".repeat(48);

describe("trackerShareTokenFromPath", () => {
  it("reads the token from a share path only", () => {
    expect(trackerShareTokenFromPath(`/view/tracker/${TOKEN}`)).toBe(TOKEN);
    expect(trackerShareTokenFromPath(`/view/tracker/${TOKEN}/`)).toBe(TOKEN);
    expect(trackerShareTokenFromPath("/insights?tab=tracker")).toBeNull();
    expect(trackerShareTokenFromPath("/view/tracker/not-a-token")).toBeNull();
  });
});

describe("installTrackerShareFetch", () => {
  const realFetch = window.fetch;
  afterEach(() => {
    window.fetch = realFetch;
  });

  it("sends REST reads to the tracker-share function with the token and leaves other requests alone", async () => {
    const spy = vi.fn(async () => new Response("[]", { status: 200 }));
    window.fetch = spy as unknown as typeof fetch;
    installTrackerShareFetch(TOKEN, "https://x.supabase.co", "pub-key");

    await window.fetch("https://x.supabase.co/rest/v1/tracker_targets?select=id&limit=1", {
      method: "GET",
      headers: { Accept: "application/json", Prefer: "count=exact", Authorization: "Bearer someone" },
    });
    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://x.supabase.co/functions/v1/tracker-share");
    const sent = JSON.parse(String(init.body));
    expect(sent).toMatchObject({
      token: TOKEN,
      method: "GET",
      path: "/rest/v1/tracker_targets",
      search: "?select=id&limit=1",
      headers: { accept: "application/json", prefer: "count=exact" },
    });
    expect(sent.headers.authorization).toBeUndefined();

    await window.fetch("https://x.supabase.co/auth/v1/user");
    expect((spy.mock.calls[1] as unknown as [string])[0]).toBe("https://x.supabase.co/auth/v1/user");
  });
});
