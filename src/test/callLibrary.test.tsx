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
import { dialpadCallHasAudio, isWinningMeeting, winningSets } from "@/hooks/useCallLibrary";

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
    ...over,
  };
}

const setting = (dialpadCallId: string | null, transcript: string | null = null, hasAudio = true): LibraryCall["setting"] => ({
  callLogId: `log-${dialpadCallId}`,
  calledAt: "2026-10-09T00:00:00.000Z",
  dialpadCallId,
  hasAudio,
  talkSeconds: 300,
  transcript,
  summary: null,
});

describe("dialpadCallHasAudio", () => {
  it("reads Dialpad's row: connected, talk time or recording metadata means audio; no row means assume yes", () => {
    const row = { is_connected: false, talk_time_seconds: 0, recording_id: null, recording_url: null, recording_share_link: null };
    expect(dialpadCallHasAudio(row)).toBe(false);
    expect(dialpadCallHasAudio({ ...row, is_connected: true })).toBe(true);
    expect(dialpadCallHasAudio({ ...row, talk_time_seconds: 198 })).toBe(true);
    expect(dialpadCallHasAudio({ ...row, recording_id: "rec" })).toBe(true);
    expect(dialpadCallHasAudio(undefined)).toBe(true);
    // Not swept by the Dialpad sync yet: unknown, so it stays.
    expect(dialpadCallHasAudio({ ...row, sync_status: "pending" })).toBe(true);
    expect(dialpadCallHasAudio({ ...row, sync_status: "synced" })).toBe(false);
  });
});

// Bede, 23 Nov 2026: winning = closed, or sat and qualified without a close.
describe("isWinningMeeting", () => {
  it.each([
    ["closed", true, true], ["closed", null, true],
    ["no_close", true, true], ["verbal", true, true], ["second_meeting", true, true],
    ["no_close", false, false], ["second_meeting", false, false], ["no_close", null, false],
    ["dq", true, false], ["dq", false, false], ["no_show", true, false], ["cancelled", null, false], ["pending", null, false],
    [null, true, false],
  ] as const)("%s, qualified %s -> %s", (b, q, want) => expect(isWinningMeeting(b, q)).toBe(want));
});

describe("CallLibrary", () => {
  const fixtures: LibraryCall[] = [
    call({ pipelineItemId: "a", businessName: "JR Dixon Electrical", bucket: "closed", setting: setting("dp-a") }),
    call({ pipelineItemId: "b", businessName: "24 Hr Test & Tag", bucket: "closed" }),
    call({ pipelineItemId: "c", businessName: "Sparkon Electrical", bucket: "no_close", setting: setting("dp-c"), setterName: "Lachlan" }),
    call({ pipelineItemId: "d", businessName: "Not Qualified Pty", bucket: "no_close", isQualified: false, setting: setting("dp-d") }),
    call({ pipelineItemId: "e", businessName: "Ghost Plumbing", bucket: "no_show", setting: setting("dp-e") }),
    call({ pipelineItemId: "f", businessName: "Infuse Electrical", bucket: "closed", setting: setting("dp-dead", null, false) }),
    call({ pipelineItemId: "g", businessName: "DQ Electrical", bucket: "dq", setting: setting("dp-g") }),
    // Two meetings from one cold call: sat, then closed.
    call({ pipelineItemId: "h1", businessName: "Twice Electrical", bucket: "second_meeting", metAt: "2026-10-10T00:00:00.000Z", setting: setting("dp-h") }),
    call({ pipelineItemId: "h2", businessName: "Twice Electrical", bucket: "closed", metAt: "2026-10-14T00:00:00.000Z", setting: setting("dp-h") }),
  ];

  it("lists only winning setting calls, once each, and counts the silent ones", () => {
    data.calls = fixtures;
    render(<CallLibrary />);
    for (const name of ["JR Dixon Electrical", "Sparkon Electrical", "Twice Electrical"]) expect(screen.getAllByText(name)).toHaveLength(1);
    for (const name of ["24 Hr Test & Tag", "Not Qualified Pty", "Ghost Plumbing", "Infuse Electrical", "DQ Electrical"]) expect(screen.queryByText(name)).toBeNull();
    expect(screen.getAllByText("Listen to the call")).toHaveLength(3);
    expect(screen.getByText("3 setting calls · 2 more won with no setting call recorded.")).toBeInTheDocument();
    const labels = screen.getAllByRole("radio").map((t) => t.textContent);
    expect(labels).toEqual(expect.arrayContaining(["All winning3", "Showed and closed2", "Showed, no close1"]));
  });

  it("splits closed from showed, and follows the setter", () => {
    data.calls = fixtures;
    render(<CallLibrary />);
    const pick = (t: string) => fireEvent.click(screen.getAllByRole("radio").find((r) => r.textContent?.startsWith(t))!);
    pick("Showed, no close");
    expect(screen.getByText("Sparkon Electrical")).toBeInTheDocument();
    expect(screen.queryByText("JR Dixon Electrical")).toBeNull();
    pick("Showed and closed");
    expect(screen.getByText("Twice Electrical")).toBeInTheDocument();
    pick("Lachlan");
    expect(screen.getByText("No winning calls here yet.")).toBeInTheDocument();
  });

  it("keeps a close over a later sitting of the same call", () => {
    const { sets } = winningSets([
      call({ pipelineItemId: "x", businessName: "X", bucket: "no_close", metAt: "2026-11-01T00:00:00.000Z", setting: setting("dp-x") }),
      call({ pipelineItemId: "y", businessName: "X", bucket: "closed", metAt: "2026-10-01T00:00:00.000Z", setting: setting("dp-x") }),
    ]);
    expect(sets.map((s) => s.bucket)).toEqual(["closed"]);
  });
});
