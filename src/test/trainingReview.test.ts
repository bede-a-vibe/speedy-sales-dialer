import { describe, expect, it } from "vitest";

import { buildManagerCoachingTasks, buildReviewSubmissionDraft, reviewPackets } from "@/lib/trainingReview";

describe("buildManagerCoachingTasks", () => {
  it("adds trigger, next coaching action, and CRM checks to manager summaries", () => {
    const submission = buildReviewSubmissionDraft({
      id: "review-bad-time-recovery-test",
      packet: reviewPackets[0],
      repName: "Sam",
      reviewedAt: "2026-04-13T08:00:00+10:00",
      rubricScores: [
        {
          category: "Opener and permission",
          score: 3,
          evidence: "Opener kept the prospect on the line briefly.",
          coachingNote: "Tighten the first 10 seconds.",
        },
        {
          category: "Discovery and pain capture",
          score: 2,
          evidence: "Rep kept probing despite the timing objection.",
          coachingNote: "Capture the callback instead of forcing discovery.",
        },
        {
          category: "Objection handling",
          score: 2,
          evidence: "Rep did not secure a callback window.",
          coachingNote: "Use the busy objection to lock timing.",
        },
        {
          category: "Close and CRM handoff",
          score: 3,
          evidence: "Notes missed the best callback time.",
          coachingNote: "Save best_time_to_call before ending the call.",
        },
      ],
    });

    const [task] = buildManagerCoachingTasks([submission], reviewPackets);

    expect(task.summary).toContain("Sam needs manager follow-up on Opener and permission, Discovery and pain capture, Objection handling, Close and CRM handoff.");
    expect(task.summary).toContain("Watch for: Prospect says they are busy and the rep keeps pushing instead of securing a cleaner callback window.");
    expect(task.summary).toContain("Coach next: Tighten the first 10 seconds.");
    expect(task.summary).toContain("CRM check: best_time_to_call.");
  });

  it("keeps reinforcement-ready summaries actionable without coaching gaps", () => {
    const submission = buildReviewSubmissionDraft({
      id: "review-booked-handoff-quality-test",
      packet: reviewPackets[2],
      repName: "Jess",
      reviewedAt: "2026-04-13T09:00:00+10:00",
      rubricScores: [
        {
          category: "Opener and permission",
          score: 5,
          evidence: "Rep earned time quickly.",
          coachingNote: "Reuse this opener as a model.",
        },
        {
          category: "Discovery and pain capture",
          score: 5,
          evidence: "Pain and urgency were both clear.",
          coachingNote: "Keep anchoring on business impact.",
        },
        {
          category: "Objection handling",
          score: 5,
          evidence: "Minor hesitation handled calmly.",
          coachingNote: "Keep objection responses concise.",
        },
        {
          category: "Close and CRM handoff",
          score: 5,
          evidence: "Agenda, attendee, and mobile were all confirmed.",
          coachingNote: "Use this as a handoff example.",
        },
      ],
    });

    const [task] = buildManagerCoachingTasks([submission], reviewPackets);

    expect(task.summary).toContain("Jess produced a reinforcement-ready call review.");
    expect(task.summary).toContain("Watch for: Meeting gets booked but the closer would still need to replay the call to understand the opportunity.");
    expect(task.summary).not.toContain("Coach next:");
    expect(task.summary).toContain("CRM check: pain, stakeholder.");
  });
});
