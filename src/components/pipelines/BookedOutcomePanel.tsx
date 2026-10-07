import { LeadBuckets } from "@/components/contacts/LeadBuckets";
import { useState } from "react";
import { format } from "date-fns";
import { CalendarClock, DollarSign, CalendarCheck2, PhoneForwarded, Ban, Video } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { BOOKED_APPOINTMENT_DEFAULT_TIME, NO_CLOSE_REASONS, DQ_REASONS, NO_SHOW_REASONS, CANCEL_REASONS, RESCHEDULE_REASONS, reasonsForOutcome, type AppointmentOutcomeValue } from "@/lib/appointments";
import { MeetingRecordingMatches } from "@/components/pipelines/MeetingRecordingMatches";
import { cn } from "@/lib/utils";
import type { PipelineItemWithRelations, SalesRepOption, FollowUpMethod } from "@/hooks/usePipelineItems";
import { FollowUpMethodSelector } from "@/components/pipelines/FollowUpMethodSelector";
import { GhlMirrorDetails } from "@/components/ghl/GhlMirrorDetails";

function combineDateTime(date: Date, time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  const next = new Date(date);
  next.setHours(hours || 0, minutes || 0, 0, 0);
  return next.toISOString();
}

export interface OutcomeExtras {
  reason?: string | null;
  recordingUrl?: string | null;
  phoneRecordingUrl?: string | null;
}

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

