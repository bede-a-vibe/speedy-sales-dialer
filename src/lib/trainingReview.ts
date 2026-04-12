import { z } from "zod";

export const trainingModuleSchema = z.enum([
  "Scripts",
  "Objections",
  "Pipeline",
  "Patterns",
  "Examples",
  "Reviews",
  "Packets",
  "Playbook",
]);

export const reviewPacketSchema = z.object({
  id: z.string().min(1),
  stage: z.string().min(1),
  trigger: z.string().min(1),
  managerPrompt: z.string().min(1),
  repAction: z.string().min(1),
  crmRequirement: z.string().min(1),
  linkedModule: trainingModuleSchema,
});

export const reviewRubricItemSchema = z.object({
  category: z.string().min(1),
  weight: z.string().min(1),
  strong: z.string().min(1),
  weak: z.string().min(1),
  transcriptLookFors: z.array(z.string().min(1)).min(1),
});

export const reviewScoreSchema = z.object({
  category: z.string().min(1),
  score: z.number().int().min(1).max(5),
  evidence: z.string().min(1),
  coachingNote: z.string().min(1),
});

export const reviewSubmissionSchema = z.object({
  id: z.string().min(1),
  packetId: z.string().min(1),
  repName: z.string().min(1),
  reviewedAt: z.string().min(1),
  overallScore: z.number().min(0).max(100),
  outcome: z.enum(["Needs intervention", "Coach next shift", "Ready to reinforce"]),
  requiredCrmFields: z.array(z.string().min(1)).min(1),
  coachingActions: z.array(z.string().min(1)).min(1),
  rubricScores: reviewScoreSchema.array().min(1),
});

export const managerCoachingTaskSchema = z.object({
  id: z.string().min(1),
  reviewSubmissionId: z.string().min(1),
  packetId: z.string().min(1),
  repName: z.string().min(1),
  priority: z.enum(["High", "Medium", "Low"]),
  workflowStatus: z.enum(["Escalate today", "Coach next shift", "Reinforce this week"]),
  dueLabel: z.string().min(1),
  summary: z.string().min(1),
  ownerRole: z.enum(["Manager", "Team lead"]),
  coachingFocus: z.array(z.string().min(1)).min(1),
  requiredCrmFields: z.array(z.string().min(1)).min(1),
  linkedModule: trainingModuleSchema,
});

export type TrainingModule = z.infer<typeof trainingModuleSchema>;
export type ReviewPacket = z.infer<typeof reviewPacketSchema>;
export type ReviewRubricItem = z.infer<typeof reviewRubricItemSchema>;
export type ReviewScore = z.infer<typeof reviewScoreSchema>;
export type ReviewSubmission = z.infer<typeof reviewSubmissionSchema>;
export type ManagerCoachingTask = z.infer<typeof managerCoachingTaskSchema>;

export const callReviewRubric: ReviewRubricItem[] = reviewRubricItemSchema.array().parse([
  {
    category: "Opener and permission",
    weight: "25%",
    strong: "Rep earns 20 to 30 seconds quickly with a relevant reason for calling and low-friction permission language.",
    weak: "Rep leads with identity checks, long setup, or a generic company pitch that causes an immediate brush-off.",
    transcriptLookFors: ["Prospect stays engaged past the first exchange", "Rep states a specific reason for calling", "No rambling intro before value is clear"],
  },
  {
    category: "Discovery and pain capture",
    weight: "30%",
    strong: "Rep uncovers one practical business problem, a current gap, or pressure point the next caller can act on.",
    weak: "Conversation stays polite but vague, with no concrete pain, no urgency, and no useful context for follow-up.",
    transcriptLookFors: ["At least one measurable pain or friction point", "Owner or stakeholder context is captured", "Rep asks follow-up questions instead of jumping to pitch"],
  },
  {
    category: "Objection handling",
    weight: "20%",
    strong: "Rep treats objections as context, responds briefly, and turns the call back toward diagnosis or next-step commitment.",
    weak: "Rep argues, overexplains, or accepts the objection without learning what sits behind it.",
    transcriptLookFors: ["Rep labels the objection cleanly", "Response is concise and curious", "Conversation progresses instead of stalling out"],
  },
  {
    category: "Close and CRM handoff",
    weight: "25%",
    strong: "Rep confirms the next action, timing, contact path, and note quality so the transcript can become usable follow-up intelligence.",
    weak: "Rep ends the call with vague interest, missing contact data, or notes another rep cannot confidently use.",
    transcriptLookFors: ["Clear next step or booked action", "Best number or callback window confirmed", "Notes can be written from the call without replaying it"],
  },
]);

