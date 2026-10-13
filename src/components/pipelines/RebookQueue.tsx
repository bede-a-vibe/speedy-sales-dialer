import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNowStrict } from "date-fns";
import { CalendarPlus, ExternalLink, Phone, Quote, RefreshCw, Search, UserX, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QuickBookDialog } from "@/components/QuickBookDialog";
import { ListRowsSkeleton } from "@/components/skeletons/PageSkeletons";
import { getOutcomeReasonLabel } from "@/lib/appointments";
import { REBOOK_LOOKBACK_DAYS, useRebookQueue, type RebookBucket, type RebookQueueItem } from "@/hooks/useRebookQueue";
import type { Contact } from "@/hooks/useContacts";
import type { SalesRepOption } from "@/hooks/usePipelineItems";
import { cn } from "@/lib/utils";

type BucketMeta = {
  key: RebookBucket;
  title: string;
  description: string;
  tone: string;
  Icon: typeof UserX;
};

const BUCKETS: BucketMeta[] = [
  {
    key: "no_show",
    title: "No-shows",
    description: "Booked, did not turn up, nothing rebooked yet. Call within 48 hours while the reason is still fresh.",
    tone: "border-amber-500/40 bg-amber-500/5",
    Icon: UserX,
  },
  {
    key: "cancelled",
    title: "Cancelled",
    description: "Pulled out before the slot but still a live lead. Get the real reason, then offer two new times.",
    tone: "border-destructive/40 bg-destructive/5",
    Icon: XCircle,
  },
  {
    key: "rescheduled",
    title: "Rescheduled, still to sit",
    description: "Moved at least once. Moved meetings show up less often, so confirm the day before.",
    tone: "border-primary/40 bg-primary/5",
    Icon: RefreshCw,
  },
];

function toContact(item: RebookQueueItem): Contact {
  return {
    ...item.contact,
    latest_appointment_outcome: item.appointment_outcome,
    latest_appointment_scheduled_for: item.scheduled_for,
    latest_appointment_recorded_at: item.outcome_recorded_at,
  } as Contact;
}

function telHref(phone: string | null | undefined) {
  if (!phone) return null;
  const digits = phone.replace(/[^\d+]/g, "");
  return digits ? `tel:${digits}` : null;
}

function whenLabel(iso: string | null) {
  if (!iso) return "no date";
  const date = new Date(iso);
  return `${format(date, "EEE d MMM, h:mmaaa")} (${formatDistanceToNowStrict(date, { addSuffix: true })})`;
}

function Clamp({ text, limit = 260 }: { text: string; limit?: number }) {
  const [open, setOpen] = useState(false);
  const trimmed = text.trim();
  if (trimmed.length <= limit) return <span className="whitespace-pre-line">{trimmed}</span>;
  return (
    <span className="whitespace-pre-line">
      {open ? trimmed : `${trimmed.slice(0, limit).trimEnd()}…`}{" "}
      <button type="button" className="font-medium text-primary underline-offset-2 hover:underline" onClick={() => setOpen((v) => !v)}>
        {open ? "less" : "more"}
      </button>
    </span>
  );
}

