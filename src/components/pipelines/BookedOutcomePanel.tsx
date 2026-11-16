import { LeadBuckets } from "@/components/contacts/LeadBuckets";
import { useState } from "react";
import { format } from "date-fns";
import { CalendarClock, DollarSign, CalendarCheck2, PhoneForwarded, Ban, Video, Phone } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { BOOKED_APPOINTMENT_DEFAULT_TIME, NO_CLOSE_REASONS, DQ_REASONS, NO_SHOW_REASONS, CANCEL_REASONS, RESCHEDULE_REASONS, PHONE_CALL_REASONS, MEETING_FORMATS, PROPOSAL_STATUSES, PROPOSAL_TASK_PREFIX, melbourneToday, nextBusinessDayAt10, reasonsForOutcome, type AppointmentOutcomeValue, type MeetingFormat, type ProposalStatus } from "@/lib/appointments";
import { MeetingRecordingMatches } from "@/components/pipelines/MeetingRecordingMatches";
import { FathomMatch } from "@/components/fathom/FathomConnect";
import { STREAM_LABELS, STREAM_ORDER, type ClientStream } from "@/lib/clientRevenue";
import { cn } from "@/lib/utils";
import type { PipelineItemWithRelations, SalesRepOption, FollowUpMethod } from "@/hooks/usePipelineItems";
import { FollowUpMethodSelector } from "@/components/pipelines/FollowUpMethodSelector";
import { GhlMirrorDetails } from "@/components/ghl/GhlMirrorDetails";
import { OpportunityDetailsSection } from "@/components/pipelines/OpportunityDetailsSection";

function combineDateTime(date: Date, time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  const next = new Date(date);
  next.setHours(hours || 0, minutes || 0, 0, 0);
  return next.toISOString();
}

/** Outcome buttons that open an inline step (reason and/or date) before saving. */
type PanelAction =
  | "reschedule" | "phone_call" | "no_show" | "cancelled"
  | "showed_no_close" | "disqualified" | "no_close_follow_up" | "second_meeting";

const ACTION_STEP: Record<PanelAction, { title: string; reasons?: readonly { value: string; label: string }[]; date?: "reschedule" | "follow_up" | "second_meeting" }> = {
  reschedule: { title: "Reschedule: why, and the new time", reasons: RESCHEDULE_REASONS, date: "reschedule" },
  phone_call: { title: "Phone call only: why it couldn't go ahead, and the rebooked time", reasons: PHONE_CALL_REASONS, date: "reschedule" },
  no_show: { title: "No show: why?", reasons: NO_SHOW_REASONS },
  cancelled: { title: "Cancelled: why?", reasons: CANCEL_REASONS },
  showed_no_close: { title: "No close: why?", reasons: NO_CLOSE_REASONS },
  disqualified: { title: "DQ: why?", reasons: DQ_REASONS },
  no_close_follow_up: { title: "No close follow-up: why, and when to follow up", reasons: NO_CLOSE_REASONS, date: "follow_up" },
  second_meeting: { title: "Second meeting: pick the day and time", date: "second_meeting" },
};

