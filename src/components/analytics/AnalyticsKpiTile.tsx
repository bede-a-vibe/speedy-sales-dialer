import { cn } from "@/lib/utils";
import { useAnimatedCounter } from "@/hooks/useAnimatedCounter";

interface Props {
  label: string;
  value: string | number;
  sublabel?: string;
  accent?: "primary" | "success" | "warning" | "muted";
  className?: string;
}

export function AnalyticsKpiTile({ label, value, sublabel, accent = "muted", className }: Props) {
  const numeric = typeof value === "number" ? value : NaN;
  const isNumeric = !isNaN(numeric);
  const animated = useAnimatedCounter(isNumeric ? numeric : 0, 800, isNumeric);
  const display = isNumeric ? animated.toLocaleString() : value;

  const accentBar =
    accent === "primary"
      ? "bg-primary"
      : accent === "success"
        ? "bg-emerald-500"
        : accent === "warning"
          ? "bg-amber-500"
          : "bg-border";

  return (
    <div className={cn("relative overflow-hidden rounded-xl border border-border bg-card p-4", className)}>
      <div className={cn("absolute inset-y-0 left-0 w-1", accentBar)} />
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-2xl font-bold text-foreground">{display}</p>
      {sublabel && <p className="mt-1 text-[11px] text-muted-foreground">{sublabel}</p>}
    </div>
  );
}
