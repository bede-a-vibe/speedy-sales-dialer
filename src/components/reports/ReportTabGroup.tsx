import { cn } from "@/lib/utils";

export interface TabGroupDef {
  id: string;
  label: string;
  tabs: { value: string; label: string }[];
}

interface ReportTabGroupProps {
  groups: TabGroupDef[];
  activeGroup: string;
  onActiveGroupChange: (id: string) => void;
  activeTab: string;
  onActiveTabChange: (value: string) => void;
}

export function ReportTabGroup({
  groups,
  activeGroup,
  onActiveGroupChange,
  activeTab,
  onActiveTabChange,
}: ReportTabGroupProps) {
  const current = groups.find((g) => g.id === activeGroup) ?? groups[0];

  return (
    <div className="space-y-2">
      <div className="inline-flex rounded-lg border border-border bg-card p-1">
        {groups.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => {
              onActiveGroupChange(g.id);
              if (!g.tabs.some((t) => t.value === activeTab)) {
                onActiveTabChange(g.tabs[0].value);
              }
            }}
            className={cn(
              "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
              g.id === activeGroup
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {g.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1">
        {current.tabs.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => onActiveTabChange(t.value)}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              t.value === activeTab
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}