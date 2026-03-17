import { TargetMetricCard } from "@/components/targets/TargetMetricCard";
import type { TargetProgressItem } from "@/lib/performanceTargets";

interface TargetSectionProps {
  title: string;
  description: string;
  items: TargetProgressItem[];
}

export function TargetSection({ title, description, items }: TargetSectionProps) {
  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="flex flex-col gap-1">
        <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        {items.map((item) => (
          <TargetMetricCard key={item.key} item={item} className="bg-background" />
        ))}
      </div>
    </section>
  );
}
