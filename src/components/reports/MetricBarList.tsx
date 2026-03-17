import { cn } from "@/lib/utils";

interface MetricBarItem {
  label: string;
  count: number;
  pct: number;
  toneClassName?: string;
}

interface MetricBarListProps {
  items: MetricBarItem[];
  emptyLabel?: string;
}

export function MetricBarList({ items, emptyLabel = "No data yet." }: MetricBarListProps) {
  if (items.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.label} className="space-y-1">
          <div className="flex justify-between gap-3 text-xs">
            <span className="truncate text-muted-foreground">{item.label}</span>
            <span className="shrink-0 font-mono text-foreground">{item.count}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
              <div
                className={cn("h-full rounded-full bg-primary transition-all", item.toneClassName)}
                style={{ width: `${item.pct}%` }}
              />
            </div>
            <span className="w-10 text-right font-mono text-[10px] text-muted-foreground">{item.pct}%</span>
          </div>
        </div>
      ))}
    </div>
  );
}
