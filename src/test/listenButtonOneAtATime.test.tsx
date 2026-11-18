import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: vi.fn(async (_fn: string, opts: { body: { action: string } }) =>
        opts.body.action === "get_call_recording"
          ? { data: { access_link: "https://dialpad.com/r/x" }, error: null }
          : { data: new Blob(["x"]), error: null },
      ),
    },
    auth: { getSession: async () => ({ data: { session: null } }) },
  },
}));

import { ListenButton } from "@/components/calls/ListenButton";

describe("ListenButton", () => {
  it("plays one recording at a time", async () => {
    (URL as unknown as { createObjectURL: () => string }).createObjectURL = () => "blob:fake";
    (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => undefined;
    render(
      <div>
        <ListenButton dialpadCallId="a" autoPlay={false} />
        <ListenButton dialpadCallId="b" autoPlay={false} />
      </div>,
    );
    for (const b of screen.getAllByRole("button", { name: /Listen to the call/ })) fireEvent.click(b);
    await waitFor(() => expect(document.querySelectorAll("audio")).toHaveLength(2));
    const [first, second] = [...document.querySelectorAll("audio")];
    Object.defineProperty(first, "paused", { value: false, configurable: true });
    const pause = vi.fn();
    first.pause = pause;
    fireEvent.play(second);
    expect(pause).toHaveBeenCalled();
  });
});
