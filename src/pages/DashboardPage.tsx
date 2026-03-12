import { AppLayout } from "@/components/AppLayout";
import { StatCard } from "@/components/StatCard";
import { MOCK_CONTACTS, MOCK_CALL_LOGS, OUTCOME_CONFIG, CallOutcome } from "@/data/mockData";
import { Phone, CalendarCheck, CalendarClock, Users, TrendingUp } from "lucide-react";

export default function DashboardPage() {
  const totalContacts = MOCK_CONTACTS.length;
  const calledContacts = MOCK_CONTACTS.filter((c) => c.status === "called").length;
  const booked = MOCK_CALL_LOGS.filter((l) => l.outcome === "booked").length;
  const followUps = MOCK_CALL_LOGS.filter((l) => l.outcome === "follow_up").length;
  const penetration = totalContacts > 0 ? Math.round((calledContacts / totalContacts) * 100) : 0;

  const outcomeCounts = MOCK_CALL_LOGS.reduce<Partial<Record<CallOutcome, number>>>((acc, log) => {
    acc[log.outcome] = (acc[log.outcome] || 0) + 1;
    return acc;
  }, {});

  return (
    <AppLayout title="Dashboard">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Stats grid */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard label="Calls Today" value={calledContacts} subtext="total dials" />
          <StatCard label="Booked" value={booked} subtext="appointments" />
          <StatCard label="Follow-ups" value={followUps} subtext="scheduled" />
          <StatCard label="Total Leads" value={totalContacts} subtext="in system" />
          <StatCard label="Penetration" value={`${penetration}%`} subtext="lists called" />
        </div>

        {/* Outcome breakdown */}
        <div className="bg-card border border-border rounded-lg p-5">
          <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground mb-4">
            Outcome Breakdown
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            {(Object.keys(OUTCOME_CONFIG) as CallOutcome[]).map((outcome) => {
              const config = OUTCOME_CONFIG[outcome];
              const count = outcomeCounts[outcome] || 0;
              return (
                <div
                  key={outcome}
                  className="text-center p-3 rounded-md bg-secondary border border-border"
                >
                  <div className={`text-xl font-bold font-mono text-foreground`}>{count}</div>
                  <div className="text-[10px] text-muted-foreground mt-1">{config.label}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent activity */}
        <div className="bg-card border border-border rounded-lg p-5">
          <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground mb-4">
            Recent Activity
          </h3>
          <div className="space-y-2">
            {MOCK_CALL_LOGS.map((log) => {
              const contact = MOCK_CONTACTS.find((c) => c.id === log.contact_id);
              const config = OUTCOME_CONFIG[log.outcome];
              return (
                <div
                  key={log.id}
                  className="flex items-center gap-3 px-3 py-2 rounded-md bg-secondary/50 border border-border"
                >
                  <div className={`w-2 h-2 rounded-full ${config.color}`} />
                  <span className="text-sm font-medium text-foreground flex-1">
                    {contact?.business_name}
                  </span>
                  <span className="text-xs text-muted-foreground">{config.label}</span>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {new Date(log.created_at).toLocaleDateString()}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
