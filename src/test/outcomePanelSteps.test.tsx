import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/integrations/supabase/client", () => {
  const chain: Record<string, unknown> = {};
  for (const m of ["update", "eq", "select"]) chain[m] = () => chain;
  (chain as { then: unknown }).then = (r: (v: unknown) => void) => r({ error: null });
  return { supabase: { from: () => chain } };
});
vi.mock("@/components/contacts/LeadBuckets", () => ({ LeadBuckets: () => null }));
vi.mock("@/components/ghl/GhlMirrorDetails", () => ({ GhlMirrorDetails: () => null }));
vi.mock("@/components/pipelines/OpportunityDetailsSection", () => ({ OpportunityDetailsSection: () => null }));
vi.mock("@/components/pipelines/MeetingRecordingMatches", () => ({ MeetingRecordingMatches: () => null }));
vi.mock("@/components/fathom/FathomConnect", () => ({ FathomMatch: () => null }));

import { BookedOutcomePanel } from "@/components/pipelines/BookedOutcomePanel";

const item = {
  id: "p1", contact_id: "c1", assigned_user_id: "u1", scheduled_for: "2026-11-20T03:00:00Z",
  outcome_reason: null, outcome_notes: "", recording_url: null, phone_recording_url: null, deal_value: null,
  contacts: { business_name: "NESCO", ghl_contact_id: null },
} as never;

function setup() {
  const onRecordOutcome = vi.fn().mockResolvedValue(undefined);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <BookedOutcomePanel item={item} reps={[]} isSaving={false} onRecordOutcome={onRecordOutcome} />
    </QueryClientProvider>,
  );
  return onRecordOutcome;
}

describe("outcome buttons ask for the reason inline", () => {
  it("has no separate reason box", () => {
    setup();
    expect(screen.queryByText(/Reason \(required/)).toBeNull();
  });

  it("Phone call only logs a reschedule with the phone reason", () => {
    const onRecordOutcome = setup();
    fireEvent.click(screen.getByRole("button", { name: /Phone call only/ }));
    const save = screen.getByRole("button", { name: "Save" });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Not at a laptop" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onRecordOutcome).toHaveBeenCalledTimes(1);
    const [, outcome, , scheduledFor, , , , , extras] = onRecordOutcome.mock.calls[0];
    expect(outcome).toBe("rescheduled");
    expect(scheduledFor).toBeTruthy();
    expect(extras.reason).toBe("rs_phone_no_laptop");
  });

  it("No Show shows its own reasons under the button", () => {
    const onRecordOutcome = setup();
    fireEvent.click(screen.getByRole("button", { name: "No Show" }));
    fireEvent.click(screen.getByRole("button", { name: "Ghosted / no reply" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onRecordOutcome.mock.calls[0][1]).toBe("no_show");
    expect(onRecordOutcome.mock.calls[0][8].reason).toBe("ns_ghosted");
  });

  it("shows the meeting format switch", () => {
    setup();
    expect(screen.getByRole("group", { name: "Meeting format" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "In person" })).toBeTruthy();
  });
});
