import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { AlertTriangle, CalendarClock, ChevronRight, Clock3 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { findDefaultFollowUpPipeline, findDefaultFollowUpStage, useGHLPipelines } from "@/hooks/useGHLConfig";
import { TwoPipelineGuide } from "@/components/ghl/TwoPipelineGuide";

type FollowUpContact = {
  id: string;
  business_name: string;
  contact_person: string | null;
  phone: string;
  status: string;
  is_dnc: boolean;
  ghl_contact_id: string;
};

type FollowUpScope = "today" | "overdue" | "week";
type FollowUpItem = {
  task_id: string | null;
  title: string | null;
  body: string | null;
  due_date: string | null;
  contact: FollowUpContact;
};

function getTaskBucket(dueDate: string | null) {
  if (!dueDate) return "unscheduled" as const;

  const due = new Date(dueDate);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setHours(23, 59, 59, 999);

  if (due < startOfToday) return "overdue" as const;
  if (due <= endOfToday) return "today" as const;
  return "upcoming" as const;
}

function getTaskBucketLabel(bucket: ReturnType<typeof getTaskBucket>) {
  switch (bucket) {
    case "overdue":
      return "Overdue";
    case "today":
      return "Due today";
    case "upcoming":
      return "Upcoming";
    case "unscheduled":
      return "No due date";
  }
}

export default function FollowUpsPage() {
  const todayIso = new Date().toISOString().slice(0, 10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<FollowUpItem[]>([]);
  const [scope, setScope] = useState<FollowUpScope>("today");
  const [anchorDate, setAnchorDate] = useState(todayIso);
  const [taskCount, setTaskCount] = useState(0);
  const [forDate, setForDate] = useState<string | null>(null);
  const { data: ghlPipelines = [] } = useGHLPipelines();
  const defaultFollowUpPipeline = useMemo(
    () => findDefaultFollowUpPipeline(ghlPipelines),
    [ghlPipelines],
  );
  const defaultFollowUpStage = useMemo(
    () => findDefaultFollowUpStage(defaultFollowUpPipeline),
    [defaultFollowUpPipeline],
  );
  const emptyStateByScope: Record<FollowUpScope, string> = {
    today: "No open GHL follow-ups due today.",
    overdue: "No overdue GHL follow-ups right now.",
    week: "No open GHL follow-ups in the next 7 days.",
  };

  const sortedItems = useMemo(
    () =>
      [...items].sort((a, b) => {
        if (!a.due_date && !b.due_date) return a.contact.business_name.localeCompare(b.contact.business_name);
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      }),
    [items],
  );

  const summary = useMemo(() => {
    return sortedItems.reduce(
      (acc, item) => {
        const bucket = getTaskBucket(item.due_date);
        acc.total += 1;
        acc[bucket] += 1;
        if (item.contact.is_dnc) acc.dnc += 1;
        return acc;
      },
      { total: 0, overdue: 0, today: 0, upcoming: 0, unscheduled: 0, dnc: 0 },
    );
  }, [sortedItems]);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError(null);

        const { data, error: invokeError } = await supabase.functions.invoke(
          `ghl-followups?scope=${encodeURIComponent(scope)}&date=${encodeURIComponent(anchorDate)}`,
          {
            method: "GET",
          },
        );
        if (invokeError) throw invokeError;
        const payload = (data as {
          items?: FollowUpItem[];
          task_count?: number;
          date?: string;
        } | null) ?? null;
        setItems(payload?.items ?? []);
        setTaskCount(typeof payload?.task_count === "number" ? payload.task_count : 0);
        setForDate(payload?.date ?? null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load follow-ups");
      } finally {
        setLoading(false);
      }
    })();
  }, [scope, anchorDate]);

  return (
    <AppLayout title="Follow-Ups">
      <div className="max-w-4xl mx-auto space-y-4">
        <TwoPipelineGuide
          currentView="followups"
          followUpPipelineName={defaultFollowUpPipeline?.name ?? "Default follow-up pipeline"}
          followUpStageName={defaultFollowUpStage?.name ?? "Default follow-up stage"}
        />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              <p className="text-[10px] uppercase tracking-widest">Overdue</p>
            </div>
            <p className="mt-2 font-mono text-3xl font-bold text-foreground">{summary.overdue}</p>
            <p className="mt-1 text-xs text-muted-foreground">Tasks already past due and needing action first.</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-primary">
              <CalendarClock className="h-4 w-4" />
              <p className="text-[10px] uppercase tracking-widest">Due Today</p>
            </div>
            <p className="mt-2 font-mono text-3xl font-bold text-foreground">{summary.today}</p>
            <p className="mt-1 text-xs text-muted-foreground">Tasks scheduled for the selected day.</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock3 className="h-4 w-4" />
              <p className="text-[10px] uppercase tracking-widest">Upcoming</p>
            </div>
            <p className="mt-2 font-mono text-3xl font-bold text-foreground">{summary.upcoming}</p>
            <p className="mt-1 text-xs text-muted-foreground">Open tasks still ahead after today.</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <ChevronRight className="h-4 w-4" />
              <p className="text-[10px] uppercase tracking-widest">Loaded</p>
            </div>
            <p className="mt-2 font-mono text-3xl font-bold text-foreground">{summary.total}</p>
            <p className="mt-1 text-xs text-muted-foreground">{summary.dnc > 0 ? `${summary.dnc} linked contacts are DNC, so review before outreach.` : "All visible tasks are mapped from the current GHL response."}</p>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <CalendarClock className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold">GHL task-driven follow-ups</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            This view fetches open follow-ups from GoHighLevel tasks and maps them to the Supabase operational cache.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {([
              { value: "today", label: "Today" },
              { value: "overdue", label: "Overdue" },
              { value: "week", label: "Next 7 days" },
            ] as const).map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setScope(option.value)}
                disabled={loading}
                className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                  scope === option.value
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-foreground border-border hover:bg-muted disabled:opacity-60"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="mt-3">
            <label className="text-xs text-muted-foreground block mb-1" htmlFor="followup-date">
              Anchor date
            </label>
            <input
              id="followup-date"
              type="date"
              value={anchorDate}
              onChange={(e) => setAnchorDate(e.target.value)}
              className="h-9 rounded-md border border-border bg-background px-3 text-sm"
              disabled={loading}
            />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Showing <span className="font-medium">{taskCount}</span> open tasks
            {forDate ? ` for ${forDate}` : ""} in <span className="font-medium">{scope}</span> scope.
            {summary.unscheduled > 0 ? ` ${summary.unscheduled} task${summary.unscheduled === 1 ? " is" : "s are"} missing a due date.` : ""}
          </p>
        </div>

        {!loading && !error && sortedItems.length > 0 ? (
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Queue guidance</p>
            <p className="mt-2 text-sm text-foreground">
              {summary.overdue > 0
                ? `Work the ${summary.overdue} overdue follow-up${summary.overdue === 1 ? "" : "s"} first, then clear today's queue.`
                : summary.today > 0
                  ? `No overdue tasks. Focus on the ${summary.today} follow-up${summary.today === 1 ? "" : "s"} due today next.`
                  : "Nothing urgent is overdue today, so you can work ahead on upcoming follow-ups."}
            </p>
          </div>
        ) : null}

        {loading ? <div className="text-sm text-muted-foreground">Loading follow-ups…</div> : null}
        {error ? <div className="text-sm text-destructive">{error}</div> : null}

        {!loading && !error && (
          <div className="rounded-lg border border-border bg-card divide-y">
            {sortedItems.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">{emptyStateByScope[scope]}</div>
            ) : sortedItems.map((item, idx) => {
              const bucket = getTaskBucket(item.due_date);
              return (
                <div key={item.task_id ?? `${item.contact.id}:${idx}`} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-medium text-foreground">{item.contact.business_name}</div>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest ${
                            bucket === "overdue"
                              ? "bg-destructive/10 text-destructive"
                              : bucket === "today"
                                ? "bg-primary/10 text-primary"
                                : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {getTaskBucketLabel(bucket)}
                        </span>
                        {item.contact.is_dnc ? (
                          <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest text-amber-600">
                            DNC flagged
                          </span>
                        ) : null}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {item.contact.contact_person ? `${item.contact.contact_person} · ` : ""}{item.contact.phone}
                      </div>
                    </div>
                    <Link
                      to={`/contacts/${item.contact.id}`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      Open contact
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                  {item.title ? <div className="mt-3 text-sm text-foreground">{item.title}</div> : null}
                  {item.body ? <div className="mt-1 text-xs text-muted-foreground line-clamp-2">{item.body}</div> : null}
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>Status: {item.contact.status}</span>
                    <span>Task source: GHL</span>
                    <span>{item.due_date ? `Due: ${new Date(item.due_date).toLocaleString()}` : "Due date missing"}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
