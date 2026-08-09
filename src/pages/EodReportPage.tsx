import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ListChecks,
  MessageSquareQuote,
  NotebookPen,
  Pencil,
  Save,
} from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ListRowsSkeleton } from "@/components/skeletons/PageSkeletons";
import { useAuth } from "@/hooks/useAuth";
import { useAdminAccess } from "@/hooks/useUserRole";
import { useSalesReps } from "@/hooks/usePipelineItems";
import { addDaysIso, formatLongDate, melbourneTodayIso } from "@/lib/eodDates";
import {
  emptyStateOfBeing,
  stateOfBeingFromReport,
  unansweredStateOfBeing,
  StateOfBeingForm,
  StateOfBeingSummary,
} from "@/components/eod/StateOfBeingBlock";
import type { EodStateOfBeingAnswers } from "@/lib/eodStateOfBeing";
import {
  useEodMetrics,
  useEodReport,
  useSaveManagerComment,
  useTeamEodReports,
  useUpsertEodReport,
  type EodMetrics,
  type EodReport,
} from "@/hooks/useEodReports";

// Date helpers live in @/lib/eodDates so the dashboard entry-point card resolves
// the exact same Melbourne report date as this page.

function formatTalkTime(seconds: number | null | undefined): string {
  const s = Math.max(0, Math.round(seconds ?? 0));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  return `${hours}:${String(minutes).padStart(2, "0")}`;
}

function formatPct(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  return `${Number.isInteger(n) ? n : n.toFixed(1)}%`;
}

function MetricTile({ label, value, subtext, compact }: { label: string; value: string; subtext?: string; compact?: boolean }) {
  return (
    <div className={`rounded-lg border border-border bg-card ${compact ? "px-3 py-2" : "p-4"}`}>
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={`font-mono font-bold text-foreground ${compact ? "text-lg leading-tight" : "mt-1 text-2xl"}`}>{value}</p>
      {subtext && <p className="mt-0.5 text-[10px] text-muted-foreground">{subtext}</p>}
    </div>
  );
}

function MetricsRow({ metrics, compact }: { metrics: EodMetrics | null | undefined; compact?: boolean }) {
  return (
    <div className={`grid gap-2 ${compact ? "grid-cols-3 sm:grid-cols-6" : "grid-cols-2 sm:grid-cols-3 xl:grid-cols-6"}`}>
      <MetricTile label="Dials" value={String(metrics?.dials ?? 0)} compact={compact} />
      <MetricTile label="Connects" value={String(metrics?.connects ?? 0)} compact={compact} />
      <MetricTile label="Pickup %" value={formatPct(metrics?.pickup_pct)} compact={compact} />
      <MetricTile
        label="Convos >2min"
        value={String(metrics?.convos_over_2min ?? 0)}
        subtext={formatPct(metrics?.conv_over_2min_pct)}
        compact={compact}
      />
      <MetricTile label="Talk time" value={formatTalkTime(metrics?.talk_time_seconds)} subtext="h:mm" compact={compact} />
      <MetricTile label="Bookings" value={String(metrics?.bookings ?? 0)} compact={compact} />
    </div>
  );
}

