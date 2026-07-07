import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarClock, AlertTriangle, CalendarCheck, PhoneCall, ListTodo } from "lucide-react";
import { usePipelineItems } from "@/hooks/usePipelineItems";
import { useTodayCallCount } from "@/hooks/useCallLogs";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { StatTilesSkeleton } from "@/components/skeletons/PageSkeletons";

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
        "flex items-center gap-3 rounded-lg border p-4 text-left shadow-card transition-all duration-200 motion-safe:hover:-translate-y-px hover:shadow-md hover:border-primary/40",
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
        <p className="text-2xl font-bold font-mono text-foreground [font-variant-numeric:tabular-nums]">{value}</p>
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">{label}</p>
      </div>
    </button>
  );
}

export function DashboardQuickStats() {
  const { user } = useAuth();
  const { data: followUps = [], isLoading: followUpsLoading } = usePipelineItems("follow_up", "open");
  const { data: booked = [], isLoading: bookedLoading } = usePipelineItems("booked", "open");
  const { data: todaysCalls = 0, isLoading: callsLoading } = useTodayCallCount(user?.id);
  const isLoading = followUpsLoading || bookedLoading || callsLoading;

  const followUpsDueToday = useMemo(
    () => followUps.filter((item) => isToday(item.scheduled_for)).length,
    [followUps],
  );

  const overdueTasks = useMemo(
    () => followUps.filter((item) => isPast(item.scheduled_for)).length,
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

  if (isLoading) {
    return <StatTilesSkeleton count={5} />;
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      <QuickStat
        icon={<CalendarClock className="h-5 w-5" />}
        label="Follow-ups Today"
        value={followUpsDueToday}
        href="/follow-ups"
      />
      <QuickStat
        icon={<ListTodo className="h-5 w-5" />}
        label="Overdue Tasks"
        value={overdueTasks}
        href="/follow-ups"
        urgent
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
