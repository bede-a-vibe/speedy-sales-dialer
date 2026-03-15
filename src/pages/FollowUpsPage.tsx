import { AppLayout } from "@/components/AppLayout";
import { useFollowUps } from "@/hooks/useCallLogs";
import { CalendarClock, Phone } from "lucide-react";
import { format } from "date-fns";

export default function FollowUpsPage() {
  const { data: followUps = [], isLoading } = useFollowUps();

  return (
    <AppLayout title="Follow-ups">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <CalendarClock className="h-5 w-5 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">
            {followUps.length} Scheduled Follow-ups
          </h3>
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
                    isOverdue
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

                  <a
                    href={`tel:${contact?.phone}`}
                    className="shrink-0 h-9 w-9 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center text-primary hover:bg-primary/20 transition-colors"
                  >
                    <Phone className="h-4 w-4" />
                  </a>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
