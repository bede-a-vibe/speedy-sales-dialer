import { useQuery } from "@tanstack/react-query";
import { ghlGetCalendars, ghlGetPipelines } from "@/lib/ghl";
import { GHL_PIPELINE_CONTRACT } from "@/lib/pipelineMappings";

export interface GHLCalendar {
  id: string;
  name: string;
}

export interface GHLPipelineStage {
  id: string;
  name: string;
}

export interface GHLPipeline {
  id: string;
  name: string;
  stages: GHLPipelineStage[];
}

export function findGHLPipelineByName(pipelines: GHLPipeline[], pipelineName: string) {
  const normalizedTarget = pipelineName.trim().toLowerCase();
  return pipelines.find((pipeline) => pipeline.name.trim().toLowerCase() === normalizedTarget) ?? null;
}

export function findGHLPipelineStageByName(stages: GHLPipelineStage[], stageName: string) {
  const normalizedTarget = stageName.trim().toLowerCase();
  return stages.find((stage) => stage.name.trim().toLowerCase() === normalizedTarget) ?? null;
}

function findPipelineFromContract(
  pipelines: GHLPipeline[],
  contract: { pipelineId: string; pipelineName: string },
) {
  return findGHLPipelineByName(pipelines, contract.pipelineName)
    ?? pipelines.find((pipeline) => pipeline.id === contract.pipelineId)
    ?? null;
}

function findStageFromContract(
  pipeline: GHLPipeline | null | undefined,
  contract: { stageId: string; stageName: string },
) {
  if (!pipeline) return null;
  return findGHLPipelineStageByName(pipeline.stages, contract.stageName)
    ?? pipeline.stages.find((stage) => stage.id === contract.stageId)
    ?? null;
}

export function findDefaultBookedPipeline(pipelines: GHLPipeline[]) {
  return findPipelineFromContract(pipelines, GHL_PIPELINE_CONTRACT.booked);
}

export function findDefaultBookedStage(pipeline: GHLPipeline | null | undefined) {
  return findStageFromContract(pipeline, GHL_PIPELINE_CONTRACT.booked);
}

export function findDefaultFollowUpPipeline(pipelines: GHLPipeline[]) {
  return findPipelineFromContract(pipelines, GHL_PIPELINE_CONTRACT.follow_up);
}

export function findDefaultFollowUpStage(pipeline: GHLPipeline | null | undefined) {
  return findStageFromContract(pipeline, GHL_PIPELINE_CONTRACT.follow_up);
}

export function useGHLCalendars() {
  return useQuery<GHLCalendar[]>({
    queryKey: ["ghl", "calendars"],
    queryFn: async () => {
      const res = await ghlGetCalendars() as { calendars?: Array<{ id: string; name: string }> };
      return (res.calendars ?? []).map((c) => ({ id: c.id, name: c.name }));
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

export function useGHLPipelines() {
  return useQuery<GHLPipeline[]>({
    queryKey: ["ghl", "pipelines"],
    queryFn: async () => {
      const res = await ghlGetPipelines() as { pipelines?: Array<{ id: string; name: string; stages: Array<{ id: string; name: string }> }> };
      return (res.pipelines ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        stages: (p.stages ?? []).map((s) => ({ id: s.id, name: s.name })),
      }));
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}
