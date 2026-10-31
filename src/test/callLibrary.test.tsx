import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LibraryCall } from "@/hooks/useCallLibrary";

const data = vi.hoisted(() => ({ calls: [] as unknown[] }));

vi.mock("@/hooks/useCallLibrary", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useCallLibrary")>();
  return { ...actual, useCallLibrary: () => ({ data: data.calls, isLoading: false }) };
});
vi.mock("@/components/calls/ListenButton", () => ({
  ListenButton: ({ dialpadCallId }: { dialpadCallId: string }) => <button type="button" data-call={dialpadCallId}>Listen to the call</button>,
}));

import { CallLibrary } from "@/components/playbook/CallLibrary";
import { hasRecording } from "@/hooks/useCallLibrary";

function call(over: Partial<LibraryCall> & { pipelineItemId: string; businessName: string; bucket: LibraryCall["bucket"] }): LibraryCall {
  return {
    contactId: `contact-${over.pipelineItemId}`,
    contactPerson: null,
    state: null,
    industry: null,
    metAt: "2026-10-12T00:00:00.000Z",
    outcome: null,
    outcomeReason: null,
    isQualified: true,
    isFollowUp: false,
    rescheduleCount: 0,
    mrr: null,
    dealValue: null,
    setterName: "Ben",
    closerName: "Bede Alexander",
    setting: null,
    daysOut: 3,
    meetingRecordingUrl: null,
    meetingRecordingSource: null,
    ...over,
  };
}

const setting = (dialpadCallId: string | null, transcript: string | null = null): LibraryCall["setting"] => ({
  callLogId: "log",
  calledAt: "2026-10-09T00:00:00.000Z",
  dialpadCallId,
  talkSeconds: 300,
  transcript,
  summary: null,
});

// Bede, 31 Oct 2026: the library is for listening, so a slot with neither the
// booking call's audio nor a meeting recording is hidden and counted.
describe("hasRecording", () => {
  it("counts the booking call's audio or a meeting recording, not a bare transcript", () => {
    expect(hasRecording({ setting: setting("dp-1"), meetingRecordingUrl: null })).toBe(true);
    expect(hasRecording({ setting: null, meetingRecordingUrl: "https://fathom.video/share/x" })).toBe(true);
    expect(hasRecording({ setting: setting(null, "hello there"), meetingRecordingUrl: null })).toBe(false);
    expect(hasRecording({ setting: null, meetingRecordingUrl: null })).toBe(false);
  });
});

describe("CallLibrary", () => {
  const fixtures: LibraryCall[] = [
    call({ pipelineItemId: "a", businessName: "JR Dixon Electrical", bucket: "closed", setting: setting("dp-a") }),
    call({ pipelineItemId: "b", businessName: "24 Hr Test & Tag", bucket: "closed" }),
    call({ pipelineItemId: "c", businessName: "Sparkon Electrical", bucket: "no_close", setting: setting(null, "transcript only") }),
    call({ pipelineItemId: "d", businessName: "Matt's Thermal Scanning", bucket: "verbal", meetingRecordingUrl: "https://fathom.video/share/d", meetingRecordingSource: "fathom" }),
    call({ pipelineItemId: "e", businessName: "Ghost Plumbing", bucket: "no_show" }),
  ];

  it("lists only slots with something to hear and says how many it hid", () => {
    data.calls = fixtures;
    render(<CallLibrary />);
    expect(screen.getByText("JR Dixon Electrical")).toBeInTheDocument();
    expect(screen.getByText("Matt's Thermal Scanning")).toBeInTheDocument();
    expect(screen.queryByText("24 Hr Test & Tag")).toBeNull();
    expect(screen.queryByText("Sparkon Electrical")).toBeNull();
    // Showed bucket: a and d shown, b and c hidden; the no-show e is in another bucket.
    expect(screen.getByText(/2 slots · 1 with the booking call · 1 with the meeting recording · 2 slots without any recording hidden\./)).toBeInTheDocument();
    // The bucket counts only count what the list will show.
    const toggles = screen.getAllByRole("radio");
    const closed = toggles.find((t) => t.textContent?.startsWith("Closed"));
    const showed = toggles.find((t) => t.textContent?.startsWith("Showed"));
    expect(closed?.textContent).toBe("Closed1");
    expect(showed?.textContent).toBe("Showed2");
  });

  it("explains an empty bucket when everything in it was hidden", () => {
    data.calls = fixtures;
    render(<CallLibrary />);
    const noShow = screen.getAllByRole("radio").find((t) => t.textContent?.startsWith("No-show"));
    expect(noShow?.textContent).toBe("No-show0");
    fireEvent.click(noShow!);
    expect(screen.getByText("Nothing with a recording in this bucket yet. 1 slot without any recording hidden.")).toBeInTheDocument();
    expect(screen.queryByText("Ghost Plumbing")).toBeNull();
  });
});