function RebookCard({
  item,
  repMap,
  onRebook,
}: {
  item: RebookQueueItem;
  repMap: Map<string, string>;
  onRebook: (item: RebookQueueItem) => void;
}) {
  const contact = item.contact;
  const personName = contact.contact_person || contact.dm_name || null;
  const phone = contact.dm_phone || contact.phone;
  const tel = telHref(phone);
  const reason = getOutcomeReasonLabel(item.outcome_reason);
  const place = [contact.city, contact.state].filter(Boolean).join(", ");
  const setter = repMap.get(item.created_by) || "Unknown";
  const closer = repMap.get(item.assigned_user_id) || "Unknown";

  const facts = [
    contact.buying_signal_strength ? { label: "Buying signal", value: contact.buying_signal_strength } : null,
    contact.budget_indication ? { label: "Budget", value: contact.budget_indication } : null,
    contact.buying_timeline ? { label: "Timeline", value: contact.buying_timeline } : null,
    contact.agreed_next_steps ? { label: "Agreed next step", value: contact.agreed_next_steps } : null,
    contact.existing_agency_name
      ? { label: "Current agency", value: [contact.existing_agency_name, contact.existing_agency_services].filter(Boolean).join(" · ") }
      : null,
  ].filter((fact): fact is { label: string; value: string } => Boolean(fact));
  const callSummary = item.lastCall?.dialpad_summary?.trim() || item.lastCall?.notes?.trim() || null;
  const hasPains = Boolean(contact.key_quote) || facts.length > 0 || Boolean(callSummary) || item.notes.length > 0;

  const slotLine =
    item.bucket === "rescheduled"
      ? `Sits ${whenLabel(item.scheduled_for)}`
      : item.bucket === "cancelled"
        ? `Cancelled slot was ${whenLabel(item.scheduled_for)}`
        : `Missed ${whenLabel(item.scheduled_for)}`;

  return (
    <article className="rounded-lg border border-border bg-card p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link to={`/contacts/${item.contact_id}`} className="block truncate text-sm font-semibold text-foreground hover:underline">
            {contact.business_name || "Unknown business"}
          </Link>
          <p className="truncate text-xs text-muted-foreground">
            {personName ?? "No contact name"}
            {contact.industry ? ` · ${contact.industry}` : ""}
            {place ? ` · ${place}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1">
          {item.is_qualified === true ? (
            <Badge variant="outline" className="border-emerald-500/50 text-[10px] text-emerald-700 dark:text-emerald-300">
              Qualified
            </Badge>
          ) : null}
          {item.reschedule_count > 0 ? (
            <Badge variant="outline" className="text-[10px]">
              Moved {item.reschedule_count}×
            </Badge>
          ) : null}
          {item.missedCount > 1 ? (
            <Badge variant="outline" className="border-amber-500/50 text-[10px] text-amber-700 dark:text-amber-300">
              Missed {item.missedCount} of {item.bookingsCount}
            </Badge>
          ) : null}
        </div>
      </div>

      <div className="mt-2 space-y-1 text-xs">
        <p className="font-mono text-foreground">{slotLine}</p>
        {reason ? (
          <p className="text-muted-foreground">
            Reason: <span className="text-foreground">{reason}</span>
          </p>
        ) : null}
        {item.outcome_notes ? (
          <p className="text-muted-foreground">
            <Clamp text={item.outcome_notes} limit={160} />
          </p>
        ) : null}
        {item.followUpDue ? (
          <p className="text-muted-foreground">
            Follow-up task due <span className="text-foreground">{format(new Date(item.followUpDue), "EEE d MMM")}</span>
          </p>
        ) : null}
        <p className="text-muted-foreground">
          Set by {setter} · Closer {closer}
        </p>
      </div>

      <div className="mt-3 rounded-md border border-border/60 bg-muted/40 p-2.5 text-xs">
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">What they told us</p>
        {hasPains ? (
          <div className="space-y-2">
            {contact.key_quote ? (
              <p className="flex gap-1.5 italic text-foreground">
                <Quote className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                <span>
                  <Clamp text={contact.key_quote} limit={220} />
                </span>
              </p>
            ) : null}
            {facts.length > 0 ? (
              <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
                {facts.map((fact) => (
                  <div key={fact.label} className="contents">
                    <dt className="text-muted-foreground">{fact.label}</dt>
                    <dd className="text-foreground">{fact.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {callSummary && item.lastCall ? (
              <p className="text-foreground">
                <span className="text-muted-foreground">Last call {format(new Date(item.lastCall.created_at), "d MMM")}: </span>
                <Clamp text={callSummary} />
              </p>
            ) : null}
            {item.notes.map((note) => (
              <p key={note.id} className="text-foreground">
                <span className="text-muted-foreground">Note {format(new Date(note.created_at), "d MMM")}: </span>
                <Clamp text={note.content} limit={200} />
              </p>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground">Nothing captured on the call. Open the contact and check GHL before you ring.</p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => onRebook(item)}>
          <CalendarPlus className="h-3.5 w-3.5" />
          Rebook
        </Button>
        {tel ? (
          <Button size="sm" variant="outline" asChild>
            <a href={tel}>
              <Phone className="h-3.5 w-3.5" />
              {phone}
            </a>
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">No phone on file</span>
        )}
        <Button size="sm" variant="ghost" asChild className="ml-auto">
          <Link to={`/contacts/${item.contact_id}`}>
            Contact
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
    </article>
  );
}

export function RebookQueue({ reps, repMap }: { reps: SalesRepOption[]; repMap: Map<string, string> }) {
  const queryClient = useQueryClient();
  const { data: items = [], isLoading } = useRebookQueue();
  const [setter, setSetter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [target, setTarget] = useState<RebookQueueItem | null>(null);
  const initialContact = useMemo(() => (target ? toContact(target) : null), [target]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return items.filter((item) => {
      if (setter !== "all" && item.created_by !== setter) return false;
      if (!needle) return true;
      const haystack = [item.contact.business_name, item.contact.contact_person, item.contact.dm_name, item.contact.phone, item.contact.city]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [items, setter, search]);

  const byBucket = useMemo(() => {
    const map = new Map<RebookBucket, RebookQueueItem[]>();
    for (const bucket of BUCKETS) map.set(bucket.key, []);
    for (const item of visible) map.get(item.bucket)?.push(item);
    return map;
  }, [visible]);

  if (isLoading) return <ListRowsSkeleton rows={6} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Rebook queue</h3>
          <p className="text-xs text-muted-foreground">
            Every lead whose latest booking in the last {REBOOK_LOOKBACK_DAYS} days was missed, cancelled or moved, with what they said on the call. Rebook
            drops out of here as soon as a new meeting is on the calendar.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search business or name" className="h-9 w-[220px] bg-background pl-7" />
          </div>
          <Select value={setter} onValueChange={setSetter}>
            <SelectTrigger className="h-9 w-[180px] bg-background">
              <SelectValue placeholder="Setter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All setters</SelectItem>
              {reps.map((rep) => (
                <SelectItem key={rep.user_id} value={rep.user_id}>
                  {rep.display_name || rep.email?.split("@")[0] || "Unknown"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs font-mono text-muted-foreground">{visible.length} to chase</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {BUCKETS.map((bucket) => {
          const list = byBucket.get(bucket.key) ?? [];
          return (
            <section key={bucket.key} className={cn("flex flex-col rounded-lg border p-3", bucket.tone)}>
              <div className="mb-3 flex items-start gap-2">
                <bucket.Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <h4 className="text-sm font-semibold text-foreground">
                    {bucket.title} <span className="font-mono text-xs text-muted-foreground">{list.length}</span>
                  </h4>
                  <p className="text-xs text-muted-foreground">{bucket.description}</p>
                </div>
              </div>
              {list.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted-foreground">Nothing here.</p>
              ) : (
                <div className="space-y-3">
                  {list.map((item) => (
                    <RebookCard key={item.id} item={item} repMap={repMap} onRebook={setTarget} />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>

      <QuickBookDialog
        open={target !== null}
        onOpenChange={(open) => {
          if (!open) {
            setTarget(null);
            queryClient.invalidateQueries({ queryKey: ["rebook-queue"] });
          }
        }}
        initialContact={initialContact}
        initialPipelineType="booked"
      />
    </div>
  );
}
