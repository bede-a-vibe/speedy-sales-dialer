import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  EOD_STATE_OF_BEING_COLUMNS,
  type EodStateOfBeingAnswers,
} from "@/lib/eodStateOfBeing";

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

// The six State of Being & Discipline answers are `Partial<>` on the read type:
// until the migration in supabase/migrations lands they simply aren't columns on
// the row, so every field can be `undefined` as well as null. Read them with
// `readAnswer()` from @/lib/eodStateOfBeing rather than touching them directly.
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
} & Partial<EodStateOfBeingAnswers>;

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
} & EodStateOfBeingAnswers;

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

/**
 * True when PostgREST rejected the write because the State of Being & Discipline
 * columns don't exist yet — i.e. the migration in supabase/migrations hasn't been
 * applied to this project. PGRST204 is "column not found in the schema cache";
 * 42703 is Postgres' own undefined_column.
 */
function isMissingStateOfBeingColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code !== "PGRST204" && error.code !== "42703") return false;
  const message = (error.message ?? "").toLowerCase();
  if (!message) return true;
  return EOD_STATE_OF_BEING_COLUMNS.some((column) => message.includes(column));
}

export type EodUpsertResult = {
  report: EodReport;
  /**
   * False when the report saved but the six State of Being answers were dropped
   * because the columns are missing. The UI warns instead of silently losing them.
   */
  stateOfBeingSaved: boolean;
};

/** Rep submit/edit: upsert on the (user_id, report_date) unique key. */
export function useUpsertEodReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: EodReportUpsert): Promise<EodUpsertResult> => {
      const write = async (body: Record<string, unknown>) =>
        supabase
          .from("eod_reports" as never)
          .upsert(body as never, { onConflict: "user_id,report_date" })
          .select()
          .single();

      const { data, error } = await write(payload as unknown as Record<string, unknown>);
      if (!error) return { report: data as unknown as EodReport, stateOfBeingSaved: true };

      // Degrade gracefully: the rest of the report is still worth saving.
      if (!isMissingStateOfBeingColumn(error)) throw error;

      const fallback = { ...(payload as unknown as Record<string, unknown>) };
      for (const column of EOD_STATE_OF_BEING_COLUMNS) delete fallback[column];
      const retry = await write(fallback);
      if (retry.error) throw retry.error;
      return { report: retry.data as unknown as EodReport, stateOfBeingSaved: false };
    },
    onSuccess: ({ report }) => {
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
