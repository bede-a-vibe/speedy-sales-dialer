import { useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, ChevronDown, Layers, Users } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { DateRange as RDDateRange } from "react-day-picker";

function toISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseISO(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

type Preset = { key: string; label: string; build: () => { from: Date; to: Date; label: string } };

const PRESETS: Preset[] = [
  { key: "last7", label: "Last 7 days", build: () => { const to = new Date(); return { from: addDays(to, -6), to, label: "Last 7 days" }; } },
  { key: "last30", label: "Last 30 days", build: () => { const to = new Date(); return { from: addDays(to, -29), to, label: "Last 30 days" }; } },
  { key: "thisMonth", label: "This month", build: () => { const now = new Date(); return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now, label: "This month" }; } },
  { key: "lastMonth", label: "Last month", build: () => { const now = new Date(); const first = new Date(now.getFullYear(), now.getMonth() - 1, 1); const last = new Date(now.getFullYear(), now.getMonth(), 0); return { from: first, to: last, label: "Last month" }; } },
  { key: "q1", label: "Q1", build: () => { const y = new Date().getFullYear(); return { from: new Date(y, 0, 1), to: new Date(y, 2, 31), label: `Q1 ${y}` }; } },
  { key: "ytd", label: "Year to date", build: () => { const now = new Date(); return { from: new Date(now.getFullYear(), 0, 1), to: now, label: "Year to date" }; } },
  { key: "last90", label: "Last 90 days", build: () => { const to = new Date(); return { from: addDays(to, -89), to, label: "Last 90 days" }; } },
  { key: "all", label: "All time", build: () => ({ from: new Date(2020, 0, 1), to: new Date(), label: "All time" }) },
];

interface RepOption {
  user_id: string;
  display_name: string | null;
  email: string | null;
}

interface ReportsToolbarProps {
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (v: string) => void;
  onDateToChange: (v: string) => void;
  selectedRepId: string;
  onSelectedRepIdChange: (v: string) => void;
  reps: RepOption[];
  allRepsValue: string;
  isLoading?: boolean;
  breakdown?: string;
  onBreakdownChange?: (v: string) => void;
  breakdownOptions?: { id: string; label: string }[];
}

export function ReportsToolbar({
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  selectedRepId,
  onSelectedRepIdChange,
  reps,
  allRepsValue,
  isLoading,
  breakdown,
  onBreakdownChange,
  breakdownOptions,
}: ReportsToolbarProps) {
  const [open, setOpen] = useState(false);
  const fromDate = dateFrom ? parseISO(dateFrom) : undefined;
  const toDate = dateTo ? parseISO(dateTo) : undefined;
  const [picker, setPicker] = useState<RDDateRange | undefined>({ from: fromDate, to: toDate });

  const activePresetKey = PRESETS.find((p) => {
    const r = p.build();
    return toISO(r.from) === dateFrom && toISO(r.to) === dateTo;
  })?.key;
  const activeLabel = activePresetKey
    ? PRESETS.find((p) => p.key === activePresetKey)!.build().label
    : fromDate && toDate
      ? `${format(fromDate, "d MMM")} – ${format(toDate, "d MMM yyyy")}`
      : "Select range";

  const applyRange = (from: Date, to: Date) => {
    onDateFromChange(toISO(from));
    onDateToChange(toISO(to));
    setPicker({ from, to });
    setOpen(false);
  };

  const applyCustom = () => {
    if (picker?.from && picker?.to) {
      applyRange(picker.from, picker.to);
    }
  };

  return (
    <div className="sticky top-0 z-20 -mx-4 border-b border-border bg-background/85 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className={cn("gap-2 font-normal")}>
              <CalendarIcon className="h-4 w-4" />
              <span>{activeLabel}</span>
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <div className="flex flex-col sm:flex-row">
              <div className="flex flex-col gap-1 border-b border-border p-3 sm:border-b-0 sm:border-r">
                {PRESETS.map((p) => {
                  const isActive = activePresetKey === p.key;
                  return (
                    <Button
                      key={p.key}
                      variant={isActive ? "secondary" : "ghost"}
                      size="sm"
                      className="justify-start"
                      onClick={() => {
                        const r = p.build();
                        applyRange(r.from, r.to);
                      }}
                    >
                      {p.label}
                    </Button>
                  );
                })}
              </div>
              <div className="flex flex-col">
                <Calendar
                  mode="range"
                  numberOfMonths={2}
                  selected={picker}
                  onSelect={setPicker}
                  defaultMonth={picker?.from ?? fromDate}
                  className={cn("p-3 pointer-events-auto")}
                />
                <div className="flex items-center justify-between gap-2 border-t border-border p-3">
                  <div className="text-xs text-muted-foreground">
                    {picker?.from ? format(picker.from, "d MMM yyyy") : "—"} →{" "}
                    {picker?.to ? format(picker.to, "d MMM yyyy") : "—"}
                  </div>
                  <Button size="sm" onClick={applyCustom} disabled={!picker?.from || !picker?.to}>
                    Apply
                  </Button>
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Rep</span>
          <Select value={selectedRepId} onValueChange={onSelectedRepIdChange}>
            <SelectTrigger className="w-[200px] border-border bg-card">
              <SelectValue placeholder="All reps" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={allRepsValue}>All reps</SelectItem>
              {reps.map((rep) => (
                <SelectItem key={rep.user_id} value={rep.user_id}>
                  {rep.display_name || rep.email || "Unnamed rep"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {breakdownOptions && onBreakdownChange ? (
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Breakdown</span>
            <Select value={breakdown ?? "none"} onValueChange={onBreakdownChange}>
              <SelectTrigger className="w-[170px] border-border bg-card">
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                {breakdownOptions.map((opt) => (
                  <SelectItem key={opt.id} value={opt.id}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        {isLoading && <span className="ml-auto animate-pulse text-xs text-muted-foreground">Loading…</span>}
      </div>
    </div>
  );
}