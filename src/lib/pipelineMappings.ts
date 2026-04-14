import type { CallOutcome } from "@/data/constants";
import type { FollowUpMethod, PipelineType } from "@/hooks/usePipelineItems";
import type { AppointmentOutcomeValue } from "@/lib/appointments";
export {
  GHL_PIPELINE_CONTRACT,
  GHL_PIPELINE_DEFAULTS,
  resolveGhlOpportunityTarget,
} from "@/shared/ghlPipelineContract";

export type ContactLifecycleStatus =
  | "uncalled"
  | "called"
  | "follow_up"
  | "booked"
  | "dnc";

export const DEFAULT_MANUAL_FOLLOW_UP_DELAY_DAYS = 2;


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

const CALL_OUTCOME_MAP: Record<CallOutcome, {
  contactStatus: ContactLifecycleStatus;
  pipelineType: PipelineType | null;
  ghlLabel: string;
}> = {
  no_answer: {
    contactStatus: "uncalled",
    pipelineType: null,
    ghlLabel: CALL_OUTCOME_LABELS.no_answer,
  },
  voicemail: {
    contactStatus: "uncalled",
    pipelineType: null,
    ghlLabel: CALL_OUTCOME_LABELS.voicemail,
  },
  not_interested: {
    contactStatus: "called",
    pipelineType: null,
    ghlLabel: CALL_OUTCOME_LABELS.not_interested,
  },
  dnc: {
    contactStatus: "dnc",
    pipelineType: null,
    ghlLabel: CALL_OUTCOME_LABELS.dnc,
  },
  follow_up: {
    contactStatus: "follow_up",
    pipelineType: "follow_up",
    ghlLabel: CALL_OUTCOME_LABELS.follow_up,
  },
  booked: {
    contactStatus: "booked",
    pipelineType: "booked",
    ghlLabel: CALL_OUTCOME_LABELS.booked,
  },
};

const APPOINTMENT_OUTCOME_TO_GHL_SYNC: Record<AppointmentOutcomeValue, {
  callOutcome: CallOutcome;
  createsFollowUpTask: boolean;
}> = {
  no_show: {
    callOutcome: "follow_up",
    createsFollowUpTask: true,
  },
  rescheduled: {
    callOutcome: "follow_up",
    createsFollowUpTask: false,
  },
  showed_verbal_commitment: {
    callOutcome: "booked",
    createsFollowUpTask: true,
  },
  showed_closed: {
    callOutcome: "booked",
    createsFollowUpTask: false,
  },
  showed_no_close: {
    callOutcome: "not_interested",
    createsFollowUpTask: true,
  },
};

export function getContactStatusForPipelineType(type: PipelineType): ContactLifecycleStatus {
  return PIPELINE_TYPE_TO_CONTACT_STATUS[type];
}

export function getCallOutcomeMapping(outcome: CallOutcome) {
  return CALL_OUTCOME_MAP[outcome];
}

export function getContactStatusForOutcome(outcome: CallOutcome): ContactLifecycleStatus {
  return getCallOutcomeMapping(outcome).contactStatus;
}

export function getPipelineTypeForOutcome(outcome: CallOutcome): PipelineType | null {
  return getCallOutcomeMapping(outcome).pipelineType;
}

export function shouldCreatePipelineItemForOutcome(outcome: CallOutcome): boolean {
  return getPipelineTypeForOutcome(outcome) !== null;
}

export function getAppointmentOutcomeGhlSync(outcome: AppointmentOutcomeValue) {
  return APPOINTMENT_OUTCOME_TO_GHL_SYNC[outcome];
}

export function shouldCreatePipelineItemForStatus(status: ContactLifecycleStatus): status is PipelineType {
  return status === "follow_up" || status === "booked";
}

export function getDefaultManualFollowUpScheduledFor(base = new Date(), delayDays = DEFAULT_MANUAL_FOLLOW_UP_DELAY_DAYS) {
  const scheduled = new Date(base);
  scheduled.setDate(scheduled.getDate() + delayDays);
  return scheduled;
}

export function getFollowUpTaskTitle(method?: FollowUpMethod) {
  return `Follow up (${method ?? "call"})`;
}