export const reviewPackets: ReviewPacket[] = reviewPacketSchema.array().parse([
  {
    id: "bad-time-recovery",
    stage: "Active transcript review",
    trigger: "Prospect says they are busy and the rep keeps pushing instead of securing a cleaner callback window.",
    managerPrompt: "Score the rep low on close and handoff unless the next attempt timing is clearly captured.",
    repAction: "End with a specific callback window, save it, and note that timing, not interest, blocked discovery.",
    crmRequirement: "best_time_to_call plus a note that the prospect was unavailable rather than uninterested.",
    linkedModule: "Patterns",
  },
  {
    id: "send-info-diagnosis",
    stage: "Answered call with weak discovery",
    trigger: "Prospect asks for information and the call risks ending with no usable business context.",
    managerPrompt: "Check whether the rep earned one real problem before accepting the email request.",
    repAction: "Ask one routing question that reveals whether lead flow, quote conversion, or follow-up speed matters most.",
    crmRequirement: "A concrete pain point saved into notes so follow-up email generation is not generic.",
    linkedModule: "Objections",
  },
  {
    id: "booked-handoff-quality",
    stage: "Booked outcome QA",
    trigger: "Meeting gets booked but the closer would still need to replay the call to understand the opportunity.",
    managerPrompt: "Do not score a booking as strong unless owner, agenda, and best contact path are visible from notes alone.",
    repAction: "Restate the agreed agenda, confirm who is attending, and verify the best mobile before ending the call.",
    crmRequirement: "Booked note includes pain, stakeholder, and confirmed contact path for the appointment reminder.",
    linkedModule: "Reviews",
  },
]);

const WEIGHT_TO_RATIO: Record<string, number> = {
  "25%": 0.25,
  "30%": 0.3,
  "20%": 0.2,
};

function extractCrmFields(requirement: string) {
  return Array.from(
    new Set(
      (requirement.match(/[a-z_]+/gi) ?? [])
        .map((token) => token.toLowerCase())
        .filter((token) => token.includes("_") || ["notes", "pain", "stakeholder", "mobile", "agenda"].includes(token)),
    ),
  ).sort();
}

function getReviewOutcome(score: number) {
  if (score < 65) return "Needs intervention" as const;
  if (score < 85) return "Coach next shift" as const;
  return "Ready to reinforce" as const;
}

function getManagerTaskPriority(outcome: ReviewSubmission["outcome"]) {
  if (outcome === "Needs intervention") return "High" as const;
  if (outcome === "Coach next shift") return "Medium" as const;
  return "Low" as const;
}

function getManagerWorkflowStatus(outcome: ReviewSubmission["outcome"]) {
  if (outcome === "Needs intervention") return "Escalate today" as const;
  if (outcome === "Coach next shift") return "Coach next shift" as const;
  return "Reinforce this week" as const;
}

function getManagerTaskOwner(outcome: ReviewSubmission["outcome"]) {
  return outcome === "Needs intervention" ? "Manager" as const : "Team lead" as const;
}

function getManagerTaskDueLabel(outcome: ReviewSubmission["outcome"]) {
  if (outcome === "Needs intervention") return "Before next dial block";
  if (outcome === "Coach next shift") return "Next shift kickoff";
  return "Weekly coaching wrap-up";
}

export function buildReviewSubmissionDraft(args: {
  id: string;
  packet: ReviewPacket;
  repName: string;
  reviewedAt: string;
  rubricScores: Array<Pick<ReviewScore, "category" | "score" | "evidence" | "coachingNote">>;
}) {
  const weightedScore = args.rubricScores.reduce((total, score) => {
    const rubricItem = callReviewRubric.find((item) => item.category === score.category);
    const ratio = rubricItem ? (WEIGHT_TO_RATIO[rubricItem.weight] ?? 0) : 0;
    return total + ((score.score / 5) * ratio * 100);
  }, 0);

  const submission = {
    id: args.id,
    packetId: args.packet.id,
    repName: args.repName,
    reviewedAt: args.reviewedAt,
    overallScore: Math.round(weightedScore),
    outcome: getReviewOutcome(weightedScore),
    requiredCrmFields: extractCrmFields(args.packet.crmRequirement),
    coachingActions: args.rubricScores.filter((score) => score.score <= 3).map((score) => score.coachingNote),
    rubricScores: args.rubricScores,
  };

  return reviewSubmissionSchema.parse(submission);
}