function CoachComment({ comment, commentedAt }: { comment: string; commentedAt: string | null }) {
  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
      <div className="flex items-center gap-2 text-primary">
        <MessageSquareQuote className="h-4 w-4" />
        <p className="text-[10px] uppercase tracking-widest">Coach comment</p>
        {commentedAt ? (
          <span className="ml-auto text-[10px] font-mono text-muted-foreground">
            {new Date(commentedAt).toLocaleString("en-AU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
          </span>
        ) : null}
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{comment}</p>
    </div>
  );
}

type EodFormState = {
  wentWell: string;
  doDifferently: string;
  takeaways: string[];
  commitments: string[];
  flaggedResponse: string;
  stateOfBeing: EodStateOfBeingAnswers;
};

const emptyForm: EodFormState = {
  wentWell: "",
  doDifferently: "",
  takeaways: ["", "", ""],
  commitments: ["", "", ""],
  flaggedResponse: "",
  stateOfBeing: emptyStateOfBeing,
};

function formFromReport(report: EodReport): EodFormState {
  const pad3 = (arr: string[] | null) => {
    const base = (arr ?? []).slice(0, 3);
    while (base.length < 3) base.push("");
    return base;
  };
  return {
    wentWell: report.went_well ?? "",
    doDifferently: report.do_differently ?? "",
    takeaways: pad3(report.takeaways),
    commitments: pad3(report.commitments),
    flaggedResponse: report.flagged_response ?? "",
    stateOfBeing: stateOfBeingFromReport(report),
  };
}

function RepView({ userId }: { userId: string }) {
  const today = melbourneTodayIso();
  const yesterday = addDaysIso(today, -1);

  const metricsQuery = useEodMetrics(userId, today);
  const reportQuery = useEodReport(userId, today);
  const yesterdayQuery = useEodReport(userId, yesterday);
  const upsert = useUpsertEodReport();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EodFormState>(emptyForm);

  const metrics = metricsQuery.data ?? null;
  const report = reportQuery.data ?? null;
  const yesterdayReport = yesterdayQuery.data ?? null;

  // The flag shown while filling the form comes from today's live metrics;
  // once submitted we show the snapshot stored on the report.
  const flagged = report && !editing ? report.flagged_metric : metrics?.flagged_metric ?? null;
  const showForm = !reportQuery.isLoading && (!report || editing);

  useEffect(() => {
    if (editing && report) setForm(formFromReport(report));
  }, [editing, report]);

  const setTakeaway = (idx: number, value: string) =>
    setForm((f) => ({ ...f, takeaways: f.takeaways.map((t, i) => (i === idx ? value : t)) }));
  const setCommitment = (idx: number, value: string) =>
    setForm((f) => ({ ...f, commitments: f.commitments.map((c, i) => (i === idx ? value : c)) }));
  const setStateOfBeing = (patch: Partial<EodStateOfBeingAnswers>) =>
    setForm((f) => ({ ...f, stateOfBeing: { ...f.stateOfBeing, ...patch } }));

  const handleSubmit = async () => {
    const missing = unansweredStateOfBeing(form.stateOfBeing);
    if (missing.length > 0) {
      return void toast.error(
        missing.length === 1
          ? `Answer: ${missing[0].question}`
          : `${missing.length} state of being & discipline questions still need an answer.`,
      );
    }
    if (!form.wentWell.trim()) return void toast.error("What went well is required.");
    if (!form.doDifferently.trim()) return void toast.error("What you'd do differently is required.");
    if (form.takeaways.some((t) => !t.trim())) return void toast.error("All 3 takeaways are required.");
    if (form.commitments.some((c) => !c.trim())) return void toast.error("All 3 commitments are required.");
    if (flagged && !form.flaggedResponse.trim()) {
      return void toast.error(`Answer the flagged metric prompt (${flagged.label}) before submitting.`);
    }

    try {
      const { stateOfBeingSaved } = await upsert.mutateAsync({
        user_id: userId,
        report_date: today,
        went_well: form.wentWell.trim(),
        do_differently: form.doDifferently.trim(),
        takeaways: form.takeaways.map((t) => t.trim()),
        commitments: form.commitments.map((c) => c.trim()),
        flagged_metric: metrics?.flagged_metric ?? null,
        flagged_response: flagged ? form.flaggedResponse.trim() : null,
        auto_metrics: metrics,
        submitted_at: new Date().toISOString(),
        ...form.stateOfBeing,
      });
      setEditing(false);
      if (stateOfBeingSaved) {
        toast.success("End of day report submitted.");
      } else {
        // The columns aren't on eod_reports yet — the migration in
        // supabase/migrations hasn't been applied to this project.
        toast.warning("Report submitted, but the state of being answers couldn't be saved yet.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't submit the report.");
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2 text-primary">
          <CalendarClock className="h-4 w-4" />
          <p className="text-[10px] uppercase tracking-widest">End of day</p>
        </div>
        <h2 className="mt-1 text-lg font-semibold text-foreground">{formatLongDate(today)}</h2>
        <p className="text-xs text-muted-foreground">
          Your numbers are pulled automatically — you only write the reflection.
        </p>
      </div>

      <MetricsRow metrics={report && !editing ? report.auto_metrics ?? metrics : metrics} />

      {yesterdayReport && (yesterdayReport.commitments?.length ?? 0) > 0 ? (
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <ListChecks className="h-4 w-4" />
            <p className="text-[10px] uppercase tracking-widest">Yesterday's commitments</p>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            You promised these yesterday. Today's reflection answers to them.
          </p>
          <ul className="mt-2 space-y-1.5">
            {(yesterdayReport.commitments ?? []).map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                <span className="mt-0.5 font-mono text-xs text-primary">{i + 1}.</span>
                <span>{c}</span>
              </li>
            ))}
          </ul>
          {yesterdayReport.manager_comment ? (
            <div className="mt-3">
              <CoachComment comment={yesterdayReport.manager_comment} commentedAt={yesterdayReport.manager_commented_at} />
            </div>
          ) : null}
        </div>
      ) : null}

      {flagged ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4" />
            <p className="text-sm font-semibold">{flagged.label}</p>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Today: <span className="font-mono font-medium text-foreground">{String(flagged.value)}</span> · target{" "}
            <span className="font-mono font-medium text-foreground">{String(flagged.threshold)}</span>
          </p>
          <p className="mt-2 text-sm text-foreground">{flagged.prompt}</p>
          {showForm ? (
            <Textarea
              value={form.flaggedResponse}
              onChange={(e) => setForm((f) => ({ ...f, flaggedResponse: e.target.value }))}
              placeholder="Your honest read on why, and what you'll change…"
              className="mt-3 bg-background"
              rows={3}
            />
          ) : (
            <p className="mt-3 whitespace-pre-wrap rounded-md border border-border bg-background/80 p-3 text-sm text-foreground">
              {report?.flagged_response || "—"}
            </p>
          )}
        </div>
      ) : null}

      {reportQuery.isLoading ? <ListRowsSkeleton rows={4} /> : null}

      {/* Discipline before reflection — the taps come first, the writing second. */}
      {showForm ? <StateOfBeingForm value={form.stateOfBeing} onChange={setStateOfBeing} /> : null}

      {showForm ? (
        <div className="rounded-lg border border-border bg-card p-4 space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground" htmlFor="eod-went-well">
              What went well today?
            </label>
            <p className="text-xs text-muted-foreground">
              Be specific — name the call. "The 2:15 call with the sparky, my opener landed clean."
            </p>
            <Textarea
              id="eod-went-well"
              value={form.wentWell}
              onChange={(e) => setForm((f) => ({ ...f, wentWell: e.target.value }))}
              className="mt-2 bg-background"
              rows={3}
            />
          </div>

          <div>
            <label className="text-sm font-medium text-foreground" htmlFor="eod-do-differently">
              What would you do differently?
            </label>
            <p className="text-xs text-muted-foreground">One specific call. Name it.</p>
            <Textarea
              id="eod-do-differently"
              value={form.doDifferently}
              onChange={(e) => setForm((f) => ({ ...f, doDifferently: e.target.value }))}
              className="mt-2 bg-background"
              rows={3}
            />
          </div>

          <div>
            <p className="text-sm font-medium text-foreground">3 takeaways from today</p>
            <div className="mt-2 space-y-2">
              {form.takeaways.map((t, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-4 shrink-0 font-mono text-xs text-muted-foreground">{i + 1}.</span>
                  <Input
                    value={t}
                    onChange={(e) => setTakeaway(i, e.target.value)}
                    placeholder={`Takeaway ${i + 1}`}
                    className="bg-background"
                  />
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-foreground">3 commitments for tomorrow</p>
            <p className="text-xs text-muted-foreground">Chained to your takeaways — what will you DO tomorrow?</p>
            <div className="mt-2 space-y-2">
              {form.commitments.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-4 shrink-0 font-mono text-xs text-muted-foreground">{i + 1}.</span>
                  <Input
                    value={c}
                    onChange={(e) => setCommitment(i, e.target.value)}
                    placeholder={`Commitment ${i + 1}`}
                    className="bg-background"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <Button onClick={() => void handleSubmit()} disabled={upsert.isPending}>
              <CheckCircle2 className="mr-1.5 h-4 w-4" />
              {report ? "Save changes" : "Submit report"}
            </Button>
            {editing ? (
              <Button variant="outline" onClick={() => setEditing(false)} disabled={upsert.isPending}>
                Cancel
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {report && !editing ? (
        <div className="rounded-lg border border-border bg-card p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold text-foreground">Report submitted</p>
              {report.submitted_at ? (
                <span className="text-[11px] font-mono text-muted-foreground">
                  {new Date(report.submitted_at).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" })}
                </span>
              ) : null}
            </div>
            {report.report_date === today ? (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <Pencil className="mr-1.5 h-3.5 w-3.5" />
                Edit
              </Button>
            ) : null}
          </div>

          <StateOfBeingSummary report={report} />

          <ReportReflection report={report} />

          {report.manager_comment ? (
            <CoachComment comment={report.manager_comment} commentedAt={report.manager_commented_at} />
          ) : (
            <p className="text-xs text-muted-foreground">Your coach hasn't reviewed this report yet.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function ReportReflection({ report }: { report: EodReport }) {
  return (
    <div className="space-y-3">
      <div>
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">What went well</p>
        <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{report.went_well || "—"}</p>
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Do differently</p>
        <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{report.do_differently || "—"}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Takeaways</p>
          <ul className="mt-1 space-y-1">
            {(report.takeaways ?? []).map((t, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                <span className="mt-0.5 font-mono text-xs text-muted-foreground">{i + 1}.</span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Commitments for tomorrow</p>
          <ul className="mt-1 space-y-1">
            {(report.commitments ?? []).map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                <span className="mt-0.5 font-mono text-xs text-primary">{i + 1}.</span>
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function TeamReportCard({
  report,
  repLabel,
  managerId,
}: {
  report: EodReport;
  repLabel: string;
  managerId: string;
}) {
  const saveComment = useSaveManagerComment();
  const [comment, setComment] = useState(report.manager_comment ?? "");

  useEffect(() => {
    setComment(report.manager_comment ?? "");
  }, [report.manager_comment]);

  const handleSave = async () => {
    if (!comment.trim()) return void toast.error("Write a comment before saving.");
    try {
      await saveComment.mutateAsync({ reportId: report.id, comment: comment.trim(), managerId });
      toast.success(`Comment saved for ${repLabel}.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the comment.");
    }
  };

  const flagged = report.flagged_metric;

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-foreground">{repLabel}</p>
          {report.submitted_at ? (
            <span className="text-[11px] font-mono text-muted-foreground">
              submitted{" "}
              {new Date(report.submitted_at).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" })}
            </span>
          ) : null}
        </div>
        {!report.manager_comment ? (
          <Badge className="bg-amber-500/15 text-amber-600 hover:bg-amber-500/15 dark:text-amber-400">
            Needs review
          </Badge>
        ) : (
          <Badge className="bg-primary/15 text-primary hover:bg-primary/15">Reviewed</Badge>
        )}
      </div>

      <MetricsRow metrics={report.auto_metrics} compact />

      {/* Did they do the work, not just hit the numbers. */}
      <StateOfBeingSummary report={report} variant="manager" />

      {flagged ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5" />
            <p className="text-xs font-semibold">{flagged.label}</p>
            <span className="text-[10px] font-mono text-muted-foreground">
              {String(flagged.value)} vs {String(flagged.threshold)}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{flagged.prompt}</p>
          <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">
            {report.flagged_response || <span className="text-muted-foreground">No response given.</span>}
          </p>
        </div>
      ) : null}

      <ReportReflection report={report} />

      <div className="border-t border-border pt-3">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Manager comment</p>
        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Comment on this report — every report gets one."
          className="mt-2 bg-background"
          rows={2}
        />
        <Button size="sm" className="mt-2" onClick={() => void handleSave()} disabled={saveComment.isPending}>
          <Save className="mr-1.5 h-3.5 w-3.5" />
          {report.manager_comment ? "Update comment" : "Save comment"}
        </Button>
      </div>
    </div>
  );
}

function TeamReview({ managerId }: { managerId: string }) {
  const today = melbourneTodayIso();
  const [date, setDate] = useState(today);
  const { data: reps = [] } = useSalesReps();
  const teamQuery = useTeamEodReports(date, true);

  const reports = useMemo(() => teamQuery.data ?? [], [teamQuery.data]);
  const reportsByUser = useMemo(() => new Map(reports.map((r) => [r.user_id, r])), [reports]);
  const repLabel = (userId: string) => {
    const rep = reps.find((r) => r.user_id === userId);
    return rep?.display_name?.trim() || rep?.email || "Unknown rep";
  };

  const repsWithout = reps.filter((r) => !reportsByUser.has(r.user_id));
  const needsReview = reports.filter((r) => !r.manager_comment).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Team review</h2>
          <p className="text-xs text-muted-foreground">
            Every submitted report needs a manager comment — that's the deal.
          </p>
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground" htmlFor="eod-review-date">
            Report date
          </label>
          <input
            id="eod-review-date"
            type="date"
            value={date}
            max={today}
            onChange={(e) => setDate(e.target.value)}
            className="h-9 rounded-md border border-border bg-background px-3 text-sm"
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <MetricTile label="Submitted" value={String(reports.length)} />
        <MetricTile label="Needs review" value={String(needsReview)} />
        <MetricTile label="Missing" value={String(repsWithout.length)} />
      </div>

      {teamQuery.isLoading ? <ListRowsSkeleton rows={4} /> : null}
      {teamQuery.error ? (
        <div className="text-sm text-destructive">
          {teamQuery.error instanceof Error ? teamQuery.error.message : "Unable to load team reports."}
        </div>
      ) : null}

      {!teamQuery.isLoading && reports.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
          No reports submitted for {formatLongDate(date)} yet.
        </div>
      ) : null}

      {reports.map((report) => (
        <TeamReportCard key={report.id} report={report} repLabel={repLabel(report.user_id)} managerId={managerId} />
      ))}

      {repsWithout.length > 0 ? (
        <div className="rounded-lg border border-border bg-card divide-y divide-border">
          {repsWithout.map((rep) => (
            <div key={rep.user_id} className="flex items-center justify-between px-4 py-2.5">
              <p className="text-sm text-foreground">{rep.display_name?.trim() || rep.email || "Unknown rep"}</p>
              <span className="text-xs text-muted-foreground">No report submitted</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function EodReportPage() {
  const { user } = useAuth();
  const { canViewAdmin } = useAdminAccess();

  if (!user) return null;

  return (
    <AppLayout title="End of Day">
      <div className="max-w-4xl mx-auto">
        {canViewAdmin ? (
          <Tabs defaultValue="my-report" className="space-y-4">
            <TabsList>
              <TabsTrigger value="my-report">
                <NotebookPen className="mr-1.5 h-3.5 w-3.5" />
                My Report
              </TabsTrigger>
              <TabsTrigger value="team-review">
                <ListChecks className="mr-1.5 h-3.5 w-3.5" />
                Team Review
              </TabsTrigger>
            </TabsList>
            <TabsContent value="my-report">
              <RepView userId={user.id} />
            </TabsContent>
            <TabsContent value="team-review">
              <TeamReview managerId={user.id} />
            </TabsContent>
          </Tabs>
        ) : (
          <RepView userId={user.id} />
        )}
      </div>
    </AppLayout>
  );
}
