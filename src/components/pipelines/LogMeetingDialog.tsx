import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { LeadSourceSelect } from "@/components/LeadSourceSelect";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { INDUSTRIES } from "@/data/constants";
import { useAuth } from "@/hooks/useAuth";
import type { SalesRepOption } from "@/hooks/usePipelineItems";
import { supabase } from "@/integrations/supabase/client";
import { MEETING_FORMATS } from "@/lib/appointments";

const blank = { business: "", person: "", phone: "", email: "", industry: "Other", source: "", detail: "", date: "", time: "", format: "in_person", closer: "" };

/**
 * Put a meeting on the board that never went through the dialer or GHL: a
 * referral, an SEO enquiry, someone who walked in. It only records. Nothing is
 * sent to the prospect and nothing is pushed to GHL.
 */
export function LogMeetingDialog({ open, onOpenChange, reps, onLogged }: {
  open: boolean; onOpenChange: (open: boolean) => void; reps: SalesRepOption[]; onLogged: () => void;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [f, setF] = useState(blank);
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<typeof blank>) => setF((cur) => ({ ...cur, ...patch }));
  const closer = f.closer || user?.id || "";
  const ready = Boolean(f.business.trim() && f.source && f.date && f.time && closer);

  const close = (next: boolean) => {
    if (saving) return;
    if (!next) setF(blank);
    onOpenChange(next);
  };

  const save = async () => {
    if (!ready || saving) return;
    setSaving(true);
    try {
      const at = new Date(`${f.date}T${f.time}`);
      const { data, error } = await (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ data: { existing: boolean; business_name: string; channel: string } | null; error: { message: string } | null }>)(
        "log_outside_meeting",
        {
          _business: f.business.trim(), _person: f.person.trim() || null, _phone: f.phone.trim() || null, _email: f.email.trim() || null,
          _industry: f.industry, _source: f.source, _detail: f.detail.trim() || null, _at: at.toISOString(), _format: f.format, _closer: closer,
        },
      );
      if (error) throw new Error(error.message);
      for (const key of ["pipeline-items", "todo", "contacts", "contacts-paginated", "booked-appointments-range", "my-bookings"]) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
      const past = at.getTime() < Date.now();
      toast.success(
        `${data?.existing ? `Added to ${data.business_name}, already in the dialer as ${data.channel}.${data.channel !== f.source ? " Change the source on the contact if that's wrong." : ""}` : "Meeting logged."}${past ? " Now record the result under Upcoming." : ""}`,
      );
      setF(blank);
      onOpenChange(false);
      onLogged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That did not save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const field = (id: string, label: string, node: JSX.Element, wide = false) => (
    <div className={wide ? "space-y-1.5 sm:col-span-2" : "space-y-1.5"}>
      <Label htmlFor={id} className="text-xs text-muted-foreground">{label}</Label>
      {node}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Log a meeting</DialogTitle>
          <DialogDescription>For meetings booked outside the dialer. Past or future. Nothing is sent to the prospect or to GHL.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {field("lm-business", "Business *", <Input id="lm-business" value={f.business} onChange={(e) => set({ business: e.target.value })} />, true)}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Lead source *</Label>
            <LeadSourceSelect value={f.source} onChange={(source) => set({ source })} />
          </div>
          {field("lm-detail", f.source === "Referral" ? "Referred by" : "Source detail", <Input id="lm-detail" value={f.detail} onChange={(e) => set({ detail: e.target.value })} />)}
          {field("lm-person", "Contact name", <Input id="lm-person" value={f.person} onChange={(e) => set({ person: e.target.value })} />)}
          {field("lm-phone", "Phone", <Input id="lm-phone" value={f.phone} onChange={(e) => set({ phone: e.target.value })} />)}
          {field("lm-email", "Email", <Input id="lm-email" type="email" value={f.email} onChange={(e) => set({ email: e.target.value })} />)}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Industry</Label>
            <Select value={f.industry} onValueChange={(industry) => set({ industry })}>
              <SelectTrigger aria-label="Industry"><SelectValue /></SelectTrigger>
              <SelectContent>{[...new Set([...INDUSTRIES, "Other"])].map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {field("lm-date", "Date *", <Input id="lm-date" type="date" value={f.date} onChange={(e) => set({ date: e.target.value })} />)}
          {field("lm-time", "Time *", <Input id="lm-time" type="time" value={f.time} onChange={(e) => set({ time: e.target.value })} />)}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">How</Label>
            <Select value={f.format} onValueChange={(format) => set({ format })}>
              <SelectTrigger aria-label="How"><SelectValue /></SelectTrigger>
              <SelectContent>{MEETING_FORMATS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Closer *</Label>
            <Select value={closer} onValueChange={(v) => set({ closer: v })}>
              <SelectTrigger aria-label="Closer"><SelectValue placeholder="Choose" /></SelectTrigger>
              <SelectContent>{reps.map((r) => <SelectItem key={r.user_id} value={r.user_id}>{r.display_name || r.email?.split("@")[0] || "Unknown"}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <Button onClick={() => void save()} disabled={!ready || saving}>{saving ? "Saving…" : "Log meeting"}</Button>
      </DialogContent>
    </Dialog>
  );
}
