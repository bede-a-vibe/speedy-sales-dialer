import { useNavigate } from "react-router-dom";
import { CheckCircle2, MessageSquareQuote, NotebookPen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useEodReport } from "@/hooks/useEodReports";
import { addDaysIso, formatSubmittedTime, melbourneTodayIso } from "@/lib/eodDates";
import { cn } from "@/lib/utils";

/**
 * End-of-shift entry point — a slim bar pinned to the TOP of the Dashboard.
 *
 * Deliberately one line tall. It sits above the stats a rep looks at all day,
 * so it has to earn its space by being thin rather than loud. Three states,
 * because a dumb link doesn't change behaviour:
 *  1. Not submitted   → accented, one obvious action.
 *  2. Submitted       → calm confirmation with the time.
 *  3. Coach commented → the comment wins the bar and links straight through.
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
    ? { text: report.manager_comment, when: "today" }
    : yesterdayReport?.manager_comment
      ? { text: yesterdayReport.manager_comment, when: "yesterday" }
      : null;

  const go = () => navigate("/eod");

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-3 py-2",
        submitted ? "border-border bg-card" : "border-primary/40 bg-primary/5",
      )}
    >
      {submitted ? (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-muted-foreground" />
      ) : (
        <NotebookPen className="h-4 w-4 shrink-0 text-primary" />
      )}

      <p className="text-sm text-foreground">
        {submitted ? (
          <>
            <span className="font-medium">End of day filed</span>
            {submittedTime ? (
              <span className="text-muted-foreground"> · {submittedTime}</span>
            ) : null}
          </>
        ) : (
          <>
            <span className="font-medium">End of day report</span>
            <span className="text-muted-foreground"> · not filed yet, takes two minutes</span>
          </>
        )}
      </p>

      {/* Coach comment collapses to a single clickable line so the bar stays thin. */}
      {comment ? (
        <button
          type="button"
          onClick={go}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-xs text-primary hover:underline"
        >
          <MessageSquareQuote className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">
            Coach commented on {comment.when}'s report — {comment.text}
          </span>
        </button>
      ) : (
        <span className="flex-1" />
      )}

      <Button
        size="sm"
        variant={submitted ? "outline" : "default"}
        onClick={go}
        className="h-7 shrink-0 px-2.5 text-xs"
      >
        {submitted ? "View" : "Submit"}
      </Button>
    </div>
  );
}
