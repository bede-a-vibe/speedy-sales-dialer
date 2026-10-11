import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { STAT_CATALOG, STAT_CATEGORY_LABEL, STAT_SIDE, SIDE_LABEL, SIDE_ORDER, type StatCategory } from "@/lib/funnelStatsCatalog";

/**
 * Metric definitions, rendered straight from the stat catalog so the page
 * can never disagree with the numbers. Same text ships in docs/metrics-glossary.md.
 */
const RULES = [
  "Setting runs from the dial to the booked meeting resolving (showed, no-show, cancelled, rescheduled). Closing starts when the closer pitches.",
  "A booked slot resolves one of four ways: showed, no-show, cancelled, rescheduled. Pending and upcoming slots are not resolved.",
  "Show-up rate = showed ÷ every slot scheduled for the day that resolved. No-show, cancellation and reschedule rates share that denominator, so the four add to 100%.",
  "Pitched = a close decision was recorded on the meeting (closed, no close, verbal, no-close follow-up), first or second meeting.",
  "Two commitment rates: Call Commitment Rate (setting) = calls reaching the commitment stage ÷ conversations; Verbal Commitment Rate (closing) = verbals ÷ pitched.",
  "Close rate = closed ÷ pitched, with meetings marked not qualified excluded. Shown → Close = closed ÷ all showed.",
  "A qualified verdict is set on the booking. Unjudged means unknown, never not qualified.",
  "Avg deal value = first collection: one-off fee plus the first retainer month.",
];

const ORDER: StatCategory[] = ["activity", "conversations", "outcomes", "bookings", "closing"];

export function MetricGlossaryDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Metric definitions</DialogTitle>
          <DialogDescription>How every number on this page is worked out. Tell Bede which line to change and the code follows.</DialogDescription>
        </DialogHeader>
        <div className="rounded-md border border-border bg-muted/30 p-3">
          <p className="mb-1 text-[10px] font-mono uppercase tracking-widest text-primary">The rules</p>
          <ul className="ml-4 list-disc space-y-1 text-sm text-muted-foreground">
            {RULES.map((r) => <li key={r}>{r}</li>)}
          </ul>
        </div>
        {SIDE_ORDER.map((side) => (
          <div key={side} className="space-y-3">
            <h2 className="border-b border-border pb-1 text-[11px] font-mono uppercase tracking-widest text-primary">{SIDE_LABEL[side]} side</h2>
        {ORDER.filter((category) => STAT_SIDE[category] === side).map((category) => {
          const stats = STAT_CATALOG.filter((s) => s.category === category);
          const subgroups = [...new Set(stats.map((s) => s.subgroup ?? ""))];
          return (
            <section key={category} className="space-y-2">
              <h3 className="text-sm font-semibold">{STAT_CATEGORY_LABEL[category]}</h3>
              {subgroups.map((sub) => (
                <div key={sub || "none"}>
                  {sub && <p className="mb-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{sub}</p>}
                  <dl className="divide-y divide-border/60 rounded-md border border-border">
                    {stats.filter((s) => (s.subgroup ?? "") === sub).map((s) => (
                      <div key={s.id} className="grid gap-1 px-3 py-2 sm:grid-cols-[220px_1fr]">
                        <dt className="text-sm font-medium">
                          {s.label}
                          {s.subtext && <span className="ml-2 text-[11px] font-normal text-muted-foreground">{s.subtext}</span>}
                        </dt>
                        <dd className="text-sm text-muted-foreground">{s.formula ?? "No definition written yet."}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </section>
          );
        })}
          </div>
        ))}
      </DialogContent>
    </Dialog>
  );
}
