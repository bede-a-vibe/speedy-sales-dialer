import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { groupStatsByCategory, STAT_CATEGORY_LABEL, type StatCategory } from "@/lib/funnelStatsCatalog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedIds: string[];
  onToggle: (id: string) => void;
}

export function MetricPickerDialog({ open, onOpenChange, selectedIds, onToggle }: Props) {
  const grouped = groupStatsByCategory();
  const order: StatCategory[] = ["activity", "outcomes", "funnel", "conversion", "quality", "post_booking", "revenue"];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Pick metrics to monitor</DialogTitle>
          <DialogDescription>Choose which stats appear in your custom monitor grid. Saved automatically per user.</DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-5">
            {order.map((cat) => {
              const stats = grouped[cat];
              if (stats.length === 0) return null;
              return (
                <div key={cat}>
                  <h4 className="mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                    {STAT_CATEGORY_LABEL[cat]}
                  </h4>
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {stats.map((stat) => {
                      const checked = selectedIds.includes(stat.id);
                      return (
                        <label
                          key={stat.id}
                          className="flex cursor-pointer items-start gap-2 rounded-md border border-border bg-card px-2.5 py-2 transition-colors hover:border-primary/40"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => onToggle(stat.id)}
                            className="mt-0.5"
                          />
                          <div className="flex-1">
                            <div className="text-sm text-foreground">{stat.label}</div>
                            {stat.subtext && <div className="text-[10px] text-muted-foreground">{stat.subtext}</div>}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}