import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { CalendarClock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

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

export default function FollowUpsPage() {
  const todayIso = new Date().toISOString().slice(0, 10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<FollowUpItem[]>([]);
  const [scope, setScope] = useState<FollowUpScope>("today");
  const [anchorDate, setAnchorDate] = useState(todayIso);
  const [taskCount, setTaskCount] = useState(0);
  const [forDate, setForDate] = useState<string | null>(null);
  const emptyStateByScope: Record<FollowUpScope, string> = {
    today: "No open GHL follow-ups due today.",
    overdue: "No overdue GHL follow-ups right now.",
    week: "No open GHL follow-ups in the next 7 days.",
  };

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
          </p>
        </div>

        {loading ? <div className="text-sm text-muted-foreground">Loading follow-ups…</div> : null}
        {error ? <div className="text-sm text-destructive">{error}</div> : null}

        {!loading && !error && (
          <div className="rounded-lg border border-border bg-card divide-y">
            {items.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">{emptyStateByScope[scope]}</div>
            ) : items.map((item, idx) => (
              <div key={item.task_id ?? `${item.contact.id}:${idx}`} className="p-4">
                <div className="font-medium">{item.contact.business_name}</div>
                <div className="text-sm text-muted-foreground">
                  {item.contact.contact_person ? `${item.contact.contact_person} · ` : ""}{item.contact.phone}
                </div>
                {item.title ? <div className="mt-2 text-sm">{item.title}</div> : null}
                {item.body ? <div className="mt-1 text-xs text-muted-foreground line-clamp-2">{item.body}</div> : null}
                {item.due_date ? (
                  <div className="mt-1 text-xs text-muted-foreground">Due: {new Date(item.due_date).toLocaleString()}</div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
