import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const BEDE = vi.hoisted(() => "u-bede");
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: BEDE } }) }));
vi.mock("@/hooks/useUserRole", () => ({ useAdminAccess: () => ({ isAdmin: true }) }));
vi.mock("@/hooks/useMeetings", () => ({
  useTeamMembers: () => ({
    isLoading: false,
    data: [
      { ghl_user_id: "g-bede", dialer_user_id: BEDE, name: "Bede Alexander", email: "bede@odindigital.com.au", phone: null, ghl_role: null, in_ghl: true, has_dialer_login: true, needs_dialpad: false, has_dialpad_seat: true, is_active: true },
      { ghl_user_id: "g-karla", dialer_user_id: null, name: "Karla", email: "karla@gmail.com", phone: null, ghl_role: null, in_ghl: true, has_dialer_login: false, needs_dialpad: false, has_dialpad_seat: false, is_active: true },
      { ghl_user_id: "g-jake", dialer_user_id: null, name: "Jake Dimo", email: "jake@veritasdigital.com.au", phone: null, ghl_role: null, in_ghl: true, has_dialer_login: false, needs_dialpad: false, has_dialpad_seat: false, is_active: false },
    ],
  }),
  useRepMeetingStats: () => ({ data: [{ ghl_user_id: "g-karla", rep_user_id: null, meetings_booked: 5, pending: 3, show_rate_pct: 20 }] }),
  useUpdateGhlUser: () => ({ mutate: vi.fn() }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn().mockResolvedValue({ data: [{ user_id: BEDE, email: "bede@odindigital.com.au", display_name: "Bede", last_sign_in_at: null }], error: null }),
    from: (t: string) => ({
      select: () => Promise.resolve({ data: t === "user_roles" ? [{ user_id: BEDE, role: "admin" }] : [], error: null }),
    }),
    functions: { invoke: vi.fn() },
  },
}));

import { PeopleDirectory } from "@/components/team/PeopleDirectory";

describe("Team & settings > People", () => {
  it("shows one table with access, attention notes, and former members tucked away", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <PeopleDirectory />
      </QueryClientProvider>,
    );
    const bedeRow = (await screen.findByText("Bede Alexander")).closest("tr")!;
    await waitFor(() => expect(within(bedeRow).getByText("Admin")).toBeInTheDocument());
    expect(within(bedeRow).getByText("You")).toBeInTheDocument();
    expect(within(screen.getByText("Karla").closest("tr")!).getByText("No login")).toBeInTheDocument();
    expect(screen.getByText(/3 meetings taken by Karla have no outcome recorded/)).toBeInTheDocument();
    // Former team members start collapsed.
    expect(screen.queryByText("Jake Dimo")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Former team members/ }));
    expect(screen.getByText("Jake Dimo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add login" })).toBeInTheDocument();
  });
});
