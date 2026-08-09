import { useNavigate } from "react-router-dom";
import { CheckCircle2, MessageSquareQuote, NotebookPen, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useEodReport } from "@/hooks/useEodReports";
import { addDaysIso, formatSubmittedTime, melbourneTodayIso } from "@/lib/eodDates";
import { cn } from "@/lib/utils";

/**
 * End-of-shift entry point on the Dashboard.
 *
 * Three states, because a dumb link doesn't change behaviour:
 *  1. Not submitted  → accented, one obvious action.
 *  2. Submitted      → calm confirmation with the time, secondary view/edit.
 *  3. Coach commented → the comment is surfaced here and linked through.
 *     A manager comment nobody reads is the whole loop failing, and the comment
 *     usually lands on YESTERDAY's report — so both days are checked.
 */
export function EodReportCard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const today = melbourneTodayIso();
  const yesterday = addDaysIso(today, -1);

  const todayQuery = useEodReport(user?.id, today);
  const yesterdayQuery = useEodReport(user?.id, yesterday);

  if (!user) return null;
  if (todayQuery.isLoading) return null;

  const report = todayQuery.data ?? null;
  const submitted = !!report;
  const submittedTime = formatSubmittedTime(report?.submitted_at);

  // Today's coach comment wins; otherwise surface yesterday's, which is where
  // an overnight review actually lands.
  const yesterdayReport = yesterdayQuery.data ?? null;
  const comment = report?.manager_comment
    ? { text: report.manager_comment, when: "on today's report" }
    : yesterdayReport?.manager_comment
      ? { text: yesterdayReport.manager_comment, when: "on yesterday's report" }
      : null;

  return (
    <div
      className={cn(
        "rounded-xl border p-5",
        submitted ? "border-border bg-card" : "border-primary/40 bg-primary/5 shadow-card",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
              submitted ? "bg-muted text-muted-foreground" : "bg-primary/15 text-primary",
            )}
          >
            {submitted ? <CheckCircle2 className="h-5 w-5" /> : <NotebookPen className="h-5 w-5" />}
          </div>
          <div className="min-w-0">
            <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground">End of Day</h3>
            {submitted ? (
              <>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  Report submitted{submittedTime ? ` at ${submittedTime}` : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  {comment ? "Your coach has left you a comment." : "Waiting on your coach's comment."}
                </p>
              </>
            ) : (
              <>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  You haven't filed today's report yet
                </p>
                <p className="text-xs text-muted-foreground">
                  Two minutes. Your numbers are pulled for you — you only bring the honesty.
                </p>
              </>
            )}
          </div>
        </div>

        {submitted ? (
          <Button variant="outline" size="sm" onClick={() => navigate("/eod")}>
            <Pencil className="mr-1.5 h-3.5 w-3.5" />
            View or edit
          </Button>
        ) : (
          <Button onClick={() => navigate("/eod")}>
            <NotebookPen className="mr-1.5 h-4 w-4" />
            Submit End of Day Report
          </Button>
        )}
      </div>

      {comment ? (
        <button
          type="button"
          onClick={() => navigate("/eod")}
          className="mt-4 flex w-full items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3 text-left transition-colors hover:border-primary/50"
        >
          <MessageSquareQuote className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-widest text-primary">
              Coach comment {comment.when}
            </p>
            <p className="mt-1 line-clamp-2 text-sm text-foreground">{comment.text}</p>
            <p className="mt-1 text-[11px] font-medium text-primary">Read it →</p>
          </div>
        </button>
      ) : null}
    </div>
  );
}
