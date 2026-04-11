import type { CallOutcome } from "@/data/constants";
import type { FollowUpMethod, PipelineType } from "@/hooks/usePipelineItems";

export type ContactLifecycleStatus =
  | "uncalled"
  | "called"
  | "follow_up"
  | "booked"
  | "closed"
  | "not_interested"
  | "dnc";

export const DEFAULT_MANUAL_FOLLOW_UP_DELAY_DAYS = 2;

export const GHL_PIPELINE_DEFAULTS = {
  follow_up: {
    pipelineId: "QuBn7UX5zebPTd4fqW9x",
    stageId: "5102204c-7b00-48f9-94fb-70ca529841b9",
  },
} as const;

export const CALL_OUTCOME_LABELS: Record<CallOutcome | "wrong_number", string> = {
  no_answer: "No Answer",
  voicemail: "Voicemail",
  not_interested: "Not Interested",
  dnc: "DNC",
  follow_up: "Follow Up",
  booked: "Booked",
  wrong_number: "Wrong Number",
};

const PIPELINE_TYPE_TO_CONTACT_STATUS: Record<PipelineType, ContactLifecycleStatus> = {
  follow_up: "follow_up",
  booked: "booked",
};

const CALL_OUTCOME_TO_CONTACT_STATUS: Partial<Record<CallOutcome, ContactLifecycleStatus>> = {
  dnc: "dnc",
  follow_up: "follow_up",
  booked: "booked",
  not_interested: "not_interested",
  no_answer: "uncalled",
  voicemail: "uncalled",
};

const CALL_OUTCOME_TO_PIPELINE_TYPE: Partial<Record<CallOutcome, PipelineType>> = {
  follow_up: "follow_up",
  booked: "booked",
};

export function getContactStatusForPipelineType(type: PipelineType): ContactLifecycleStatus {
  return PIPELINE_TYPE_TO_CONTACT_STATUS[type];
}

export function getContactStatusForOutcome(outcome: CallOutcome): ContactLifecycleStatus {
  return CALL_OUTCOME_TO_CONTACT_STATUS[outcome] ?? "called";
}

export function getPipelineTypeForOutcome(outcome: CallOutcome): PipelineType | null {
  return CALL_OUTCOME_TO_PIPELINE_TYPE[outcome] ?? null;
}

export function shouldCreatePipelineItemForOutcome(outcome: CallOutcome): boolean {
  return getPipelineTypeForOutcome(outcome) !== null;
}

export function shouldCreatePipelineItemForStatus(status: ContactLifecycleStatus): status is PipelineType {
  return status === "follow_up" || status === "booked";
}

export function getDefaultManualFollowUpScheduledFor(base = new Date(), delayDays = DEFAULT_MANUAL_FOLLOW_UP_DELAY_DAYS) {
  const scheduled = new Date(base);
  scheduled.setDate(scheduled.getDate() + delayDays);
  return scheduled;
}

export function resolveGhlOpportunityTarget(params: {
  pipelineType: PipelineType;
  pipelineId?: string | null;
  pipelineStageId?: string | null;
}): { pipelineId?: string; pipelineStageId?: string } {
  if (params.pipelineType === "follow_up") {
    return {
      pipelineId: params.pipelineId || GHL_PIPELINE_DEFAULTS.follow_up.pipelineId,
      pipelineStageId: params.pipelineStageId || GHL_PIPELINE_DEFAULTS.follow_up.stageId,
    };
  }

  return {
    pipelineId: params.pipelineId || undefined,
    pipelineStageId: params.pipelineStageId || undefined,
  };
}

export function getFollowUpTaskTitle(method?: FollowUpMethod) {
  return `Follow up (${method ?? "call"})`;
}
