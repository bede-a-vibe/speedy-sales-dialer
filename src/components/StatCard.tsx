import { cn } from "@/lib/utils";
import { useAnimatedCounter } from "@/hooks/useAnimatedCounter";
import { Trophy, Star } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  className?: string;
  milestone?: { threshold: number; color: string };
}

export function StatCard({ label, value, subtext, className, milestone }: StatCardProps) {
  const numericValue = typeof value === "number" ? value : parseInt(value, 10);
  const isNumeric = !isNaN(numericValue);
  const animatedValue = useAnimatedCounter(isNumeric ? numericValue : 0, 800, isNumeric);

  const displayValue = isNumeric
    ? typeof value === "string" && value.includes("%")
      ? `${animatedValue}%`
      : animatedValue
    : value;

  const hit = milestone && isNumeric && numericValue >= milestone.threshold;

  return (
    <div
      className={cn(
        "bg-card border rounded-lg p-4 transition-all duration-500",
        hit
          ? `border-[hsl(var(--${milestone.color}))] shadow-[0_0_16px_-4px_hsl(var(--${milestone.color})/0.4)]`
          : "border-border",
        className
      )}
    >
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
        {hit && (
          <div className="flex items-center gap-0.5">
            {numericValue >= (milestone.threshold * 2) ? (
              <Trophy className="h-3.5 w-3.5 text-[hsl(var(--outcome-booked))]" />
            ) : (
              <Star className="h-3.5 w-3.5 text-[hsl(var(--outcome-voicemail))]" />
            )}
          </div>
        )}
      </div>
      <p className="text-2xl font-bold font-mono text-foreground">{displayValue}</p>
      {subtext && <p className="text-xs text-muted-foreground mt-1">{subtext}</p>}
    </div>
  );
}
