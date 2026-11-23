import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format, formatDistanceToNowStrict } from "date-fns";
import { CalendarPlus, Check, ChevronDown, Clock3, MoreHorizontal, Phone, Plus, Search, ThumbsDown, UserRoundCheck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QuickBookDialog } from "@/components/QuickBookDialog";
import { ListRowsSkeleton } from "@/components/skeletons/PageSkeletons";
import { NewTaskDialog } from "@/components/tasks/NewTaskDialog";
import { useAuth } from "@/hooks/useAuth";
import type { Contact } from "@/hooks/useContacts";
import { useDialpadCall } from "@/hooks/useDialpad";
import { useMyDialpadSettings } from "@/hooks/useDialpadSettings";
import type { SalesRepOption } from "@/hooks/usePipelineItems";
import { useLastCalls, useTodoActions, useTodoDetail, useTodoList } from "@/hooks/useTodoList";
import { useAdminAccess } from "@/hooks/useUserRole";
import { supabase } from "@/integrations/supabase/client";
import { getOutcomeReasonLabel } from "@/lib/appointments";
import { describeWindowReason, evaluateCallingWindow } from "@/lib/callingCompliance";
import { resolveDialTarget } from "@/lib/dialTarget";
import { TODO_OLD_DAYS, workingMorning, type TodoItem, type TodoKind } from "@/lib/todoList";
import { cn } from "@/lib/utils";

type Filter = "all" | "no_show" | "cancelled" | "follow_up";

