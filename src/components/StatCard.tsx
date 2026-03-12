import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  className?: string;
}

export function StatCard({ label, value, subtext, className }: StatCardProps) {
  return (
    <div className={cn("bg-card border border-border rounded-lg p-4", className)}>
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
      <p className="text-2xl font-bold font-mono text-foreground">{value}</p>
      {subtext && <p className="text-xs text-muted-foreground mt-1">{subtext}</p>}
    </div>
  );
}
