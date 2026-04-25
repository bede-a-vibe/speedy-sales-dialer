import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  CalendarClock,
  CalendarIcon,
  CheckCircle2,
  GraduationCap,
  PhoneMissed,
  PhoneOff,
  ThumbsDown,
  Voicemail,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { FollowUpMethodSelector } from "@/components/pipelines/FollowUpMethodSelector";
import type { FollowUpMethod } from "@/hooks/usePipelineItems";
import { CallOutcome } from "@/data/mockData";
import { cn } from "@/lib/utils";

type ScenarioOutcome = Extract<
  CallOutcome,
  "no_answer" | "voicemail" | "follow_up" | "dnc"
>;

interface ScenarioConfig {
  outcome: ScenarioOutcome;
  label: string;
  icon: typeof PhoneMissed;
  shortcut: string;
  tone: string;
  summary: string;
  systemActions: string[];
  showFollowUp: boolean;
}

const SCENARIOS: ScenarioConfig[] = [
  {
    outcome: "no_answer",
    label: "No Answer",
    icon: PhoneMissed,
    shortcut: "1",
    tone: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
    summary:
      "The line rang out — nobody picked up. The dialer treats this as the lightest-weight outcome so reps can keep pace.",
    systemActions: [
      "Increment call_attempt_count on the contact",
      "Set last_outcome = no_answer, last_called_at = now()",
      "Auto-advance the queue to the next prioritised lead",
      "No pipeline item created — contact stays in the dialer pool",
    ],
    showFollowUp: false,
  },
  {
    outcome: "voicemail",
    label: "Voicemail Left",
    icon: Voicemail,
    shortcut: "2",
    tone:
      "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300",
    summary:
      "Voicemail dropped. The contact's voicemail counter increments and the lead recycles back into the queue tomorrow.",
    systemActions: [
      "Increment voicemail_count + call_attempt_count",
      "Set last_outcome = voicemail",
      "Lead returns to the queue after the voicemail cool-down",
      "No pipeline item — but the rep's note syncs to the contact + GHL",
    ],
    showFollowUp: false,
  },
  {
    outcome: "follow_up",
    label: "Follow Up",
    icon: CalendarClock,
    shortcut: "5",
    tone:
      "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    summary:
      "The prospect asked us to call back. A Follow-up pipeline item is created and shows up on the Follow-ups page on the chosen date.",
    systemActions: [
      "Create pipeline_items row (pipeline_type = follow_up)",
      "Assign to the rep who logged the call",
      "Schedule for the date/time selected below",
      "Sync the follow-up to GHL with the chosen method (Call / Email / Prospecting)",
    ],
    showFollowUp: true,
  },
  {
    outcome: "dnc",
    label: "Do Not Call",
    icon: PhoneOff,
    shortcut: "4",
    tone: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300",
    summary:
      "Hard removal. The contact is flagged is_dnc = true and is permanently excluded from every future dialer queue.",
    systemActions: [
      "Set contacts.is_dnc = true + last_outcome = dnc",
      "Filtered out of every dialer RPC by default",
      "Mirrored to GHL as DNC so the master CRM agrees",
      "Cannot be re-added without an admin override",
    ],
    showFollowUp: false,
  },
];

const DEMO_CONTACT = {
  business_name: "Coach Demo Plumbing",
  contact_person: "Alex Rivera",
  phone: "+61 400 555 042",
  industry: "Plumbers",
  city: "Brisbane",
  state: "QLD",
};

function nextBusinessDay(base = new Date()) {
  const next = new Date(base);
  do {
    next.setDate(next.getDate() + 1);
  } while (next.getDay() === 0 || next.getDay() === 6);
  next.setHours(10, 0, 0, 0);
  return next;
}

interface ScenarioModeProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ScenarioMode({ open, onOpenChange }: ScenarioModeProps) {
  const [active, setActive] = useState<ScenarioOutcome>("no_answer");
  const [logged, setLogged] = useState<ScenarioOutcome | null>(null);
  const [note, setNote] = useState("");
  const [followUpDate, setFollowUpDate] = useState<Date>(() => nextBusinessDay());
  const [followUpTime, setFollowUpTime] = useState("10:00");
  const [followUpMethod, setFollowUpMethod] = useState<FollowUpMethod>("call");

  const scenario = useMemo(
    () => SCENARIOS.find((s) => s.outcome === active) ?? SCENARIOS[0],
    [active],
  );

  // Reset transient log state when switching scenarios or opening fresh
  useEffect(() => {
    setLogged(null);
  }, [active]);

  useEffect(() => {
    if (!open) {
      setActive("no_answer");
      setLogged(null);
      setNote("");
      setFollowUpDate(nextBusinessDay());
      setFollowUpTime("10:00");
      setFollowUpMethod("call");
    }
  }, [open]);

  const handleLog = () => {
    setLogged(active);
  };