export const reviewSubmissionDrafts: ReviewSubmission[] = [
  buildReviewSubmissionDraft({
    id: "review-bad-time-recovery-sam",
    packet: reviewPackets[0],
    repName: "Sam",
    reviewedAt: "2026-04-11T14:10:00+10:00",
    rubricScores: [
      {
        category: "Opener and permission",
        score: 3,
        evidence: "Prospect stayed on briefly, but the opener still ran long before the reason for calling was clear.",
        coachingNote: "Tighten the first 10 seconds so the rep earns permission before context spills out.",
      },
      {
        category: "Discovery and pain capture",
        score: 2,
        evidence: "Rep tried to force a discovery question after the prospect had already said it was a bad time.",
        coachingNote: "When timing is the blocker, coach for callback capture instead of squeezing in rushed discovery.",
      },
      {
        category: "Objection handling",
        score: 2,
        evidence: "Busy objection was acknowledged but not converted into a concrete callback window.",
        coachingNote: "Use the objection to secure the next attempt timing, not to keep pitching.",
      },
      {
        category: "Close and CRM handoff",
        score: 3,
        evidence: "Notes mention the contact was busy, but the best time to call back was not saved.",
        coachingNote: "Require best_time_to_call in notes before the call can count as a good recovery.",
      },
    ],
  }),
  buildReviewSubmissionDraft({
    id: "review-booked-handoff-quality-jess",
    packet: reviewPackets[2],
    repName: "Jess",
    reviewedAt: "2026-04-11T16:45:00+10:00",
    rubricScores: [
      {
        category: "Opener and permission",
        score: 4,
        evidence: "Rep earned time quickly and set context without sounding scripted.",
        coachingNote: "Keep the opener tight and reuse this structure as a baseline example.",
      },
      {
        category: "Discovery and pain capture",
        score: 4,
        evidence: "Rep surfaced missed-call follow-up and slow quote turnaround clearly.",
        coachingNote: "Push one step further on urgency so the closer sees why this matters now.",
      },
      {
        category: "Objection handling",
        score: 4,
        evidence: "Questions stayed calm and the rep handled minor hesitation without losing control.",
        coachingNote: "Reinforce concise objection handling because it kept the conversation moving.",
      },
      {
        category: "Close and CRM handoff",
        score: 5,
        evidence: "Agenda, attendee, and best mobile were all confirmed before the call ended.",
        coachingNote: "Use this call as a handoff-quality example for newer reps.",
      },
    ],
  }),
];

export function buildReviewQueueSnapshot(packets: ReviewPacket[]) {
  const uniqueStages = new Set(packets.map((packet) => packet.stage));
  const uniqueModules = new Set(packets.map((packet) => packet.linkedModule));
  const crmFields = Array.from(new Set(packets.flatMap((packet) => extractCrmFields(packet.crmRequirement)))).sort();

  return {
    packetCount: packets.length,
    stageCount: uniqueStages.size,
    moduleCount: uniqueModules.size,
    crmFields,
  };
}

export function buildManagerCoachingTasks(submissions: ReviewSubmission[], packets: ReviewPacket[]) {
  return managerCoachingTaskSchema.array().parse(
    submissions.map((submission) => {
      const packet = packets.find((candidate) => candidate.id === submission.packetId);
      const coachingFocus = submission.rubricScores
        .filter((score) => score.score <= 3)
        .map((score) => score.category);

      return {
        id: `manager-task-${submission.id}`,
        reviewSubmissionId: submission.id,
        packetId: submission.packetId,
        repName: submission.repName,
        priority: getManagerTaskPriority(submission.outcome),
        workflowStatus: getManagerWorkflowStatus(submission.outcome),
        dueLabel: getManagerTaskDueLabel(submission.outcome),
        summary: coachingFocus.length
          ? `${submission.repName} needs manager follow-up on ${coachingFocus.join(", ")}.`
          : `${submission.repName} produced a reinforcement-ready call review.`,
        ownerRole: getManagerTaskOwner(submission.outcome),
        coachingFocus: coachingFocus.length ? coachingFocus : ["Share winning call in team coaching"],
        requiredCrmFields: submission.requiredCrmFields,
        linkedModule: packet?.linkedModule ?? "Reviews",
      };
    }),
  );
}

export function buildReviewDraftSnapshot(submissions: ReviewSubmission[]) {
  const outcomes = submissions.reduce<Record<ReviewSubmission["outcome"], number>>((acc, submission) => {
    acc[submission.outcome] += 1;
    return acc;
  }, {
    "Needs intervention": 0,
    "Coach next shift": 0,
    "Ready to reinforce": 0,
  });

  return {
    draftCount: submissions.length,
    averageScore: submissions.length ? Math.round(submissions.reduce((sum, item) => sum + item.overallScore, 0) / submissions.length) : 0,
    outcomes,
  };
}

export function buildManagerTaskSnapshot(tasks: ManagerCoachingTask[]) {
  const priorities = tasks.reduce<Record<ManagerCoachingTask["priority"], number>>((acc, task) => {
    acc[task.priority] += 1;
    return acc;
  }, {
    High: 0,
    Medium: 0,
    Low: 0,
  });

  const ownerRoles = Array.from(new Set(tasks.map((task) => task.ownerRole))).sort();

  return {
    taskCount: tasks.length,
    priorities,
    ownerRoles,
  };
}

export const reviewQueueSnapshot = buildReviewQueueSnapshot(reviewPackets);
export const reviewDraftSnapshot = buildReviewDraftSnapshot(reviewSubmissionDrafts);
export const managerCoachingTasks = buildManagerCoachingTasks(reviewSubmissionDrafts, reviewPackets);
export const managerTaskSnapshot = buildManagerTaskSnapshot(managerCoachingTasks);
