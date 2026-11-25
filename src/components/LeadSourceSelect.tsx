import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LEAD_SOURCES } from "@/lib/leadSources";

/** One picker for lead source everywhere. An older value not on the list stays selectable, so saving never loses it. */
export function LeadSourceSelect({ value, onChange, className, disabled }: {
  value: string; onChange: (v: string) => void; className?: string; disabled?: boolean;
}) {
  const known = (LEAD_SOURCES as readonly string[]).includes(value);
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className={className ?? "border-border bg-card"} aria-label="Lead source"><SelectValue placeholder="Choose a source" /></SelectTrigger>
      <SelectContent>
        {!known && value ? <SelectItem value={value}>{value}</SelectItem> : null}
        {LEAD_SOURCES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
