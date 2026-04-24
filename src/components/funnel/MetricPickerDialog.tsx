import { useMemo, useState } from "react";
import { Search, X, ArrowUp, ArrowDown, GripVertical, RotateCcw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  groupStatsByCategory,
  groupStatsBySubgroup,
  STAT_CATEGORY_LABEL,
  STAT_CATEGORY_DESCRIPTION,
  STAT_CATALOG,
  STAT_CATALOG_BY_ID,
  type StatCategory,
} from "@/lib/funnelStatsCatalog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedIds: string[];
  onApply: (ids: string[]) => void;
  onReset: () => void;
}

const CATEGORY_ORDER: StatCategory[] = [
  "activity",
  "conversations",
  "outcomes",
  "bookings",
];

export function MetricPickerDialog({ open, onOpenChange, selectedIds, onApply, onReset }: Props) {
  const [draftIds, setDraftIds] = useState<string[]>(selectedIds);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<StatCategory | "all">("all");

  // Reset draft when dialog opens
  const handleOpenChange = (next: boolean) => {
    if (next) setDraftIds(selectedIds);
    setSearch("");
    setActiveCategory("all");
    onOpenChange(next);
  };

  const grouped = useMemo(() => groupStatsByCategory(), []);

  const visibleStats = useMemo(() => {
    const base =
      activeCategory === "all"
        ? STAT_CATALOG
        : grouped[activeCategory];
    if (!search.trim()) return base;
    const q = search.toLowerCase();
    return base.filter(
      (s) =>
        s.label.toLowerCase().includes(q) ||
        (s.subtext ?? "").toLowerCase().includes(q) ||
        STAT_CATEGORY_LABEL[s.category].toLowerCase().includes(q),
    );
  }, [activeCategory, grouped, search]);

  // Render either a flat list (search active or "All metrics") or grouped by subgroup (single category, no search).
  const showSubgroups = activeCategory !== "all" && !search.trim();
  const subgroups = useMemo(
    () => (showSubgroups ? groupStatsBySubgroup(visibleStats) : []),
    [showSubgroups, visibleStats],
  );

  const toggle = (id: string) => {
    setDraftIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const move = (id: string, direction: "up" | "down") => {
    setDraftIds((prev) => {
      const idx = prev.indexOf(id);
      if (idx < 0) return prev;
      const target = direction === "up" ? idx - 1 : idx + 1;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const removeFromSelection = (id: string) => {
    setDraftIds((prev) => prev.filter((x) => x !== id));
  };

  const handleApply = () => {
    onApply(draftIds);
    onOpenChange(false);
  };

  const handleResetClick = () => {
    onReset();
    onOpenChange(false);
  };

  const selectedCount = draftIds.length;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-5xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle>Customize columns</DialogTitle>
          <DialogDescription>
            Pick the metrics you want to monitor. Reorder them on the right to set column order — like Meta Ads
            Manager.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-[220px_1fr_280px] h-[60vh]">
          {/* Left: Categories */}
          <div className="border-r border-border bg-muted/30 py-3 overflow-y-auto">
            <button
              type="button"
              onClick={() => setActiveCategory("all")}
              className={cn(
                "w-full text-left px-4 py-2.5 text-sm transition-colors",
                activeCategory === "all"
                  ? "bg-primary/10 text-primary font-medium border-l-2 border-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground border-l-2 border-transparent",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span>All metrics</span>
                <span className="text-xs opacity-60">{STAT_CATALOG.length}</span>
              </div>
              <div className="text-[11px] opacity-60 mt-0.5">Browse everything</div>
            </button>
            {CATEGORY_ORDER.map((cat) => {
              const count = grouped[cat].length;
              if (count === 0) return null;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActiveCategory(cat)}
                  className={cn(
                    "w-full text-left px-4 py-2.5 text-sm transition-colors",
                    activeCategory === cat
                      ? "bg-primary/10 text-primary font-medium border-l-2 border-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground border-l-2 border-transparent",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span>{STAT_CATEGORY_LABEL[cat]}</span>
                    <span className="text-xs opacity-60">{count}</span>
                  </div>
                  <div className="text-[11px] opacity-60 mt-0.5 truncate">
                    {STAT_CATEGORY_DESCRIPTION[cat]}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Middle: Searchable list */}
          <div className="flex flex-col min-h-0 border-r border-border">
            <div className="p-3 border-b border-border">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search metrics..."
                  className="pl-8 h-8 text-sm"
                />
              </div>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2">
                {visibleStats.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-3 text-center">No metrics match "{search}".</p>
                ) : (
                  visibleStats.map((stat) => {
                    const checked = draftIds.includes(stat.id);
                    return (
                      <label
                        key={stat.id}
                        className={cn(
                          "flex items-start gap-2.5 rounded-md px-2.5 py-2 cursor-pointer transition-colors",
                          checked ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-muted",
                        )}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggle(stat.id)}
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm text-foreground truncate">{stat.label}</span>
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">
                              {STAT_CATEGORY_LABEL[stat.category]}
                            </span>
                          </div>
                          {stat.subtext && (
                            <div className="text-[11px] text-muted-foreground truncate">{stat.subtext}</div>
                          )}
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Right: Selected ordered list */}
          <div className="flex flex-col min-h-0 bg-muted/20">
            <div className="px-3 py-3 border-b border-border flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-widest text-muted-foreground">Your columns</div>
                <div className="text-sm font-medium text-foreground">{selectedCount} selected</div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setDraftIds([])} disabled={selectedCount === 0}>
                Clear
              </Button>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1">
                {draftIds.length === 0 ? (
                  <p className="text-xs text-muted-foreground p-3 text-center">
                    No columns selected. Tick metrics on the left.
                  </p>
                ) : (
                  draftIds.map((id, idx) => {
                    const stat = STAT_CATALOG_BY_ID.get(id);
                    if (!stat) return null;
                    return (
                      <div
                        key={id}
                        className="group flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1.5"
                      >
                        <GripVertical className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-foreground truncate">{stat.label}</div>
                          <div className="text-[10px] text-muted-foreground truncate">
                            {STAT_CATEGORY_LABEL[stat.category]}
                          </div>
                        </div>
                        <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={() => move(id, "up")}
                            disabled={idx === 0}
                            className="rounded p-0.5 hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
                            aria-label="Move up"
                          >
                            <ArrowUp className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => move(id, "down")}
                            disabled={idx === draftIds.length - 1}
                            className="rounded p-0.5 hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
                            aria-label="Move down"
                          >
                            <ArrowDown className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeFromSelection(id)}
                            className="rounded p-0.5 hover:bg-destructive/10 hover:text-destructive"
                            aria-label="Remove"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </div>
        </div>

        <DialogFooter className="border-t border-border px-6 py-3 gap-2 sm:gap-2">
          <Button variant="ghost" size="sm" onClick={handleResetClick}>
            <RotateCcw className="h-3.5 w-3.5" />
            Reset to default
          </Button>
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleApply}>
            Apply ({selectedCount})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
