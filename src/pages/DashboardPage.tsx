import { AppLayout } from "@/components/AppLayout";
import { StatCard } from "@/components/StatCard";
import { useContacts } from "@/hooks/useContacts";
import { useCallLogs } from "@/hooks/useCallLogs";
import { OUTCOME_CONFIG, CallOutcome } from "@/data/mockData";

export default function DashboardPage() {
  const { data: contacts = [] } = useContacts();
  const { data: callLogs = [] } = useCallLogs();

  const totalContacts = contacts.length;
  const calledContacts = contacts.filter((c) => c.status === "called").length;
  const booked = callLogs.filter((l) => l.outcome === "booked").length;
  const followUps = callLogs.filter((l) => l.outcome === "follow_up").length;
  const penetration = totalContacts > 0 ? Math.round((calledContacts / totalContacts) * 100) : 0;

  const outcomeCounts = callLogs.reduce<Partial<Record<string, number>>>((acc, log) => {
    acc[log.outcome] = (acc[log.outcome] || 0) + 1;
    return acc;
  }, {});

  return (
    <AppLayout title="Dashboard">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard label="Calls Made" value={calledContacts} subtext="total dials" />
          <StatCard label="Booked" value={booked} subtext="appointments" />
          <StatCard label="Follow-ups" value={followUps} subtext="scheduled" />
          <StatCard label="Total Leads" value={totalContacts} subtext="in system" />
          <StatCard label="Penetration" value={`${penetration}%`} subtext="lists called" />
        </div>

        <div className="bg-card border border-border rounded-lg p-5">
          <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground mb-4">
            Outcome Breakdown
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            {(Object.keys(OUTCOME_CONFIG) as CallOutcome[]).map((outcome) => {
              const config = OUTCOME_CONFIG[outcome];
              const count = outcomeCounts[outcome] || 0;
              return (
                <div key={outcome} className="text-center p-3 rounded-md bg-secondary border border-border">
                  <div className="text-xl font-bold font-mono text-foreground">{count}</div>
                  <div className="text-[10px] text-muted-foreground mt-1">{config.label}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-5">
          <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground mb-4">
            Recent Activity
          </h3>
          <div className="space-y-2">
            {callLogs.slice(0, 10).map((log: any) => {
              const config = OUTCOME_CONFIG[log.outcome as CallOutcome];
              return (
                <div key={log.id} className="flex items-center gap-3 px-3 py-2 rounded-md bg-secondary/50 border border-border">
                  <div className={`w-2 h-2 rounded-full ${config?.color || ''}`} />
                  <span className="text-sm font-medium text-foreground flex-1">
                    {log.contacts?.business_name || "Unknown"}
                  </span>
                  <span className="text-xs text-muted-foreground">{config?.label}</span>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {new Date(log.created_at).toLocaleDateString()}
                  </span>
                </div>
              );
            })}
            {callLogs.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">No calls logged yet.</p>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
