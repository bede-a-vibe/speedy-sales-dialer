export type GhlPipelineType = "follow_up" | "booked";

export type CallOutcomeForStage =
  | "no_answer"
  | "voicemail"
  | "not_interested"
  | "dnc"
  | "follow_up"
  | "booked"
  | "wrong_number";

export const GHL_PIPELINE_CONTRACT = {
  follow_up: {
    pipelineName: "Outbound Prospecting",
    pipelineId: "QuBn7UX5zebPTd4fqW9x",
    stageId: "5102204c-7b00-48f9-94fb-70ca529841b9",
    stageName: "Follow Up",
  },
  booked: {
    pipelineName: "Sales & Growth Sessions",
    // Empty by design: resolved at runtime from the live GHL pipelines API
    // by name match (see findDefaultBookedPipeline / cacheBookedPipelineIds).
    pipelineId: "",
    stageId: "",
    stageName: "Booked Appointment",
  },
} as const;

// Runtime-discovered booked pipeline IDs cached after the first successful
// name lookup so subsequent renders don't have to re-resolve.
let _bookedPipelineCache: { pipelineId: string; stageId: string } | null = null;

export function cacheBookedPipelineIds(pipelineId: string, stageId: string) {
  if (!pipelineId || !stageId) return;
  _bookedPipelineCache = { pipelineId, stageId };
}

export function getBookedPipelineFallback(): { pipelineId: string; stageId: string } | null {
  return _bookedPipelineCache;
}

/** All stages in the Outbound Prospecting pipeline */
export const OUTBOUND_PROSPECTING_STAGES = {
  new_leads: "new_leads_stage_id", // placeholder — not used in outcome mapping
  attempted_no_answer: "b1003ce2-48c6-4ed7-b894-56b2cf6c2313",
  connected_follow_up: "5102204c-7b00-48f9-94fb-70ca529841b9",
  connected_nurture: "connected_nurture_stage_id", // placeholder
  meeting_booked: "d7283fa5-7352-4446-80c6-1e567a7c8295",
  not_interested: "01ce436d-4f12-47c8-b178-0333c75be361",
  disqualified: "cfc8cc1a-66a3-48cc-88cd-975ffcf4e851",
  bad_number_dead: "79836d51-2ae7-4705-b2d9-4a9e2e461ab6",
} as const;

export const OUTBOUND_PIPELINE_ID = GHL_PIPELINE_CONTRACT.follow_up.pipelineId;

/** Maps each call outcome to the appropriate Outbound Prospecting stage */
export const CALL_OUTCOME_TO_STAGE: Record<CallOutcomeForStage, string> = {
  no_answer: OUTBOUND_PROSPECTING_STAGES.attempted_no_answer,
  voicemail: OUTBOUND_PROSPECTING_STAGES.attempted_no_answer,
  follow_up: OUTBOUND_PROSPECTING_STAGES.connected_follow_up,
  booked: OUTBOUND_PROSPECTING_STAGES.meeting_booked,
  not_interested: OUTBOUND_PROSPECTING_STAGES.not_interested,
  dnc: OUTBOUND_PROSPECTING_STAGES.disqualified,
  wrong_number: OUTBOUND_PROSPECTING_STAGES.bad_number_dead,
};

export const GHL_PIPELINE_DEFAULTS = {
  follow_up: {
    pipelineId: GHL_PIPELINE_CONTRACT.follow_up.pipelineId,
    stageId: GHL_PIPELINE_CONTRACT.follow_up.stageId,
  },
} as const;

export function resolveGhlOpportunityTarget(params: {
  pipelineType: GhlPipelineType;
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
