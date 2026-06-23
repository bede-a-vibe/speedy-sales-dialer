import { CalendarIcon, Layers, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

function toISO(d: Date) {
  return d.toISOString().split("T")[0];
}

function buildPresets() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const addDays = (n: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + n);
    return d;
  };
  const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
  const endOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const thisMonthStart = startOfMonth(today);
  const lastMonthRef = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const yearStart = new Date(today.getFullYear(), 0, 1);

  return [
    { key: "last7", label: "Last 7 days", from: addDays(-6), to: today },
    { key: "last30", label: "Last 30 days", from: addDays(-29), to: today },
    { key: "last90", label: "Last 90 days", from: addDays(-89), to: today },
    { key: "thisMonth", label: "This month", from: thisMonthStart, to: today },
    { key: "lastMonth", label: "Last month", from: startOfMonth(lastMonthRef), to: endOfMonth(lastMonthRef) },
    { key: "ytd", label: "Year to date", from: yearStart, to: today },
    { key: "all", label: "All time", from: new Date(2020, 0, 1), to: today },
  ];
}

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
  const presets = buildPresets();
  const activePreset = presets.find((p) => toISO(p.from) === dateFrom && toISO(p.to) === dateTo)?.key;

  const applyPreset = (from: Date, to: Date) => {
    onDateFromChange(toISO(from));
    onDateToChange(toISO(to));
  };

  return (
    <div className="sticky top-0 z-20 -mx-4 border-b border-border bg-background/85 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex max-w-6xl flex-col gap-3">
        <div className="flex flex-wrap items-center gap-1">
          {presets.map((p) => {
            const active = activePreset === p.key;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => applyPreset(p.from, p.to)}
                className={
                  "rounded-md px-3 py-1.5 text-sm transition-colors " +
                  (active
                    ? "border border-primary text-foreground"
                    : "border border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50")
                }
              >
                {p.label}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <CalendarIcon className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">From</span>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => onDateFromChange(e.target.value)}
            className="w-[150px] border-border bg-card text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">To</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => onDateToChange(e.target.value)}
            className="w-[150px] border-border bg-card text-sm"
          />
        </div>
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
    </div>
  );
}