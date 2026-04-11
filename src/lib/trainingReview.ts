import { z } from "zod";

export const trainingModuleSchema = z.enum([
  "Scripts",
  "Objections",
  "Pipeline",
  "Patterns",
  "Examples",
  "Reviews",
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

export type TrainingModule = z.infer<typeof trainingModuleSchema>;
export type ReviewPacket = z.infer<typeof reviewPacketSchema>;
export type ReviewRubricItem = z.infer<typeof reviewRubricItemSchema>;

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

export function buildReviewQueueSnapshot(packets: ReviewPacket[]) {
  const uniqueStages = new Set(packets.map((packet) => packet.stage));
  const uniqueModules = new Set(packets.map((packet) => packet.linkedModule));
  const crmFields = Array.from(
    new Set(
      packets
        .flatMap((packet) => packet.crmRequirement.match(/[a-z_]+/gi) ?? [])
        .map((token) => token.toLowerCase())
        .filter((token) => token.includes("_") || ["notes", "pain", "stakeholder", "mobile", "agenda"].includes(token)),
    ),
  ).sort();

  return {
    packetCount: packets.length,
    stageCount: uniqueStages.size,
    moduleCount: uniqueModules.size,
    crmFields,
  };
}

export const reviewQueueSnapshot = buildReviewQueueSnapshot(reviewPackets);
