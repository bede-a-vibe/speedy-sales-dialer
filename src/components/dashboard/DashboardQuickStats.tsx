import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarClock, AlertTriangle, CalendarCheck, PhoneCall } from "lucide-react";
import { usePipelineItems } from "@/hooks/usePipelineItems";
import { useTodayCallCount } from "@/hooks/useCallLogs";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

function isToday(dateStr: string | null) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function isPastOrToday(dateStr: string | null) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  now.setHours(23, 59, 59, 999);
  return d <= now;
}

function isPast(dateStr: string | null) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return d < now;
}

interface QuickStatProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  href: string;
  urgent?: boolean;
}

function QuickStat({ icon, label, value, href, urgent }: QuickStatProps) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate(href)}
      className={cn(
        "flex items-center gap-3 rounded-xl border p-4 text-left transition-all hover:shadow-md hover:border-primary/30",
        urgent && value > 0
          ? "border-destructive/30 bg-destructive/5"
          : "border-border bg-card",
      )}
    >
      <div className={cn(
        "flex h-10 w-10 items-center justify-center rounded-lg",
        urgent && value > 0 ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary",
      )}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold font-mono text-foreground">{value}</p>
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">{label}</p>
      </div>
    </button>
  );
}

export function DashboardQuickStats() {
  const { user } = useAuth();
  const { data: followUps = [] } = usePipelineItems("follow_up", "open");
  const { data: booked = [] } = usePipelineItems("booked", "open");
  const { data: todaysCalls = 0 } = useTodayCallCount(user?.id);

  const followUpsDueToday = useMemo(
    () => followUps.filter((item) => isPastOrToday(item.scheduled_for)).length,
    [followUps],
  );

  const overdueAppointments = useMemo(
    () => booked.filter((item) => isPast(item.scheduled_for)).length,
    [booked],
  );

  const todaysBookings = useMemo(
    () => booked.filter((item) => isToday(item.scheduled_for)).length,
    [booked],
  );

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <QuickStat
        icon={<CalendarClock className="h-5 w-5" />}
        label="Follow-ups Due"
        value={followUpsDueToday}
        href="/follow-ups"
      />
      <QuickStat
        icon={<AlertTriangle className="h-5 w-5" />}
        label="Overdue Appts"
        value={overdueAppointments}
        href="/pipelines?tab=booked"
        urgent
      />
      <QuickStat
        icon={<CalendarCheck className="h-5 w-5" />}
        label="Today's Bookings"
        value={todaysBookings}
        href="/pipelines?tab=booked"
      />
      <QuickStat
        icon={<PhoneCall className="h-5 w-5" />}
        label="Calls Today"
        value={todaysCalls}
        href="/reports"
      />
    </div>
  );
}
