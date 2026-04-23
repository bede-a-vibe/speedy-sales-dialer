import { CalendarIcon, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
}: ReportsToolbarProps) {
  return (
    <div className="sticky top-0 z-20 -mx-4 border-b border-border bg-background/85 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
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
        {isLoading && <span className="ml-auto animate-pulse text-xs text-muted-foreground">Loading…</span>}
      </div>
    </div>
  );
}