export function BookedOutcomePanel({ item, reps, isSaving, onAssign, onRecordOutcome, onSaveLinks }: BookedOutcomePanelProps) {
  const [reason, setReason] = useState<string>(item.outcome_reason ?? "");
  const qc = useQueryClient();
  const [qualified, setQualified] = useState<boolean | null>((item as any).is_qualified ?? null);
  const [dqReason, setDqReason] = useState<string>((item as any).dq_reason ?? "");
  const saveQualified = async (q: boolean | null, why: string | null) => {
    const { error } = await supabase.from("pipeline_items").update({ is_qualified: q, dq_reason: q === false ? why : null } as any).eq("id", item.id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries();
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
  const [showReschedule, setShowReschedule] = useState(false);
  const [showSecondMeeting, setShowSecondMeeting] = useState(false);
  const [secondMeetingDate, setSecondMeetingDate] = useState<Date | undefined>(undefined);
  const [secondMeetingTime, setSecondMeetingTime] = useState<string>(BOOKED_APPOINTMENT_DEFAULT_TIME);
  const [showNoCloseFollowUp, setShowNoCloseFollowUp] = useState(false);
  const [noCloseFollowUpDate, setNoCloseFollowUpDate] = useState<Date | undefined>(undefined);
  const [noCloseFollowUpTime, setNoCloseFollowUpTime] = useState<string>("09:00");
  const [noCloseFollowUpMethod, setNoCloseFollowUpMethod] = useState<FollowUpMethod>("call");
  const [outcomeNotes, setOutcomeNotes] = useState(item.outcome_notes || "");
  const [dealValue, setDealValue] = useState(item.deal_value != null ? String(item.deal_value) : "");
  const [monthlyValue, setMonthlyValue] = useState(
    (item as any).monthly_recurring_value != null ? String((item as any).monthly_recurring_value) : "",
  );
  const [retainerCadence, setRetainerCadence] = useState<"monthly" | "weekly">("monthly");

  const rescheduleIso = rescheduleDate ? combineDateTime(rescheduleDate, rescheduleTime) : undefined;
  const secondMeetingIso = secondMeetingDate ? combineDateTime(secondMeetingDate, secondMeetingTime) : undefined;
  const noCloseFollowUpIso = noCloseFollowUpDate ? combineDateTime(noCloseFollowUpDate, noCloseFollowUpTime) : undefined;

  const fireOutcome = (outcome: AppointmentOutcomeValue, scheduledFor?: string) => {
    if (!reasonOk(outcome)) return;
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
        <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Reason (required for No Show, Cancelled, Reschedule, No Close and DQ)</p>
        <Select value={reason || undefined} onValueChange={setReason}>
          <SelectTrigger className="w-full bg-background sm:w-[280px]">
            <SelectValue placeholder="Why?" />
          </SelectTrigger>
          <SelectContent>
            <div className="px-2 py-1 text-[10px] uppercase tracking-widest text-muted-foreground">No close</div>
            {NO_CLOSE_REASONS.map((r) => (
              <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
            ))}
            <div className="px-2 py-1 text-[10px] uppercase tracking-widest text-muted-foreground">Disqualified</div>
            {DQ_REASONS.map((r) => (
              <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
            ))}
            <div className="px-2 py-1 text-[10px] uppercase tracking-widest text-muted-foreground">No show</div>
            {NO_SHOW_REASONS.map((r) => (
              <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
            ))}
            <div className="px-2 py-1 text-[10px] uppercase tracking-widest text-muted-foreground">Cancelled</div>
            {CANCEL_REASONS.map((r) => (
              <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
            ))}
            <div className="px-2 py-1 text-[10px] uppercase tracking-widest text-muted-foreground">Rescheduled</div>
            {RESCHEDULE_REASONS.map((r) => (
              <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
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
              value={monthlyValue}
              onChange={(e) => setMonthlyValue(e.target.value)}
              placeholder={retainerCadence === "weekly" ? "Retainer ($/wk)" : "Retainer ($/mo)"}
              className="w-full bg-background"
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

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button
          variant={showReschedule ? "default" : "secondary"}
          onClick={() => setShowReschedule((v) => !v)}
          disabled={isSaving}
          size="sm"
        >
          <CalendarClock className="h-4 w-4" />
          Reschedule
        </Button>
        <Button variant="outline" size="sm" onClick={() => fireOutcome("no_show")} disabled={isSaving}>
          No Show
        </Button>
        <Button variant="outline" size="sm" onClick={() => fireOutcome("cancelled")} disabled={isSaving}>
          Cancelled
        </Button>
        <Button variant="outline" size="sm" onClick={() => fireOutcome("showed_verbal_commitment")} disabled={isSaving}>
          Verbal Commitment
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fireOutcome("showed_closed")}
          disabled={isSaving}
        >
          <DollarSign className="h-4 w-4" />
          Close
        </Button>
        <Button variant="outline" size="sm" onClick={() => fireOutcome("showed_no_close")} disabled={isSaving}>
          No Close
        </Button>
        <Button variant="outline" size="sm" onClick={() => fireOutcome("disqualified")} disabled={isSaving}>
          <Ban className="h-4 w-4" />
          DQ
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowNoCloseFollowUp((v) => !v)}
          disabled={isSaving}
        >
          <PhoneForwarded className="h-4 w-4" />
          No Close Follow-up
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowSecondMeeting((v) => !v)}
          disabled={isSaving}
        >
          <CalendarCheck2 className="h-4 w-4" />
          Second Meeting Booked
        </Button>
      </div>

      {showReschedule && (
        <div className="flex flex-col gap-2 rounded-md border border-primary/40 bg-primary/5 p-3">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Reschedule appointment</p>
          <div className="flex flex-wrap items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("justify-start bg-background", !rescheduleDate && "text-muted-foreground")}>
                  <CalendarClock className="h-4 w-4" />
                  {rescheduleDate ? format(rescheduleDate, "PPP") : "Pick new day"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={rescheduleDate}
                  onSelect={setRescheduleDate}
                  disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
            <Input
              type="time"
              value={rescheduleTime}
              onChange={(e) => setRescheduleTime(e.target.value)}
              className="w-[120px] bg-background"
            />
            <Button
              size="sm"
              onClick={() => {
                if (!rescheduleIso) return;
                fireOutcome("rescheduled", rescheduleIso);
              }}
              disabled={!rescheduleIso || isSaving}
            >
              Confirm reschedule
            </Button>
          </div>
        </div>
      )}

      {showSecondMeeting && (
        <div className="flex flex-col gap-2 rounded-md border border-primary/40 bg-primary/5 p-3">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Book second meeting</p>
          <div className="flex flex-wrap items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("justify-start bg-background", !secondMeetingDate && "text-muted-foreground")}>
                  <CalendarCheck2 className="h-4 w-4" />
                  {secondMeetingDate ? format(secondMeetingDate, "PPP") : "Pick meeting day"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={secondMeetingDate}
                  onSelect={setSecondMeetingDate}
                  disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
            <Input
              type="time"
              value={secondMeetingTime}
              onChange={(e) => setSecondMeetingTime(e.target.value)}
              className="w-[120px] bg-background"
            />
            <Button
              size="sm"
              onClick={handleSecondMeetingBooked}
              disabled={!secondMeetingIso || isSaving}
            >
              Confirm second meeting
            </Button>
          </div>
        </div>
      )}

      {showNoCloseFollowUp && (
        <div className="flex flex-col gap-2 rounded-md border border-primary/40 bg-primary/5 p-3">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Schedule no-close follow-up</p>
          <FollowUpMethodSelector value={noCloseFollowUpMethod} onChange={setNoCloseFollowUpMethod} allowedMethods={["call", "email"]} />
          <div className="flex flex-wrap items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("justify-start bg-background", !noCloseFollowUpDate && "text-muted-foreground")}>
                  <PhoneForwarded className="h-4 w-4" />
                  {noCloseFollowUpDate ? format(noCloseFollowUpDate, "PPP") : "Pick follow-up date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={noCloseFollowUpDate}
                  onSelect={setNoCloseFollowUpDate}
                  disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
            <Input
              type="time"
              value={noCloseFollowUpTime}
              onChange={(e) => setNoCloseFollowUpTime(e.target.value)}
              className="w-[120px] bg-background"
            />
            <Button
              size="sm"
              onClick={handleNoCloseFollowUp}
              disabled={!noCloseFollowUpIso || isSaving}
            >
              Confirm follow-up
            </Button>
          </div>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        Tip: <strong>Close</strong> = won deal. <strong>No Close</strong> = lost, no follow-up.{" "}
        <strong>No Close Follow-up</strong> = lost this time, schedule another touch.{" "}
        <strong>Second Meeting Booked</strong> = re-book a meeting at the chosen date.{" "}
        <strong>DQ</strong> = not a fit, never going to buy.
      </p>
      {/* Rename Showed - Closed label */}
    </div>
  );
}
