import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { AddLoginDialog, LoginLinkDialog, type LoginLinkResult } from "@/components/team/LoginLinks";
import { useState } from "react";

function Harness() {
  const [result, setResult] = useState<LoginLinkResult | null>(null);
  return (
    <QueryClientProvider client={new QueryClient()}>
      <AddLoginDialog open={!result} onOpenChange={() => {}} onCreated={setResult} />
      <LoginLinkDialog result={result} onClose={() => setResult(null)} />
    </QueryClientProvider>
  );
}

describe("login links", () => {
  beforeEach(() => invoke.mockReset());

  it("creates a login with no password and shows the one-time link to copy", async () => {
    invoke.mockResolvedValue({ data: { email: "lucas@odindigital.com.au", link: "https://x.supabase.co/auth/v1/verify?token=abc&type=recovery" }, error: null });
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "lucas@odindigital.com.au" } });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Lucas Durante" } });
    fireEvent.click(screen.getByRole("button", { name: /Create and get link/ }));
    await waitFor(() => expect(screen.getByText("Login created")).toBeInTheDocument());
    expect(invoke).toHaveBeenCalledWith("admin-login-links", {
      body: { action: "create_login", email: "lucas@odindigital.com.au", display_name: "Lucas Durante", role: "sales_rep", origin: window.location.origin },
    });
    expect(screen.getByLabelText("Login link")).toHaveValue("https://x.supabase.co/auth/v1/verify?token=abc&type=recovery");
    // No password field anywhere: they set it themselves.
    expect(document.querySelector('input[type="password"]')).toBeNull();
  });
});
