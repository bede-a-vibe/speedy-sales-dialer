import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// `eod_reports` + `get_rep_eod_metrics` are live in production but not yet in the
// generated Supabase types (src/integrations/supabase/types.ts). Follow the repo's
// existing pattern for this situation (see useSmartLists / useContacts): cast the
// table/RPC name `as never` and cast results back to the local types below.

export type EodFlaggedMetric = {
  key: string;
  label: string;
  value: number | string;
  threshold: number | string;
  prompt: string;
};

export type EodMetrics = {
  date: string;
  dials: number;
  connects: number;
  pickup_pct: number;
  convos_over_2min: number;
  conv_over_2min_pct: number;
  talk_time_seconds: number;
  bookings: number;
  longest_unbooked_call_seconds: number;
  flagged_metric: EodFlaggedMetric | null;
};

export type EodReport = {
  id: string;
  user_id: string;
  report_date: string;
  went_well: string | null;
  do_differently: string | null;
  takeaways: string[] | null;
  commitments: string[] | null;
  flagged_metric: EodFlaggedMetric | null;
  flagged_response: string | null;
  auto_metrics: EodMetrics | null;
  manager_comment: string | null;
  manager_id: string | null;
  manager_commented_at: string | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type EodReportUpsert = {
  user_id: string;
  report_date: string;
  went_well: string;
  do_differently: string;
  takeaways: string[];
  commitments: string[];
  flagged_metric: EodFlaggedMetric | null;
  flagged_response: string | null;
  auto_metrics: EodMetrics | null;
  submitted_at: string;
};

const EOD_REPORT_KEY = "eod-report";
const EOD_METRICS_KEY = "eod-metrics";
const EOD_TEAM_KEY = "eod-team-reports";

/** Auto-computed dialer metrics for one rep + one day (rep never types these). */
export function useEodMetrics(userId: string | undefined, date: string) {
  return useQuery({
    queryKey: [EOD_METRICS_KEY, userId, date],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async (): Promise<EodMetrics | null> => {
      const { data, error } = await supabase.rpc("get_rep_eod_metrics" as never, {
        _user_id: userId,
        _date: date,
      } as never);
      if (error) throw error;
      return (data ?? null) as unknown as EodMetrics | null;
    },
  });
}

/** A single rep's EOD report for a given date (null when not submitted). */
export function useEodReport(userId: string | undefined, date: string) {
  return useQuery({
    queryKey: [EOD_REPORT_KEY, userId, date],
    enabled: !!userId,
    queryFn: async (): Promise<EodReport | null> => {
      const { data, error } = await supabase
        .from("eod_reports" as never)
        .select("*")
        .eq("user_id", userId!)
        .eq("report_date", date)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as EodReport | null;
    },
  });
}

/** Rep submit/edit: upsert on the (user_id, report_date) unique key. */
export function useUpsertEodReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: EodReportUpsert) => {
      const { data, error } = await supabase
        .from("eod_reports" as never)
        .upsert(payload as never, { onConflict: "user_id,report_date" })
        .select()
        .single();
      if (error) throw error;
      return data as unknown as EodReport;
    },
    onSuccess: (report) => {
      qc.invalidateQueries({ queryKey: [EOD_REPORT_KEY, report.user_id, report.report_date] });
      qc.invalidateQueries({ queryKey: [EOD_TEAM_KEY, report.report_date] });
    },
  });
}

/** Manager view: every report submitted for a given date (RLS grants admins/coaches select-all). */
export function useTeamEodReports(date: string, enabled: boolean) {
  return useQuery({
    queryKey: [EOD_TEAM_KEY, date],
    enabled,
    queryFn: async (): Promise<EodReport[]> => {
      const { data, error } = await supabase
        .from("eod_reports" as never)
        .select("*")
        .eq("report_date", date)
        .order("submitted_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as EodReport[];
    },
  });
}

/** Manager comment: the methodology requires a comment on every single report. */
export function useSaveManagerComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      reportId,
      comment,
      managerId,
    }: {
      reportId: string;
      comment: string;
      managerId: string;
    }) => {
      const { data, error } = await supabase
        .from("eod_reports" as never)
        .update({
          manager_comment: comment,
          manager_id: managerId,
          manager_commented_at: new Date().toISOString(),
        } as never)
        .eq("id", reportId)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as EodReport;
    },
    onSuccess: (report) => {
      qc.invalidateQueries({ queryKey: [EOD_TEAM_KEY, report.report_date] });
      qc.invalidateQueries({ queryKey: [EOD_REPORT_KEY, report.user_id, report.report_date] });
    },
  });
}
