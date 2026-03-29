import { useQuery } from "@tanstack/react-query";
import { ghlGetCalendars, ghlGetPipelines } from "@/lib/ghl";

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
