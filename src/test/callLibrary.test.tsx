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
import { dialpadCallHasAudio, hasRecording } from "@/hooks/useCallLibrary";

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

const setting = (dialpadCallId: string | null, transcript: string | null = null, hasAudio = true): LibraryCall["setting"] => ({
  callLogId: "log",
  calledAt: "2026-10-09T00:00:00.000Z",
  dialpadCallId,
  hasAudio,
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
    // A linked Dialpad call that never connected has nothing to play.
    expect(hasRecording({ setting: setting("dp-dead", null, false), meetingRecordingUrl: null })).toBe(false);
  });

  it("reads Dialpad's row: connected, talk time or recording metadata means audio; no row means assume yes", () => {
    const row = { is_connected: false, talk_time_seconds: 0, recording_id: null, recording_url: null, recording_share_link: null };
    expect(dialpadCallHasAudio(row)).toBe(false);
    expect(dialpadCallHasAudio({ ...row, is_connected: true })).toBe(true);
    expect(dialpadCallHasAudio({ ...row, talk_time_seconds: 198 })).toBe(true);
    expect(dialpadCallHasAudio({ ...row, recording_id: "rec" })).toBe(true);
    expect(dialpadCallHasAudio(undefined)).toBe(true);
  });
});

describe("CallLibrary", () => {
  const fixtures: LibraryCall[] = [
    call({ pipelineItemId: "a", businessName: "JR Dixon Electrical", bucket: "closed", setting: setting("dp-a") }),
    call({ pipelineItemId: "b", businessName: "24 Hr Test & Tag", bucket: "closed" }),
    call({ pipelineItemId: "c", businessName: "Sparkon Electrical", bucket: "no_close", setting: setting(null, "transcript only") }),
    call({ pipelineItemId: "d", businessName: "Matt's Thermal Scanning", bucket: "verbal", meetingRecordingUrl: "https://fathom.video/share/d", meetingRecordingSource: "fathom" }),
    call({ pipelineItemId: "e", businessName: "Ghost Plumbing", bucket: "no_show" }),
    // Linked to a two-second failed dial: a Listen button here would only error.
    call({ pipelineItemId: "f", businessName: "Infuse Electrical", bucket: "closed", setting: setting("dp-dead", null, false) }),
  ];

  it("lists only slots with something to hear and says how many it hid", () => {
    data.calls = fixtures;
    render(<CallLibrary />);
    expect(screen.getByText("JR Dixon Electrical")).toBeInTheDocument();
    expect(screen.getByText("Matt's Thermal Scanning")).toBeInTheDocument();
    expect(screen.queryByText("24 Hr Test & Tag")).toBeNull();
    expect(screen.queryByText("Sparkon Electrical")).toBeNull();
    expect(screen.queryByText("Infuse Electrical")).toBeNull();
    expect(screen.getAllByText("Listen to the call")).toHaveLength(1);
    // Showed bucket: a and d shown, b, c and f hidden; the no-show e is in another bucket.
    expect(screen.getByText(/2 slots · 1 with the booking call · 1 with the meeting recording · 3 slots without any recording hidden\./)).toBeInTheDocument();
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
