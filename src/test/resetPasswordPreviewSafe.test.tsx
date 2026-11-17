import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const verifyOtp = vi.fn().mockResolvedValue({ error: null });
const getSession = vi.fn().mockResolvedValue({ data: { session: null }, error: null });
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { verifyOtp: (...a: unknown[]) => verifyOtp(...a), getSession: () => getSession(), updateUser: vi.fn() } },
}));
vi.mock("@/lib/auth", () => ({
  AUTH_REQUEST_TIMEOUT_MS: 1000,
  resetLocalAuthState: vi.fn().mockResolvedValue(undefined),
  withTimeout: (p: Promise<unknown>) => p,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import ResetPasswordPage from "@/pages/ResetPasswordPage";

describe("reset link from Logins & roles", () => {
  it("does not use the one-time code until the person clicks Continue (link previews open links)", async () => {
    window.history.replaceState({}, "", "/reset-password?token_hash=abc123&type=recovery");
    render(<ResetPasswordPage />);
    const button = await screen.findByRole("button", { name: "Continue" });
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(getSession).not.toHaveBeenCalled();
    fireEvent.click(button);
    await waitFor(() => expect(verifyOtp).toHaveBeenCalledWith({ type: "recovery", token_hash: "abc123" }));
    expect(await screen.findByLabelText("New Password")).toBeInTheDocument();
  });
});
