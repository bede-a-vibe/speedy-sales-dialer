import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { useFollowUps, useCreateCallLog } from "@/hooks/useCallLogs";
import { useUpdateContact } from "@/hooks/useContacts";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarClock, Phone, Check, CalendarIcon, Clock } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

export default function FollowUpsPage() {
  const { user } = useAuth();
  const { data: followUps = [], isLoading } = useFollowUps();
  const updateContact = useUpdateContact();
  const createCallLog = useCreateCallLog();
  const queryClient = useQueryClient();
  const [rescheduleId, setRescheduleId] = useState<string | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);

  const handleComplete = async (log: any) => {
    if (!user) return;
    setCompletingId(log.id);
    try {
      // Log a new call with "booked" outcome to mark it complete
      await createCallLog.mutateAsync({
        contact_id: log.contact_id,
        user_id: user.id,
        outcome: "booked",
        notes: `Follow-up completed (originally scheduled ${format(new Date(log.follow_up_date), "MMM d")})`,
      });
      await updateContact.mutateAsync({
        id: log.contact_id,
        last_outcome: "booked",
      });
      toast.success("Follow-up marked as complete!");
    } catch {
      toast.error("Failed to complete follow-up.");
    }
    setCompletingId(null);
  };

  const handleReschedule = async (logId: string, newDate: Date) => {
    try {
      const { error } = await supabase
        .from("call_logs")
        .update({ follow_up_date: newDate.toISOString() })
        .eq("id", logId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["follow-ups"] });
      toast.success(`Rescheduled to ${format(newDate, "MMM d, yyyy")}`);
      setRescheduleId(null);
    } catch {
      toast.error("Failed to reschedule.");
    }
  };

  const overdueCount = followUps.filter((l: any) => new Date(l.follow_up_date) < new Date()).length;
  const todayCount = followUps.filter((l: any) =>
    format(new Date(l.follow_up_date), "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd")
  ).length;

  return (
    <AppLayout title="Follow-ups">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Summary bar */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">
              {followUps.length} Scheduled Follow-ups
            </h3>
          </div>
          {overdueCount > 0 && (
            <span className="text-xs bg-destructive/10 text-destructive px-2 py-1 rounded-md font-medium">
              {overdueCount} overdue
            </span>
          )}
          {todayCount > 0 && (
            <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-md font-medium">
              {todayCount} due today
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="text-center py-20 text-sm text-muted-foreground font-mono animate-pulse">Loading...</div>
        ) : followUps.length === 0 ? (
          <div className="text-center py-20">
            <CalendarClock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-sm text-muted-foreground">No follow-ups scheduled yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {followUps.map((log: any) => {
              const contact = log.contacts;
              const isOverdue = log.follow_up_date && new Date(log.follow_up_date) < new Date();
              const isToday = log.follow_up_date &&
                format(new Date(log.follow_up_date), "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");

              return (
                <div
                  key={log.id}
                  className={`bg-card border rounded-lg p-4 flex items-center gap-4 ${
                    isOverdue && !isToday
                      ? "border-destructive/50 bg-destructive/5"
                      : isToday
                      ? "border-primary/50 bg-primary/5"
                      : "border-border"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">{contact?.business_name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {contact?.contact_person} · {contact?.industry}
                    </p>
                    {log.notes && (
                      <p className="text-xs text-muted-foreground mt-1 italic">"{log.notes}"</p>
                    )}
                    <p className="text-xs text-muted-foreground font-mono mt-1">
                      📞 {contact?.phone}
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="text-xs font-mono text-foreground">
                      {log.follow_up_date && format(new Date(log.follow_up_date), "MMM d, yyyy")}
                    </p>
                    {isOverdue && !isToday && (
                      <span className="text-[10px] uppercase tracking-widest text-destructive font-semibold">
                        Overdue
                      </span>
                    )}
                    {isToday && (
                      <span className="text-[10px] uppercase tracking-widest text-primary font-semibold">
                        Today
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <a
                      href={`tel:${contact?.phone}`}
                      className="h-9 w-9 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center text-primary hover:bg-primary/20 transition-colors"
                      title="Call now"
                    >
                      <Phone className="h-4 w-4" />
                    </a>

                    <Popover
                      open={rescheduleId === log.id}
                      onOpenChange={(open) => setRescheduleId(open ? log.id : null)}
                    >
                      <PopoverTrigger asChild>
                        <button
                          className="h-9 w-9 rounded-md bg-secondary border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                          title="Reschedule"
                        >
                          <Clock className="h-4 w-4" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="end">
                        <Calendar
                          mode="single"
                          selected={undefined}
                          onSelect={(date) => date && handleReschedule(log.id, date)}
                          disabled={(date) => date < new Date()}
                          initialFocus
                          className="p-3 pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>

                    <button
                      onClick={() => handleComplete(log)}
                      disabled={completingId === log.id}
                      className="h-9 w-9 rounded-md bg-[hsl(var(--outcome-booked))]/10 border border-[hsl(var(--outcome-booked))]/20 flex items-center justify-center text-[hsl(var(--outcome-booked))] hover:bg-[hsl(var(--outcome-booked))]/20 transition-colors disabled:opacity-50"
                      title="Mark complete"
                    >
                      <Check className="h-4 w-4" />
                    </button>
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
