import { useState } from "react";
import { Bookmark, BookmarkPlus, Flame, PhoneForwarded, ShieldQuestion, Smartphone, UserCheck, X, Zap, Building2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useSmartLists } from "@/hooks/useSmartLists";
import type { DialerFilterSnapshot } from "@/components/dialer/AdvancedFilters";

interface SmartView {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  hint: string;
  snapshot: Partial<DialerFilterSnapshot>;
  accent?: string;
}

/**
 * One-tap queue configurations. Each view resets filters then applies its
 * snapshot — the queue rebuilds on the next claim. Speed to lead pairs with
 * the GHL intake: fresh inbound leads already jump the queue ordering, this
 * view narrows the session to ONLY them for a callback blitz.
 */
const SYSTEM_VIEWS: SmartView[] = [
  {
    key: "speed_to_lead",
    label: "Speed to lead",
    icon: Zap,
    hint: "Fresh inbound ad leads only — call within 5 minutes of the form.",
    snapshot: { leadType: "inbound" },
    accent: "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  {
    key: "dm_direct",
    label: "DM direct",
    icon: UserCheck,
    hint: "Captured decision-maker mobiles — the premium golden-window calls.",
    snapshot: { hasDmPhone: "yes", mobileGatekeeper: "hide" },
  },
  {
    key: "mobile_run",
    label: "Mobile run",
    icon: Smartphone,
    hint: "Cold mobiles, gatekeeper-flagged excluded. The standard power hour.",
    snapshot: { phoneType: "mobile", mobileGatekeeper: "hide", leadType: "cold" },
  },
  {
    key: "gatekeeper_crack",
    label: "Gatekeeper crack list",
    icon: ShieldQuestion,
    hint: "Mobiles that reach a screener — goal is intel + the owner's direct number, not a pitch.",
    snapshot: { mobileGatekeeper: "only" },
  },
  {
    key: "landline_capture",
    label: "Landline capture",
    icon: PhoneForwarded,
    hint: "Office landlines with no DM number yet — capture the route to the owner.",
    snapshot: { phoneType: "landline", hasDmPhone: "no" },
  },
  {
    key: "hot_tier",
    label: "Hot tier",
    icon: Flame,
    hint: "Tier 1 prospects only.",
    snapshot: { prospectTier: "Tier 1 - Hot" },
  },
  {
    key: "business_lines",
    label: "Business lines",
    icon: Building2,
    hint: "1300/1800 switchboards — enrichment sessions only, worst cold-call odds.",
    snapshot: { phoneType: "business_line" },
  },
];

interface SmartViewsBarProps {
  currentFilters: DialerFilterSnapshot;
  onReset: () => void;
  onApply: (snapshot: Partial<DialerFilterSnapshot>) => void;
  disabled?: boolean;
}

export function SmartViewsBar({ currentFilters, onReset, onApply, disabled }: SmartViewsBarProps) {
  const { smartLists, createSmartList, deleteSmartList } = useSmartLists();
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");

  const applyView = (view: SmartView) => {
    if (disabled) return;
    onReset();
    onApply(view.snapshot);
    setActiveKey(view.key);
    toast.info(`${view.label}: ${view.hint}`);
  };

  const applySaved = (id: string) => {
    if (disabled) return;
    const found = smartLists.find((sl) => sl.id === id);
    if (!found) return;
    onReset();
    onApply(found.filters as Partial<DialerFilterSnapshot>);
    setActiveKey(`saved:${id}`);
    toast.info(`Applied view "${found.name}".`);
  };

  const saveCurrent = async () => {
    const name = saveName.trim();
    if (!name) return;
    try {
      await createSmartList({ name, filters: currentFilters as unknown as Record<string, unknown> });
      toast.success(`Saved view "${name}".`);
      setSaveName("");
      setSaveOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't save the view.");
    }
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", disabled && "opacity-60")}>
      <span className="mr-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Views</span>
      {SYSTEM_VIEWS.map((v) => {
        const Icon = v.icon;
        const isActive = activeKey === v.key;
        return (
          <button
            key={v.key}
            type="button"
            title={v.hint}
            disabled={disabled}
            onClick={() => applyView(v)}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors disabled:cursor-not-allowed",
              isActive
                ? "border-primary bg-primary/10 text-foreground"
                : v.accent ?? "border-border bg-card text-muted-foreground hover:border-primary/40",
            )}
          >
            <Icon className="h-3 w-3" /> {v.label}
          </button>
        );
      })}

      {smartLists.map((sl) => {
        const isActive = activeKey === `saved:${sl.id}`;
        return (
          <span
            key={sl.id}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors",
              isActive ? "border-primary bg-primary/10 text-foreground" : "border-border bg-card text-muted-foreground",
            )}
          >
            <button type="button" disabled={disabled} onClick={() => applySaved(sl.id)} className="inline-flex items-center gap-1">
              <Bookmark className="h-3 w-3" /> {sl.name}
            </button>
            <button
              type="button"
              title="Delete view"
              onClick={() => {
                void deleteSmartList(sl.id).then(() => toast.info(`Deleted view "${sl.name}".`));
                if (isActive) setActiveKey(null);
              }}
              className="text-muted-foreground/60 hover:text-destructive"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        );
      })}

      <Popover open={saveOpen} onOpenChange={setSaveOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground" disabled={disabled}>
            <BookmarkPlus className="mr-1 h-3.5 w-3.5" /> Save view
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-3" align="start">
          <p className="mb-2 text-xs text-muted-foreground">Save the current filters as a reusable view for the whole team.</p>
          <div className="flex gap-1.5">
            <Input
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void saveCurrent(); } }}
              placeholder="View name…"
              className="h-8 text-xs"
            />
            <Button type="button" size="sm" className="h-8" onClick={() => void saveCurrent()} disabled={!saveName.trim()}>
              Save
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