const KIND: Record<TodoKind, { label: string; plural: string; cls: string }> = {
  no_show: { label: "No-show", plural: "No-shows", cls: "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  cancelled: { label: "Cancelled", plural: "Cancelled", cls: "border-destructive/50 bg-destructive/10 text-destructive" },
  follow_up: { label: "Follow-up", plural: "Follow-ups", cls: "border-primary/50 bg-primary/10 text-primary" },
  moved: { label: "Moved", plural: "Moved meetings", cls: "border-border bg-muted text-muted-foreground" },
};

const PAGE_SIZE = 25;
const day = (iso: string) => format(new Date(iso), "EEE d MMM");
const ago = (iso: string) => formatDistanceToNowStrict(new Date(iso), { addSuffix: true });

/** Booking templates leave empty prompts behind; none of them tell a rep anything. */
function usefulNote(text: string | null | undefined) {
  return (text ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !/^(next step|reason for follow-up):$/i.test(l) && !/^auto follow-up:/i.test(l) && !/^rebook (no-show|cancelled meeting)$/i.test(l))
    .join(" · ");
}

function whatHappened(item: TodoItem): string {
  if (item.kind === "follow_up") {
    const auto = item.followUp?.notes?.match(/^Auto follow-up: (Verbal commitment|No show)/i)?.[1];
    const why = auto ? (auto.toLowerCase().startsWith("verbal") ? "Said yes, not signed · " : "Earlier no-show · ") : "";
    return item.at ? `${why}Due ${day(item.at)}` : `${why}No date`;
  }
  if (!item.at) return KIND[item.kind].label;
  if (item.kind === "moved") return `Now ${format(new Date(item.at), "EEE d MMM, h:mmaaa")}. Confirm the day before`;
  const reason = getOutcomeReasonLabel(item.booking?.outcome_reason);
  return `${item.kind === "no_show" ? "Missed" : "Was booked for"} ${day(item.at)}${reason ? ` · ${reason}` : ""}`;
}

function Details({ item, reps, onReassign, canReassign }: {
  item: TodoItem; reps: SalesRepOption[]; canReassign: boolean; onReassign: (to: string) => void;
}) {
  const { data, isLoading, isError } = useTodoDetail(item.contact.id, true);
  if (isLoading) return <p className="text-xs text-muted-foreground">Loading…</p>;
  if (isError) return <p className="text-xs text-destructive">Could not load what they told us.</p>;
  const f = data?.facts;
  const facts = [
    ["Buying signal", f?.buying_signal_strength],
    ["Budget", f?.budget_indication],
    ["Timeline", f?.buying_timeline],
    ["Agreed next step", f?.agreed_next_steps],
    ["Current agency", [f?.existing_agency_name, f?.existing_agency_services].filter(Boolean).join(" · ")],
  ].filter((r): r is [string, string] => Boolean(r[1]));
  const said = data?.call?.dialpad_summary?.trim() || data?.call?.notes?.trim();
  const empty = !f?.key_quote && facts.length === 0 && !said && !data?.notes.length && !item.booking?.outcome_notes;
  return (
    <div className="space-y-2 text-xs">
      {item.booking?.outcome_notes ? <p><span className="text-muted-foreground">Meeting note: </span>{item.booking.outcome_notes}</p> : null}
      {f?.key_quote ? <p className="italic">"{f.key_quote}"</p> : null}
      {facts.map(([label, value]) => (
        <p key={label}><span className="text-muted-foreground">{label}: </span>{value}</p>
      ))}
      {said && data?.call ? (
        <p className="whitespace-pre-line"><span className="text-muted-foreground">Last call {format(new Date(data.call.created_at), "d MMM")}: </span>{said}</p>
      ) : null}
      {data?.notes.map((n) => (
        <p key={n.id} className="line-clamp-4 whitespace-pre-line"><span className="text-muted-foreground">Note {format(new Date(n.created_at), "d MMM")}: </span>{n.content}</p>
      ))}
      {empty ? <p className="text-muted-foreground">Nothing recorded from the call.</p> : null}
      {canReassign && item.kind === "follow_up" ? (
        <div className="flex items-center gap-2 pt-1">
          <UserRoundCheck className="h-3.5 w-3.5 text-muted-foreground" />
          <Select value={item.ownerId} onValueChange={onReassign}>
            <SelectTrigger className="h-8 w-[200px] bg-background text-xs" aria-label="Hand to"><SelectValue placeholder="Hand to" /></SelectTrigger>
            <SelectContent>
              {reps.map((r) => <SelectItem key={r.user_id} value={r.user_id}>{r.display_name || r.email?.split("@")[0] || "Unknown"}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      ) : null}
    </div>
  );
}

function TodoRow({ item, lastCall, ownerName, reps, busy, canReassign, onCall, onBook, onLater, onPickDate, onDone, onNotInterested, onReassign }: {
  item: TodoItem;
  lastCall: string | undefined;
  ownerName: string | null;
  reps: SalesRepOption[];
  busy: boolean;
  canReassign: boolean;
  onCall: () => void;
  onBook: () => void;
  onLater: (at: Date) => void;
  onPickDate: () => void;
  onDone: () => void;
  onNotInterested: () => void;
  onReassign: (to: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const c = item.contact;
  const isRebook = item.kind === "no_show" || item.kind === "cancelled";
  const person = c.contact_person || c.dm_name;
  const place = [c.city, c.state].filter(Boolean).join(", ");
  const number = resolveDialTarget(c).number;
  const context = c.key_quote || usefulNote(item.followUp?.notes);
  const calledSince = Boolean(lastCall && item.at && lastCall > item.at);

  return (
    <li className="rounded-lg border border-border bg-card p-3" data-testid="todo-row">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <button type="button" className="min-w-0 flex-1 basis-64 text-left" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={cn("text-[10px]", KIND[item.kind].cls)}>{KIND[item.kind].label}</Badge>
            <span className="truncate text-sm font-semibold text-foreground">{c.business_name || "Unknown business"}</span>
            <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {[person, c.industry, place, ownerName].filter(Boolean).join(" · ")}
          </p>
          <p className="mt-0.5 text-xs text-foreground">
            {whatHappened(item)}
            {isRebook ? (
              <span className={calledSince ? "text-muted-foreground" : "font-medium text-amber-700 dark:text-amber-300"}>
                {calledSince ? ` · Called ${ago(lastCall!)}` : " · No call logged since"}
              </span>
            ) : lastCall ? <span className="text-muted-foreground"> · Last call {ago(lastCall)}</span> : null}
            {isRebook && item.dueAt && item.when === "later" ? <span className="text-muted-foreground"> · Back {day(item.dueAt)}</span> : null}
          </p>
          {context && !open ? <p className="mt-0.5 line-clamp-1 text-xs italic text-muted-foreground">{context}</p> : null}
        </button>

        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" onClick={onCall} disabled={!number || busy} title={number ?? "No phone number"}>
            <Phone className="h-3.5 w-3.5" />Call
          </Button>
          {item.kind !== "moved" ? (
            <>
              <Button size="sm" variant="outline" onClick={onBook} disabled={busy}>
                <CalendarPlus className="h-3.5 w-3.5" />{isRebook ? "Rebook" : "Book"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => onLater(workingMorning(1))} disabled={busy} title="Back on your list next working day at 9am">
                No answer
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" disabled={busy}><Clock3 className="h-3.5 w-3.5" />Later</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onLater(workingMorning(1))}>Next working day</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onLater(workingMorning(3))}>In 3 days</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onLater(workingMorning(7))}>Next week</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onLater(workingMorning(30))}>In a month</DropdownMenuItem>
                  <DropdownMenuItem onClick={onPickDate}>Pick a date</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              {item.kind === "follow_up" ? (
                <Button size="sm" variant="outline" onClick={onDone} disabled={busy}><Check className="h-3.5 w-3.5" />Done</Button>
              ) : null}
            </>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" className="h-9 w-9" aria-label="More"><MoreHorizontal className="h-4 w-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild><Link to={`/contacts/${c.id}`}>Open contact</Link></DropdownMenuItem>
              {item.kind !== "moved" ? (
                <DropdownMenuItem onClick={onNotInterested} disabled={busy} className="text-destructive focus:text-destructive">
                  <ThumbsDown className="mr-2 h-3.5 w-3.5" />Not interested
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {open ? (
        <div className="mt-3 rounded-md border border-border/60 bg-muted/40 p-3">
          <Details item={item} reps={reps} canReassign={canReassign} onReassign={onReassign} />
        </div>
      ) : null}
    </li>
  );
}

function Section({ title, hint, items, render, startOpen = true }: {
  title: string; hint?: string; items: TodoItem[]; render: (item: TodoItem) => JSX.Element; startOpen?: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  const [limit, setLimit] = useState(PAGE_SIZE);
  if (items.length === 0) return null;
  return (
    <section className="space-y-2">
      <button type="button" className="flex w-full items-center gap-2 text-left" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", !open && "-rotate-90")} />
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
        <span className="font-mono text-xs text-muted-foreground">{items.length}</span>
        {hint ? <span className="hidden truncate text-xs text-muted-foreground sm:inline">{hint}</span> : null}
      </button>
      {open ? (
        <>
          <ul className="space-y-2">{items.slice(0, limit).map(render)}</ul>
          {items.length > limit ? (
            <Button variant="ghost" size="sm" onClick={() => setLimit((n) => n + PAGE_SIZE)}>Show {Math.min(PAGE_SIZE, items.length - limit)} more</Button>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

export function TodoPanel({ reps, repMap, initialFilter = "all" }: { reps: SalesRepOption[]; repMap: Map<string, string>; initialFilter?: Filter }) {
  const { user } = useAuth();
  const { canViewAdmin, canWrite } = useAdminAccess();
  const [rep, setRep] = useState("me");
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [search, setSearch] = useState("");
  const [bookContact, setBookContact] = useState<Contact | null>(null);
  const [newTask, setNewTask] = useState(false);
  const [dating, setDating] = useState<TodoItem | null>(null);

  const ownerId = rep === "all" ? null : rep === "me" ? user?.id : rep;
  const { data: items = [], isLoading, isError, refetch } = useTodoList(ownerId);
  const actions = useTodoActions(user?.id);
  const dialpadCall = useDialpadCall();
  const { data: dialpad } = useMyDialpadSettings();

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((i) =>
      [i.contact.business_name, i.contact.contact_person, i.contact.dm_name, i.contact.phone, i.contact.city]
        .filter(Boolean).join(" ").toLowerCase().includes(needle));
  }, [items, search]);

  const { data: lastCalls } = useLastCalls(useMemo(() => items.map((i) => i.contact.id), [items]));

  const matches = (i: TodoItem) => filter === "all" || i.kind === filter;
  const due = shown.filter((i) => i.when === "due");
  const count = (k: TodoKind) => due.filter((i) => i.kind === k).length;
  const visibleDue = due.filter(matches);
  const later = shown.filter((i) => i.when === "later" && matches(i));
  const old = shown.filter((i) => i.when === "old" && matches(i));

  const run = async (label: string, action: () => Promise<() => Promise<void>>) => {
    try {
      const undo = await action();
      toast.success(label, {
        action: {
          label: "Undo",
          onClick: () => {
            undo().then(() => toast.success("Put back.")).catch(() => toast.error("Could not undo.")).finally(() => actions.refresh());
          },
        },
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That did not save. Try again.");
    }
  };

  const name = (i: TodoItem) => i.contact.business_name || "Lead";
  const pushLater = (item: TodoItem, at: Date) =>
    run(`${name(item)} is back ${format(at, "EEE d MMM, h:mmaaa")}.`, () => actions.later.mutateAsync({ item, at }));

  const call = async (item: TodoItem) => {
    const { number } = resolveDialTarget(item.contact);
    if (!number) return toast.error("No phone number on this lead.");
    const window = evaluateCallingWindow(item.contact.state ?? null);
    if (!window.allowed) return toast.error(describeWindowReason(window, item.contact.state ?? null));
    if (!dialpad?.dialpad_user_id) return toast.error("Connect your Dialpad number in Dialpad Settings first.");
    try {
      await dialpadCall.mutateAsync({ phone: number, dialpad_user_id: dialpad.dialpad_user_id, contact_id: item.contact.id });
      toast.success(`Calling ${name(item)} on your Dialpad.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't start the call.");
    }
  };

  const book = async (item: TodoItem) => {
    const { data, error } = await supabase.from("contacts").select("*").eq("id", item.contact.id).maybeSingle();
    if (error || !data) return toast.error("Could not open the booking. Try again.");
    setBookContact(data as Contact);
  };

  const renderRow = (item: TodoItem) => (
    <TodoRow
      key={item.key}
      item={item}
      lastCall={lastCalls?.get(item.contact.id)}
      ownerName={rep === "all" ? repMap.get(item.ownerId) ?? null : null}
      reps={reps}
      busy={actions.busy || dialpadCall.isPending || !canWrite}
      canReassign={canViewAdmin && canWrite}
      onCall={() => void call(item)}
      onBook={() => void book(item)}
      onLater={(at) => void pushLater(item, at)}
      onPickDate={() => setDating(item)}
      onDone={() => void run(`${name(item)} done.`, () => actions.done.mutateAsync({ item }))}
      onNotInterested={() => void run(`${name(item)} marked not interested.`, () => actions.notInterested.mutateAsync({ item }))}
      onReassign={(to) => void run(`${name(item)} handed over.`, () => actions.reassign.mutateAsync({ item, to }))}
    />
  );

  const chips: { key: Filter; label: string; n: number }[] = [
    { key: "all", label: "All", n: due.length },
    { key: "no_show", label: "No-shows", n: count("no_show") },
    { key: "cancelled", label: "Cancelled", n: count("cancelled") },
    { key: "follow_up", label: "Follow-ups", n: count("follow_up") },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show">
          {chips.map((c) => (
            <Button key={c.key} size="sm" variant={filter === c.key ? "default" : "outline"} aria-pressed={filter === c.key} onClick={() => setFilter(c.key)}>
              {c.label}<span className="ml-1 font-mono text-xs opacity-80">{c.n}</span>
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" className="h-9 w-[150px] bg-background pl-7" />
          </div>
          {canViewAdmin ? (
            <Select value={rep} onValueChange={setRep}>
              <SelectTrigger className="h-9 w-[150px] bg-background" aria-label="Whose list"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="me">My list</SelectItem>
                <SelectItem value="all">Everyone</SelectItem>
                {reps.filter((r) => r.user_id !== user?.id).map((r) => (
                  <SelectItem key={r.user_id} value={r.user_id}>{r.display_name || r.email?.split("@")[0] || "Unknown"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <Button size="sm" variant="outline" onClick={() => setNewTask(true)}><Plus className="h-3.5 w-3.5" />New task</Button>
        </div>
      </div>

      {isLoading ? <ListRowsSkeleton rows={6} /> : isError ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
          Your list did not load. <button type="button" className="font-medium underline" onClick={() => void refetch()}>Try again</button>
        </div>
      ) : (
        <div className="space-y-6" key={`${rep}:${filter}`}>
          {visibleDue.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
              {search ? "Nothing matches that search." : "All clear. Nothing to chase right now."}
            </div>
          ) : null}
          <Section title="Rebook: no-shows" hint="Call while the reason is fresh" items={visibleDue.filter((i) => i.kind === "no_show")} render={renderRow} />
          <Section title="Rebook: cancelled" hint="Get the real reason, offer two new times" items={visibleDue.filter((i) => i.kind === "cancelled")} render={renderRow} />
          <Section title="Follow-ups due" items={visibleDue.filter((i) => i.kind === "follow_up")} render={renderRow} />
          <Section title="Coming up" items={later} render={renderRow} startOpen={Boolean(search)} key={`later:${Boolean(search)}`} />
          <Section title={`Older than ${TODO_OLD_DAYS} days`} items={old} render={renderRow} startOpen={Boolean(search)} key={`old:${Boolean(search)}`} />
        </div>
      )}

      <QuickBookDialog
        open={bookContact !== null}
        onOpenChange={(open) => {
          if (!open) {
            setBookContact(null);
            actions.refresh();
          }
        }}
        initialContact={bookContact}
        initialPipelineType="booked"
      />
      <NewTaskDialog open={newTask} onOpenChange={(open) => { setNewTask(open); if (!open) actions.refresh(); }} />
      <Dialog open={dating !== null} onOpenChange={(open) => { if (!open) setDating(null); }}>
        <DialogContent className="w-auto">
          <DialogHeader><DialogTitle>Back on the list</DialogTitle></DialogHeader>
          <Calendar
            mode="single"
            disabled={{ before: new Date(Date.now() + 86_400_000) }}
            onSelect={(d) => {
              if (!d || !dating) return;
              const at = new Date(d);
              at.setHours(9, 0, 0, 0);
              void pushLater(dating, at);
              setDating(null);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