function DateTimePick({ date, onDate, time, onTime, placeholder }: {
  date: Date | undefined; onDate: (d: Date | undefined) => void; time: string; onTime: (t: string) => void; placeholder: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className={cn("justify-start bg-background", !date && "text-muted-foreground")}>
            <CalendarClock className="h-4 w-4" />
            {date ? format(date, "PPP") : placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={date}
            onSelect={onDate}
            disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
            initialFocus
            className="p-3 pointer-events-auto"
          />
        </PopoverContent>
      </Popover>
      <Input type="time" value={time} onChange={(e) => onTime(e.target.value)} className="w-[120px] bg-background" />
    </div>
  );
}

export interface OutcomeExtras {
  reason?: string | null;
  recordingUrl?: string | null;
  phoneRecordingUrl?: string | null;
  /** What was sold. Required to open the client_deals row on a close. */
  stream?: ClientStream | null;
  /**
   * More than one service sold: each service's monthly amount (already
   * normalised to monthly). The close opens one revenue record per service.
   */
  streamAmounts?: Partial<Record<ClientStream, number>> | null;
  /** Whether the offer was pitched on this sitting (null = not recorded). */
  pitched?: boolean | null;
}

/** Sat outcomes that need Pitched / Not pitched before they save. Close is always pitched. */
const PITCH_REQUIRED = new Set<AppointmentOutcomeValue>([
  "showed_verbal_commitment", "showed_no_close", "no_close_follow_up", "second_meeting_booked",
]);

interface BookedOutcomePanelProps {
  item: PipelineItemWithRelations;
  reps: SalesRepOption[];
  isSaving: boolean;
  onAssign?: (id: string, userId: string) => Promise<void>;
  onRecordOutcome: (
    item: PipelineItemWithRelations,
    outcome: AppointmentOutcomeValue,
    notes: string,
    scheduledFor?: string,
    dealValue?: number,
    followUpDate?: string,
    followUpMethod?: FollowUpMethod,
    monthlyValue?: number,
    extras?: OutcomeExtras,
  ) => Promise<void>;
  onSaveLinks?: (item: PipelineItemWithRelations, extras: OutcomeExtras) => Promise<void>;
}

/** Query roots whose data includes a booking's is_qualified verdict. */
const QUALIFICATION_QUERY_ROOTS = new Set([
  "pipeline-items", "booked-appointments-range", "rebook-queue", "source-funnel", "rep-meeting-stats",
  "meetings-pending", "meetings-upcoming", "meetings-recent", "client-meetings", "close-tracking",
  "my-sales-closes", "session-summary-booked", "call-library",
]);

export function BookedOutcomePanel({ item, reps, isSaving, onAssign, onRecordOutcome, onSaveLinks }: BookedOutcomePanelProps) {
  const [reason, setReason] = useState<string>(item.outcome_reason ?? "");
  const qc = useQueryClient();
  const [qualified, setQualified] = useState<boolean | null>((item as any).is_qualified ?? null);
  const [dqReason, setDqReason] = useState<string>((item as any).dq_reason ?? "");
  const saveQualified = async (q: boolean | null, why: string | null) => {
    const { error } = await supabase.from("pipeline_items").update({ is_qualified: q, dq_reason: q === false ? why : null } as any).eq("id", item.id);
    if (error) { toast.error(error.message); return; }
    // Targeted: only queries that read booking qualification. A bare
    // invalidateQueries() refetched every active query in the app.
    qc.invalidateQueries({ predicate: (q) => QUALIFICATION_QUERY_ROOTS.has(String(q.queryKey[0])) });
    toast.success(q == null ? "Qualification cleared" : q ? "Marked qualified" : "Marked not qualified");
  };
  // The Not-qualified reason doubles as the outcome reason when none is picked.
  const effReason = reason || (qualified === false ? dqReason : "");
  const [recordingUrl, setRecordingUrl] = useState(item.recording_url ?? "");
  const [phoneRecordingUrl, setPhoneRecordingUrl] = useState(item.phone_recording_url ?? "");
  const extras = (): OutcomeExtras => ({
    reason: effReason || null,
    recordingUrl: recordingUrl.trim() || null,
    phoneRecordingUrl: phoneRecordingUrl.trim() || null,
    stream,
    pitched,
  });
  /** No Close / DQ can't be saved without a reason that matches the outcome. */
  const reasonOk = (outcome: AppointmentOutcomeValue) => {
    const allowed = reasonsForOutcome(outcome);
    if (!allowed) return true;
    if (allowed.some((r) => r.value === effReason)) return true;
    const which: Partial<Record<AppointmentOutcomeValue, string>> = {
      disqualified: "a DQ", no_show: "a no-show", cancelled: "a cancellation", rescheduled: "a reschedule",
    };
    toast.error(`Pick ${which[outcome] ?? "a no-close"} reason first.`);
    return false;
  };
  const [rescheduleDate, setRescheduleDate] = useState<Date | undefined>(
    item.scheduled_for ? new Date(item.scheduled_for) : undefined,
  );
  const [rescheduleTime, setRescheduleTime] = useState<string>(() => {
    if (item.scheduled_for) {
      const d = new Date(item.scheduled_for);
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      return `${hh}:${mm}`;
    }
    return BOOKED_APPOINTMENT_DEFAULT_TIME;
  });
  const [action, setAction] = useState<PanelAction | null>(null);
  const openAction = (next: PanelAction) => {
    setAction((current) => (current === next ? null : next));
    setReason("");
  };
  const [meetingFormat, setMeetingFormat] = useState<MeetingFormat | null>(((item as { meeting_format?: MeetingFormat | null }).meeting_format) ?? null);
  const saveMeetingFormat = async (next: MeetingFormat) => {
    const previous = meetingFormat;
    setMeetingFormat(next);
    const { error } = await supabase.from("pipeline_items").update({ meeting_format: next } as never).eq("id", item.id);
    if (error) { setMeetingFormat(previous); toast.error(error.message); return; }
    qc.invalidateQueries({ predicate: (q) => QUALIFICATION_QUERY_ROOTS.has(String(q.queryKey[0])) });
    toast.success(`Marked as ${MEETING_FORMATS.find((f) => f.value === next)?.label ?? next}`);
  };
  const [pitched, setPitched] = useState<boolean | null>((item as { pitched?: boolean | null }).pitched ?? null);
  const savePitched = async (next: boolean) => {
    const previous = pitched;
    setPitched(next);
    const { error } = await supabase.from("pipeline_items").update({ pitched: next } as never).eq("id", item.id);
    if (error) { setPitched(previous); toast.error(error.message); return; }
    qc.invalidateQueries({ predicate: (q) => QUALIFICATION_QUERY_ROOTS.has(String(q.queryKey[0])) });
    toast.success(next ? "Marked pitched" : "Marked not pitched");
  };
  /** A sat meeting that didn't close can't be saved until the pitch is recorded. */
  const pitchOk = (outcome: AppointmentOutcomeValue) => {
    if (!PITCH_REQUIRED.has(outcome) || pitched != null) return true;
    toast.error("Did you pitch? Pick Pitched or Not pitched first.");
    return false;
  };
  const [proposal, setProposal] = useState<ProposalStatus | null>(((item as { proposal_status?: ProposalStatus | null }).proposal_status) ?? null);
  const [proposalSentDate, setProposalSentDate] = useState<string | null>(((item as { proposal_sent_date?: string | null }).proposal_sent_date) ?? null);
  /**
   * To send: opens a follow-up task (next weekday 10am) so the proposal shows
   * on the Follow-ups page until it goes. Sent: stamps the GHL "Proposal Sent
   * Date" field and closes that task.
   */
  const saveProposal = async (picked: ProposalStatus) => {
    const next = proposal === picked ? null : picked;
    const prev = { proposal, proposalSentDate };
    const sentDate = next === "sent" ? (proposalSentDate ?? melbourneToday()) : next === null ? null : proposalSentDate;
    setProposal(next);
    setProposalSentDate(sentDate);
    const { error } = await supabase.from("pipeline_items")
      .update({ proposal_status: next, proposal_sent_date: sentDate } as never).eq("id", item.id);
    if (error) { setProposal(prev.proposal); setProposalSentDate(prev.proposalSentDate); toast.error(error.message); return; }
    let taskNote = "";
    if (item.contact_id) {
      const { data: open } = await supabase.from("pipeline_items").select("id")
        .eq("contact_id", item.contact_id).eq("pipeline_type", "follow_up").eq("status", "open")
        .ilike("notes", `${PROPOSAL_TASK_PREFIX}%`);
      const openIds = ((open ?? []) as { id: string }[]).map((r) => r.id);
      if (next === "to_send" && openIds.length === 0) {
        const name = item.contacts?.business_name ?? "this client";
        const { error: taskError } = await supabase.from("pipeline_items").insert({
          contact_id: item.contact_id,
          pipeline_type: "follow_up",
          assigned_user_id: item.assigned_user_id,
          created_by: item.assigned_user_id,
          scheduled_for: nextBusinessDayAt10(),
          follow_up_method: "email",
          notes: `${PROPOSAL_TASK_PREFIX} ${name}`,
          status: "open",
        } as never);
        taskNote = taskError ? " (could not add the follow-up task)" : ", follow-up task added for tomorrow 10am";
      } else if (next !== "to_send" && openIds.length > 0) {
        await supabase.from("pipeline_items")
          .update({ status: "completed", completed_at: new Date().toISOString() } as never).in("id", openIds);
        taskNote = ", proposal task closed";
      }
    }
    qc.invalidateQueries({ predicate: (q) => QUALIFICATION_QUERY_ROOTS.has(String(q.queryKey[0])) || String(q.queryKey[0]).startsWith("follow") });
    toast.success((next === "to_send" ? "Proposal to send" : next === "sent" ? "Proposal marked sent" : "Proposal cleared") + taskNote);
  };
  const [secondMeetingDate, setSecondMeetingDate] = useState<Date | undefined>(undefined);
  const [secondMeetingTime, setSecondMeetingTime] = useState<string>(BOOKED_APPOINTMENT_DEFAULT_TIME);
  const [noCloseFollowUpDate, setNoCloseFollowUpDate] = useState<Date | undefined>(undefined);
  const [noCloseFollowUpTime, setNoCloseFollowUpTime] = useState<string>("09:00");
  const [noCloseFollowUpMethod, setNoCloseFollowUpMethod] = useState<FollowUpMethod>("call");
  const [outcomeNotes, setOutcomeNotes] = useState(item.outcome_notes || "");
  const [dealValue, setDealValue] = useState(item.deal_value != null ? String(item.deal_value) : "");
  const [monthlyValue, setMonthlyValue] = useState(
    (item as any).monthly_recurring_value != null ? String((item as any).monthly_recurring_value) : "",
  );
  const [retainerCadence, setRetainerCadence] = useState<"monthly" | "weekly">("monthly");
  // Service stream is captured here, at the close, because this is the only
  // moment someone knows what was actually sold. Without it the client_deals
  // row cannot be opened (stream is NOT NULL) — which is why closes were
  // landing on the board and never reaching the revenue table.
  const [streams, setStreams] = useState<ClientStream[]>(["seo"]);
  const [streamAmounts, setStreamAmounts] = useState<Partial<Record<ClientStream, string>>>({});
  const stream: ClientStream = streams.length === 1 ? streams[0] : "other";
  const multiService = streams.length > 1;
  const toggleStream = (sv: ClientStream) =>
    setStreams((current) => (current.includes(sv) ? (current.length > 1 ? current.filter((x) => x !== sv) : current) : [...current, sv]));
  // Several services: the retainer is the sum of the per-service amounts.
  const multiServiceTotal = multiService
    ? streams.reduce((sum, sv) => sum + (parseFloat(streamAmounts[sv] ?? "") || 0), 0)
    : 0;
  const toMonthly = (v: number) => (retainerCadence === "weekly" ? Math.round(v * (52 / 12) * 100) / 100 : v);

  const rescheduleIso = rescheduleDate ? combineDateTime(rescheduleDate, rescheduleTime) : undefined;
  const secondMeetingIso = secondMeetingDate ? combineDateTime(secondMeetingDate, secondMeetingTime) : undefined;
  const noCloseFollowUpIso = noCloseFollowUpDate ? combineDateTime(noCloseFollowUpDate, noCloseFollowUpTime) : undefined;

  const fireOutcome = (outcome: AppointmentOutcomeValue, scheduledFor?: string) => {
    if (!reasonOk(outcome)) return;
    if (!pitchOk(outcome)) return;
    if (outcome === "showed_closed" && multiService) {
      const missing = streams.filter((sv) => !(parseFloat(streamAmounts[sv] ?? "") > 0));
      if (missing.length) {
        toast.error(`Enter the monthly amount for ${missing.map((sv) => STREAM_LABELS[sv]).join(", ")} before closing.`);
        return;
      }
      const amounts: Partial<Record<ClientStream, number>> = {};
      for (const sv of streams) amounts[sv] = toMonthly(parseFloat(streamAmounts[sv] ?? "0"));
      const total = Object.values(amounts).reduce((a, b) => a + (b ?? 0), 0);
      onRecordOutcome(item, outcome, outcomeNotes, scheduledFor, dealValue ? parseFloat(dealValue) : undefined,
        undefined, undefined, Math.round(total * 100) / 100, { ...extras(), reason: null, stream: "other", streamAmounts: amounts });
      return;
    }
    if (outcome === "showed_closed" && !monthlyValue && !dealValue) {
      toast.error("Enter the retainer or deal value before closing — it opens the client's revenue record.");
      return;
    }
    if (outcome === "disqualified" && qualified !== false) { setQualified(false); setDqReason(effReason); saveQualified(false, effReason); }
    const val = outcome === "showed_closed" && dealValue ? parseFloat(dealValue) : undefined;
    const retainerInput = outcome === "showed_closed" && monthlyValue ? parseFloat(monthlyValue) : undefined;
    // Normalize to monthly for storage in monthly_recurring_value.
    const mrr =
      retainerInput != null && retainerCadence === "weekly"
        ? Math.round(retainerInput * (52 / 12) * 100) / 100
        : retainerInput;
    onRecordOutcome(
      item,
      outcome,
      outcomeNotes,
      scheduledFor,
      val,
      undefined,
      undefined,
      mrr,
      { ...extras(), reason: reasonsForOutcome(outcome) ? effReason : null },
    );
  };

  const handleSecondMeetingBooked = () => {
    if (!secondMeetingIso) return;
    if (!pitchOk("second_meeting_booked")) return;
    // Pass the chosen date as scheduledFor so the parent can create a new booked item.
    onRecordOutcome(
      item,
      "second_meeting_booked",
      outcomeNotes,
      secondMeetingIso,
      undefined,
      secondMeetingIso,
      undefined,
      undefined,
      { ...extras(), reason: null },
    );
  };

  const handleNoCloseFollowUp = () => {
    const iso = noCloseFollowUpIso;
    const method = noCloseFollowUpMethod;
    if (!iso) return;
    if (!reasonOk("no_close_follow_up")) return;
    if (!pitchOk("no_close_follow_up")) return;
    onRecordOutcome(
      item,
      "no_close_follow_up",
      outcomeNotes,
      undefined,
      undefined,
      iso,
      method,
      undefined,
      extras(),
    );
  };

  return (
    <div className="space-y-3 rounded-lg border border-border bg-background/60 p-4">
      {onAssign && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground shrink-0">Closer</span>
          <Select value={item.assigned_user_id} onValueChange={(value) => onAssign(item.id, value)}>
            <SelectTrigger className="w-full bg-background sm:w-[240px]">
              <SelectValue placeholder="Assign rep" />
            </SelectTrigger>
            <SelectContent>
              {reps.map((rep) => (
                <SelectItem key={rep.user_id} value={rep.user_id}>
                  {rep.display_name?.trim() || rep.email || "Unassigned"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground shrink-0">Meeting</span>
        <div className="flex rounded-md border border-border bg-background p-0.5 text-xs" role="group" aria-label="Meeting format">
          {MEETING_FORMATS.map((f) => (
            <button
              key={f.value}
              type="button"
              disabled={isSaving}
              onClick={() => saveMeetingFormat(f.value)}
              aria-pressed={(meetingFormat ?? "video") === f.value}
              className={cn(
                "rounded-sm px-2.5 py-1 transition-colors",
                (meetingFormat ?? "video") === f.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <Textarea
        value={outcomeNotes}
        onChange={(e) => setOutcomeNotes(e.target.value)}
        placeholder="Optional notes about the appointment result"
        className="min-h-[72px] resize-none bg-background"
      />

      {item.contact_id && <LeadBuckets contactId={item.contact_id} />}

      <GhlMirrorDetails
        pipelineType="booked"
        ghlContactId={item.contacts?.ghl_contact_id}
        ghlOpportunityId={item.ghl_opportunity_id}
        ghlPipelineId={item.ghl_pipeline_id}
        ghlStageId={item.ghl_stage_id}
      />

      <OpportunityDetailsSection itemId={item.id} ghlOpportunityId={item.ghl_opportunity_id ?? null} />

      <div className="flex flex-col gap-2 rounded-md border border-dashed border-border p-3">
        <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Recordings</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="flex flex-1 items-center gap-2">
            <Video className="h-4 w-4 text-muted-foreground" />
            <Input value={recordingUrl} onChange={(e) => setRecordingUrl(e.target.value)} placeholder="Fathom link" className="w-full bg-background" />
          </div>
          <div className="flex flex-1 items-center gap-2">
            <PhoneForwarded className="h-4 w-4 text-muted-foreground" />
            <Input value={phoneRecordingUrl} onChange={(e) => setPhoneRecordingUrl(e.target.value)} placeholder="Phone / GHL call link" className="w-full bg-background" />
          </div>
        </div>
        <FathomMatch itemId={item.id} closerId={item.assigned_user_id} scheduledFor={item.scheduled_for} outcome={item.appointment_outcome ?? null} />
        <MeetingRecordingMatches
          contactId={item.contact_id}
          ghlContactId={item.contacts?.ghl_contact_id}
          scheduledFor={item.scheduled_for}
          onUseGhlCall={setPhoneRecordingUrl}
        />
        {onSaveLinks ? (
          <Button type="button" variant="secondary" size="sm" className="self-start" disabled={isSaving} onClick={() => onSaveLinks(item, extras())}>
            Save links only
          </Button>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 rounded-md border border-dashed border-border p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Deal value (for Close)</p>
          <div className="flex rounded-md border border-border bg-background p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => setRetainerCadence("monthly")}
              className={cn(
                "px-2 py-0.5 rounded-sm transition-colors",
                retainerCadence === "monthly" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setRetainerCadence("weekly")}
              className={cn(
                "px-2 py-0.5 rounded-sm transition-colors",
                retainerCadence === "weekly" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              Weekly
            </button>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="flex flex-1 items-center gap-2">
            <DollarSign className="h-4 w-4 text-muted-foreground" />
            <Input
              type="number"
              min="0"
              step="0.01"
              value={dealValue}
              onChange={(e) => setDealValue(e.target.value)}
              placeholder="Upfront ($)"
              className="w-full bg-background"
            />
          </div>
          <div className="flex flex-1 items-center gap-2">
            <DollarSign className="h-4 w-4 text-muted-foreground" />
            <Input
              type="number"
              min="0"
              step="0.01"
              value={multiService ? (multiServiceTotal ? String(multiServiceTotal) : "") : monthlyValue}
              onChange={(e) => setMonthlyValue(e.target.value)}
              readOnly={multiService}
              title={multiService ? "Total of the per-service amounts below" : undefined}
              placeholder={
                multiService
                  ? "Total of the services below"
                  : retainerCadence === "weekly" ? "Retainer ($/wk)" : "Retainer ($/mo)"
              }
              className={cn("w-full bg-background", multiService && "text-muted-foreground")}
            />
          </div>
        </div>
        {retainerCadence === "weekly" && monthlyValue ? (
          <p className="text-[11px] text-muted-foreground">
            Stored as ${(parseFloat(monthlyValue) * (52 / 12)).toFixed(2)}/mo for reporting.
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 rounded-md border border-border p-3">
        <p className="text-[11px] uppercase tracking-widest text-muted-foreground">What did they buy?</p>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Services sold">
          {STREAM_ORDER.map((sv) => (
            <Button
              key={sv}
              type="button"
              size="sm"
              variant={streams.includes(sv) ? "default" : "outline"}
              className="h-7 px-2.5 text-xs"
              aria-pressed={streams.includes(sv)}
              onClick={() => toggleStream(sv)}
            >
              {STREAM_LABELS[sv]}
            </Button>
          ))}
        </div>
        {multiService && (
          <div className="flex flex-col gap-1.5">
            {streams.map((sv) => (
              <div key={sv} className="flex items-center gap-2">
                <span className="w-24 shrink-0 text-xs text-foreground">{STREAM_LABELS[sv]}</span>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  aria-label={`${STREAM_LABELS[sv]} amount`}
                  value={streamAmounts[sv] ?? ""}
                  onChange={(e) => setStreamAmounts((cur) => ({ ...cur, [sv]: e.target.value }))}
                  placeholder={retainerCadence === "weekly" ? "$/wk" : "$/mo"}
                  className="h-8 w-40 bg-background"
                />
              </div>
            ))}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">
          Pick every service they bought. With more than one, enter each one's monthly amount and Close opens a revenue record per service. Change it later on the Clients page if the scope shifts.
        </p>
      </div>

      <div className="flex flex-col gap-2 rounded-md border border-border p-3">
        <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Qualified lead? (closer)</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant={qualified === true ? "default" : "outline"} disabled={isSaving}
            onClick={() => { setQualified(true); saveQualified(true, null); }}>Qualified</Button>
          <Button size="sm" variant={qualified === false ? "destructive" : "outline"} disabled={isSaving}
            onClick={() => setQualified(false)}>Not qualified</Button>
          {qualified === false && (
            <Select value={dqReason} onValueChange={(v) => { setDqReason(v); if (!reason) setReason(v); saveQualified(false, v); }}>
              <SelectTrigger className="h-8 w-56 bg-background"><SelectValue placeholder="Why? (required)" /></SelectTrigger>
              <SelectContent>{DQ_REASONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
            </Select>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-md border border-border p-3">
        <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Did you pitch? (closer)</p>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Pitched">
          <Button size="sm" variant={pitched === true ? "default" : "outline"} disabled={isSaving} aria-pressed={pitched === true}
            onClick={() => savePitched(true)}>Pitched</Button>
          <Button size="sm" variant={pitched === false ? "default" : "outline"} disabled={isSaving} aria-pressed={pitched === false}
            onClick={() => savePitched(false)}>Not pitched</Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Pitched = you put the offer and price to them. Needed before No Close, No Close Follow-up, Verbal or Second Meeting. Close counts as pitched.
        </p>
      </div>

      <div className="flex flex-col gap-2 rounded-md border border-border p-3">
        <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Proposal</p>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Proposal">
          {PROPOSAL_STATUSES.map((p) => (
            <Button key={p.value} size="sm" variant={proposal === p.value ? "default" : "outline"} disabled={isSaving}
              aria-pressed={proposal === p.value} onClick={() => saveProposal(p.value)}>
              {p.value === "to_send" ? "Proposal to send" : "Proposal sent"}
            </Button>
          ))}
          {proposal === "sent" && proposalSentDate ? (
            <span className="text-[11px] text-muted-foreground">Sent {proposalSentDate.split("-").reverse().join("/")}</span>
          ) : null}
        </div>
        <p className="text-[11px] text-muted-foreground">
          To send adds a follow-up task for the next weekday at 10am. Sent closes it and fills the GHL Proposal Sent Date. Tap again to clear.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button variant={action === "reschedule" ? "default" : "secondary"} size="sm" onClick={() => openAction("reschedule")} disabled={isSaving}>
          <CalendarClock className="h-4 w-4" />
          Reschedule
        </Button>
        <Button variant={action === "phone_call" ? "default" : "outline"} size="sm" onClick={() => openAction("phone_call")} disabled={isSaving}
          title="They answered, but it could only be a phone call (not at a laptop, not somewhere quiet). Counts as a reschedule.">
          <Phone className="h-4 w-4" />
          Phone call only
        </Button>
        <Button variant={action === "no_show" ? "default" : "outline"} size="sm" onClick={() => openAction("no_show")} disabled={isSaving}>
          No Show
        </Button>
        <Button variant={action === "cancelled" ? "default" : "outline"} size="sm" onClick={() => openAction("cancelled")} disabled={isSaving}>
          Cancelled
        </Button>
        <Button variant="outline" size="sm" onClick={() => fireOutcome("showed_verbal_commitment")} disabled={isSaving}>
          Verbal Commitment
        </Button>
        <Button variant="outline" size="sm" onClick={() => fireOutcome("showed_closed")} disabled={isSaving}>
          <DollarSign className="h-4 w-4" />
          Close
        </Button>
        <Button variant={action === "showed_no_close" ? "default" : "outline"} size="sm" onClick={() => openAction("showed_no_close")} disabled={isSaving}>
          No Close
        </Button>
        <Button variant={action === "disqualified" ? "default" : "outline"} size="sm" onClick={() => openAction("disqualified")} disabled={isSaving}>
          <Ban className="h-4 w-4" />
          DQ
        </Button>
        <Button variant={action === "no_close_follow_up" ? "default" : "outline"} size="sm" onClick={() => openAction("no_close_follow_up")} disabled={isSaving}>
          <PhoneForwarded className="h-4 w-4" />
          No Close Follow-up
        </Button>
        <Button variant={action === "second_meeting" ? "default" : "outline"} size="sm" onClick={() => openAction("second_meeting")} disabled={isSaving}>
          <CalendarCheck2 className="h-4 w-4" />
          Second Meeting Booked
        </Button>
      </div>

      {action && (() => {
        const step = ACTION_STEP[action];
        const needsReason = Boolean(step.reasons);
        const dateIso = step.date === "reschedule" ? rescheduleIso : step.date === "follow_up" ? noCloseFollowUpIso : step.date === "second_meeting" ? secondMeetingIso : "ok";
        const ready = (!needsReason || Boolean(reason)) && Boolean(dateIso);
        const confirm = () => {
          if (!ready) {
            toast.error(needsReason && !reason ? "Pick a reason first." : "Pick the day and time first.");
            return;
          }
          switch (action) {
            case "reschedule":
            case "phone_call":
              fireOutcome("rescheduled", rescheduleIso);
              break;
            case "no_close_follow_up":
              handleNoCloseFollowUp();
              break;
            case "second_meeting":
              handleSecondMeetingBooked();
              break;
            default:
              fireOutcome(action);
          }
        };
        return (
          <div className="flex flex-col gap-3 rounded-md border border-primary/40 bg-primary/5 p-3" data-testid="outcome-step">
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground">{step.title}</p>
            {step.reasons && (
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Reason">
                {step.reasons.map((r) => (
                  <Button
                    key={r.value}
                    type="button"
                    size="sm"
                    variant={reason === r.value ? "default" : "outline"}
                    className="h-7 px-2.5 text-xs"
                    aria-pressed={reason === r.value}
                    onClick={() => setReason(r.value)}
                  >
                    {r.label}
                  </Button>
                ))}
              </div>
            )}
            {step.date === "follow_up" && (
              <FollowUpMethodSelector value={noCloseFollowUpMethod} onChange={setNoCloseFollowUpMethod} allowedMethods={["call", "email"]} />
            )}
            {step.date === "reschedule" && (
              <DateTimePick date={rescheduleDate} onDate={setRescheduleDate} time={rescheduleTime} onTime={setRescheduleTime} placeholder="Pick new day" />
            )}
            {step.date === "follow_up" && (
              <DateTimePick date={noCloseFollowUpDate} onDate={setNoCloseFollowUpDate} time={noCloseFollowUpTime} onTime={setNoCloseFollowUpTime} placeholder="Pick follow-up date" />
            )}
            {step.date === "second_meeting" && (
              <DateTimePick date={secondMeetingDate} onDate={setSecondMeetingDate} time={secondMeetingTime} onTime={setSecondMeetingTime} placeholder="Pick meeting day" />
            )}
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={confirm} disabled={!ready || isSaving}>Save</Button>
              <Button size="sm" variant="ghost" onClick={() => setAction(null)} disabled={isSaving}>Cancel</Button>
            </div>
          </div>
        );
      })()}

      <p className="text-[11px] text-muted-foreground">
        Tip: <strong>Close</strong> = won deal. <strong>No Close</strong> = lost, no follow-up.{" "}
        <strong>No Close Follow-up</strong> = lost this time, schedule another touch.{" "}
        <strong>Second Meeting Booked</strong> = re-book a meeting at the chosen date.{" "}
        <strong>DQ</strong> = not a fit, never going to buy.{" "}
        <strong>Phone call only</strong> = they answered but couldn't do the session, rebooked (counts as a reschedule).
      </p>
      {/* Rename Showed - Closed label */}
    </div>
  );
}
