export function extractGhlOpportunityId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;

  const record = payload as Record<string, unknown>;
  const directId = record.id;
  if (typeof directId === "string" && directId.trim()) return directId;

  const opportunity = record.opportunity;
  if (opportunity && typeof opportunity === "object") {
    const nestedId = (opportunity as Record<string, unknown>).id;
    if (typeof nestedId === "string" && nestedId.trim()) return nestedId;
  }

  const data = record.data;
  if (data && typeof data === "object") {
    const nestedId = (data as Record<string, unknown>).id;
    if (typeof nestedId === "string" && nestedId.trim()) return nestedId;
  }

  return null;
}


function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export function extractGhlOpportunityTarget(payload: unknown): {
  opportunityId: string | null;
  pipelineId: string | null;
  stageId: string | null;
} {
  if (!payload || typeof payload !== "object") {
    return {
      opportunityId: null,
      pipelineId: null,
      stageId: null,
    };
  }

  const record = payload as Record<string, unknown>;
  const nested = [record, record.opportunity, record.data]
    .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object");

  for (const entry of nested) {
    const opportunityId = readString(entry.id);
    const pipelineId = readString(entry.pipelineId) ?? readString(entry.pipeline_id);
    const stageId = readString(entry.pipelineStageId)
      ?? readString(entry.pipeline_stage_id)
      ?? readString(entry.stageId)
      ?? readString(entry.stage_id);

    if (opportunityId || pipelineId || stageId) {
      return {
        opportunityId,
        pipelineId,
        stageId,
      };
    }
  }

  return {
    opportunityId: extractGhlOpportunityId(payload),
    pipelineId: null,
    stageId: null,
  };
}