  const followUpPreview = scenario.showFollowUp
    ? `${format(followUpDate, "EEE, d MMM yyyy")} at ${followUpTime} · ${
        followUpMethod === "call"
          ? "Phone call"
          : followUpMethod === "email"
            ? "Email touch"
            : "Prospecting task"
      }`
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-amber-500" />
            Scenario Mode — practice call outcomes
          </DialogTitle>
          <DialogDescription>
            Walk through each disposition end-to-end. Nothing here writes to the
            database, syncs to GHL, or places a real call.
          </DialogDescription>
        </DialogHeader>

        {/* Demo contact card */}
        <div className="rounded-lg border border-border bg-muted/30 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-widest text-muted-foreground">
                Practice contact
              </p>
              <p className="text-base font-semibold">{DEMO_CONTACT.business_name}</p>
              <p className="text-sm text-muted-foreground">
                {DEMO_CONTACT.contact_person} · {DEMO_CONTACT.phone}
              </p>
            </div>
            <Badge variant="secondary">
              {DEMO_CONTACT.industry} · {DEMO_CONTACT.city}, {DEMO_CONTACT.state}
            </Badge>
          </div>
        </div>

        {/* Scenario picker */}
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            Choose an outcome to practice
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {SCENARIOS.map((s) => {
              const Icon = s.icon;
              const isActive = s.outcome === active;
              return (
                <button
                  key={s.outcome}
                  type="button"
                  onClick={() => setActive(s.outcome)}
                  className={cn(
                    "flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-all",
                    "hover:scale-[1.01] active:scale-[0.99]",
                    isActive
                      ? s.tone
                      : "border-border bg-card text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{s.label}</span>
                  <kbd className="ml-auto rounded bg-background/40 px-1.5 py-0.5 font-mono text-[10px] opacity-60">
                    {s.shortcut}
                  </kbd>
                </button>
              );
            })}
          </div>
        </div>

        {/* Scenario detail */}
        <div className="space-y-4 rounded-lg border border-border bg-card p-4">
          <div className={cn("rounded-md border px-3 py-2 text-sm", scenario.tone)}>
            {scenario.summary}
          </div>

          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">
              What the system would do
            </p>
            <ul className="mt-2 space-y-1 text-sm">
              {scenario.systemActions.map((action) => (
                <li key={action} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  <span>{action}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Note (always shown — reps tag every call) */}
          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-widest text-muted-foreground">
              Call note
            </label>
            <Textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={
                scenario.outcome === "dnc"
                  ? "e.g. Asked to be removed from list. Confirmed across all numbers."
                  : scenario.outcome === "follow_up"
                    ? "e.g. Owner busy on a job — call back Wednesday morning."
                    : scenario.outcome === "voicemail"
                      ? "e.g. Left voicemail with name + value prop, will retry tomorrow."
                      : "e.g. Rang out, no voicemail. Try the DM phone next."
              }
              rows={3}
            />
          </div>

          {/* Follow-up scheduler — only for follow_up outcome */}
          {scenario.showFollowUp && (
            <div className="space-y-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-amber-700 dark:text-amber-300">
                Follow-up scheduling
              </p>

              <FollowUpMethodSelector
                value={followUpMethod}
                onChange={setFollowUpMethod}
              />

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs text-muted-foreground">Date</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="mt-1 w-full justify-start text-left font-normal"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {format(followUpDate, "EEE, d MMM yyyy")}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={followUpDate}
                        onSelect={(date) => date && setFollowUpDate(date)}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Time</label>
                  <Input
                    type="time"
                    value={followUpTime}
                    onChange={(event) => setFollowUpTime(event.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>

              {followUpPreview && (
                <p className="text-xs text-muted-foreground">
                  Would schedule: <span className="font-medium">{followUpPreview}</span>
                </p>
              )}
            </div>
          )}

          {/* Action row */}
          <div className="flex items-center justify-between gap-3 pt-2">
            <p className="text-xs text-muted-foreground">
              {logged
                ? "Logged in scenario mode — nothing was written."
                : "Press “Log Outcome” to see the simulated result."}
            </p>
            <Button onClick={handleLog} variant={logged ? "secondary" : "default"}>
              {logged ? "✓ Logged (demo)" : `Log ${scenario.label}`}
            </Button>
          </div>

          {logged && (
            <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
              <p className="font-medium">Simulated result</p>
              <p className="mt-0.5 text-xs">
                {logged === "follow_up"
                  ? `A follow-up would now appear on the Follow-ups page for ${format(
                      followUpDate,
                      "EEE, d MMM",
                    )} at ${followUpTime}.`
                  : logged === "dnc"
                    ? "The contact would be flagged DNC and excluded from every future queue."
                    : logged === "voicemail"
                      ? "Voicemail counted, lead recycled back into the queue."
                      : "No-answer logged, queue advances to the next lead."}
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close scenario mode
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ScenarioMode;