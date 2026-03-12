import { AppLayout } from "@/components/AppLayout";
import { StatCard } from "@/components/StatCard";
import { MOCK_CONTACTS, MOCK_CALL_LOGS, INDUSTRIES, OUTCOME_CONFIG, CallOutcome } from "@/data/mockData";

export default function ReportsPage() {
  const totalContacts = MOCK_CONTACTS.length;
  const calledContacts = MOCK_CONTACTS.filter((c) => c.status === "called").length;
  const booked = MOCK_CALL_LOGS.filter((l) => l.outcome === "booked").length;
  const conversionRate = calledContacts > 0 ? Math.round((booked / calledContacts) * 100) : 0;

  const industryStats = INDUSTRIES.map((ind) => {
    const total = MOCK_CONTACTS.filter((c) => c.industry === ind).length;
    const called = MOCK_CONTACTS.filter((c) => c.industry === ind && c.status === "called").length;
    return { industry: ind, total, called, pct: total > 0 ? Math.round((called / total) * 100) : 0 };
  });

  return (
    <AppLayout title="Reports">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Calls" value={calledContacts} />
          <StatCard label="Bookings" value={booked} />
          <StatCard label="Conversion Rate" value={`${conversionRate}%`} subtext="booked / called" />
          <StatCard label="Total Leads" value={totalContacts} />
        </div>

        {/* Industry penetration */}
        <div className="bg-card border border-border rounded-lg p-5">
          <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground mb-4">
            List Penetration by Industry
          </h3>
          <div className="space-y-3">
            {industryStats.map((stat) => (
              <div key={stat.industry} className="flex items-center gap-4">
                <span className="text-xs font-medium text-foreground w-32 shrink-0">{stat.industry}</span>
                <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${stat.pct}%` }}
                  />
                </div>
                <span className="text-xs font-mono text-muted-foreground w-16 text-right">
                  {stat.called}/{stat.total}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
