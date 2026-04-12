import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { AlertTriangle, CalendarClock, ChevronRight, Clock3, Mail, Phone, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { findDefaultFollowUpPipeline, findDefaultFollowUpStage, useGHLPipelines } from "@/hooks/useGHLConfig";
import { TwoPipelineGuide } from "@/components/ghl/TwoPipelineGuide";
import { loadAllStoredEmailDraftSuggestions } from "@/lib/emailDraftStore";
import type { EmailDraftSuggestion } from "@/lib/emailDraftSuggestions";

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
  const [draftsByContactId, setDraftsByContactId] = useState<Record<string, EmailDraftSuggestion>>({});
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

  const nextPriorityItem = useMemo(() => {
    return sortedItems.find((item) => !item.contact.is_dnc) ?? sortedItems[0] ?? null;
  }, [sortedItems]);

  const draftedItems = useMemo(
    () => sortedItems.filter((item) => Boolean(draftsByContactId[item.contact.id])),
    [sortedItems, draftsByContactId],
  );

  const nextDraftReviewItem = useMemo(() => {
    return draftedItems.find((item) => !item.contact.is_dnc) ?? draftedItems[0] ?? null;
  }, [draftedItems]);

  const nextPriorityGuidance = useMemo(() => {
    if (!nextPriorityItem) return null;

    const bucket = getTaskBucket(nextPriorityItem.due_date);
    if (nextPriorityItem.contact.is_dnc) {
      return {
        title: "Review before outreach",
        detail: "This contact is DNC flagged, so open the record first and confirm the right next step before calling.",
      };
    }

    if (bucket === "overdue") {
      return {
        title: "Call this one first",
        detail: "It is already overdue, so clear it before working newer follow-ups.",
      };
    }

    if (bucket === "today") {
      return {
        title: "Best next follow-up",
        detail: "Nothing older is ahead of it, so this is the cleanest next task to work now.",
      };
    }

    if (bucket === "unscheduled") {
      return {
        title: "Needs a due date",
        detail: "Open the contact and set clear timing so it re-enters the queue properly.",
      };
    }

    return {
      title: "Work ahead",
      detail: "Urgent follow-ups are clear, so you can pull this forward next.",
    };
  }, [nextPriorityItem]);

  useEffect(() => {
    setDraftsByContactId(loadAllStoredEmailDraftSuggestions());

    const handleStorage = () => {
      setDraftsByContactId(loadAllStoredEmailDraftSuggestions());
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

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
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-3">
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
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-center gap-2 text-violet-600">
                  <Mail className="h-4 w-4" />
                  <p className="text-[10px] uppercase tracking-widest">Review-ready drafts</p>
                </div>
                <p className="mt-2 text-3xl font-bold text-foreground">{draftedItems.length}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Saved email draft suggestions already attached to contacts in this queue.
                </p>
                {nextDraftReviewItem ? (
                  <div className="mt-3 rounded-md border border-violet-500/20 bg-violet-500/5 p-3">
                    <p className="text-sm font-medium text-foreground">{nextDraftReviewItem.contact.business_name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {draftsByContactId[nextDraftReviewItem.contact.id]?.subject || "Draft ready to review"}
                    </p>
                    <Link
                      to={`/contacts/${nextDraftReviewItem.contact.id}`}
                      className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-violet-700 hover:underline"
                    >
                      Open draft review
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Generate a draft from any contact detail page and it will show up here for reps to review.
                  </p>
                )}
              </div>
            </div>
            {nextPriorityItem && nextPriorityGuidance ? (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
                <p className="text-[10px] uppercase tracking-widest text-primary">Start here</p>
                <p className="mt-2 text-base font-semibold text-foreground">{nextPriorityItem.contact.business_name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {nextPriorityItem.contact.contact_person ? `${nextPriorityItem.contact.contact_person} · ` : ""}
                  {nextPriorityItem.contact.phone}
                </p>
                <p className="mt-3 text-sm font-medium text-foreground">{nextPriorityGuidance.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{nextPriorityGuidance.detail}</p>
                <p className="mt-3 text-xs text-muted-foreground">
                  {nextPriorityItem.due_date ? `Due ${new Date(nextPriorityItem.due_date).toLocaleString()}` : "No due date set"}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {!nextPriorityItem.contact.is_dnc ? (
                    <a
                      href={`tel:${nextPriorityItem.contact.phone}`}
                      className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
                    >
                      <Phone className="h-4 w-4" />
                      Call now
                    </a>
                  ) : null}
                  <Link
                    to={`/contacts/${nextPriorityItem.contact.id}`}
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    Open contact
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            ) : null}
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
                        {draftsByContactId[item.contact.id] ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest text-violet-700">
                            <Sparkles className="h-3 w-3" />
                            Draft ready
                          </span>
                        ) : null}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {item.contact.contact_person ? `${item.contact.contact_person} · ` : ""}
                        <a href={`tel:${item.contact.phone}`} className="font-medium text-foreground hover:underline">
                          {item.contact.phone}
                        </a>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {!item.contact.is_dnc ? (
                        <a
                          href={`tel:${item.contact.phone}`}
                          className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
                        >
                          <Phone className="h-3.5 w-3.5" />
                          Call now
                        </a>
                      ) : null}
                      <Link
                        to={`/contacts/${item.contact.id}`}
                        className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                      >
                        Open contact
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </div>
                  {item.title ? <div className="mt-3 text-sm text-foreground">{item.title}</div> : null}
                  {item.body ? <div className="mt-1 text-xs text-muted-foreground line-clamp-2">{item.body}</div> : null}
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>Status: {item.contact.status}</span>
                    <span>Task source: GHL</span>
                    <span>{item.due_date ? `Due: ${new Date(item.due_date).toLocaleString()}` : "Due date missing"}</span>
                    {draftsByContactId[item.contact.id] ? (
                      <span>Email draft: {draftsByContactId[item.contact.id]?.subject}</span>
                    ) : null}
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
