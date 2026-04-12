export type GhlPipelineType = "follow_up" | "booked";

export const GHL_PIPELINE_CONTRACT = {
  follow_up: {
    pipelineName: "Outbound Prospecting",
    pipelineId: "QuBn7UX5zebPTd4fqW9x",
    stageId: "5102204c-7b00-48f9-94fb-70ca529841b9",
    stageName: "Follow Up",
  },
  booked: {
    pipelineName: "Sales & Growth Sessions",
    pipelineId: "",
    stageId: "",
    stageName: "Booked Appointment",
  },
} as const;

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
