import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({ invoke: vi.fn(), report: vi.fn(), stream: "https://dialpad.com/blob-server/d/x" as string | null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: h.invoke }, auth: { getSession: async () => ({ data: { session: null } }) } } }));
vi.mock("@/lib/errorReporter", () => ({ noteListen: vi.fn(), reportClientError: h.report }));
import { ListenButton } from "@/components/calls/ListenButton";

const proxied = () => h.invoke.mock.calls.filter((c) => c[1].body.action === "proxy_recording_audio").length;
const audio = () => document.querySelector("audio")!;

beforeEach(() => {
  h.stream = "https://dialpad.com/blob-server/d/x";
  h.report.mockClear();
  h.invoke.mockReset().mockImplementation(async (_f: string, o: { body: { action: string } }) =>
    o.body.action === "get_call_recording"
      ? { data: { access_link: "https://dialpad.com/r/x", stream_url: h.stream }, error: null }
      : { data: new Blob(["x"]), error: null });
  (URL as unknown as { createObjectURL: () => string }).createObjectURL = () => "blob:fake";
  (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => undefined;
});
afterEach(() => vi.useRealTimers());
const open = async () => {
  render(<ListenButton dialpadCallId="a" autoPlay={false} />);
  fireEvent.click(screen.getByRole("button", { name: /Listen to the call/ }));
  await waitFor(() => expect(audio()).toBeTruthy());
};

describe("ListenButton streaming", () => {
  it("streams without downloading the whole recording", async () => {
    await open();
    expect(audio().getAttribute("src")).toBe("https://dialpad.com/blob-server/d/x");
    expect(proxied()).toBe(0);
  });

  it("downloads it when the server has no stream address", async () => {
    h.stream = null;
    await open();
    expect(audio().getAttribute("src")).toBe("blob:fake");
  });

  it("falls back once and carries on from the same second when the stream fails", async () => {
    await open();
    audio().currentTime = 42;
    fireEvent.error(audio());
    fireEvent.error(audio());
    await waitFor(() => expect(audio().getAttribute("src")).toBe("blob:fake"));
    fireEvent.loadedMetadata(audio());
    expect(audio().currentTime).toBe(42);
    expect(proxied()).toBe(1);
    expect(h.report).toHaveBeenCalledWith("recording_stream_failed", expect.any(String), { dialpadCallId: "a" });
  });

  it("falls back when the stream shows nothing playable in time", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await open();
    await act(async () => { await vi.advanceTimersByTimeAsync(8100); });
    await waitFor(() => expect(audio().getAttribute("src")).toBe("blob:fake"));
    expect(proxied()).toBe(1);
  });

  it("leaves a stream that has loaded alone", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await open();
    Object.defineProperty(audio(), "readyState", { value: 1, configurable: true });
    await act(async () => { await vi.advanceTimersByTimeAsync(9000); });
    expect(proxied()).toBe(0);
  });
});
