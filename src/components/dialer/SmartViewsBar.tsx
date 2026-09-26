import { useState } from "react";
import {
  ArrowLeftRight,
  BadgeCheck,
  Bookmark,
  BookmarkPlus,
  Building2,
  Flame,
  History,
  Inbox,
  Megaphone,
  PauseCircle,
  PhoneForwarded,
  Search,
  ShieldQuestion,
  Smartphone,
  Sparkles,
  Target,
  Thermometer,
  UserCheck,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useSmartLists } from "@/hooks/useSmartLists";
import type { DialerFilterSnapshot } from "@/components/dialer/AdvancedFilters";

/** Buckets the bar into rows so 17 chips stay scannable rather than one wrapped blob. */
type SmartViewGroup = "reach" | "intent" | "switch" | "coverage";

interface SmartView {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  hint: string;
  snapshot: Partial<DialerFilterSnapshot>;
  accent?: string;
  group: SmartViewGroup;
}

const GROUP_ORDER: { group: SmartViewGroup; label: string }[] = [
  { group: "intent", label: "Intent" },
  { group: "switch", label: "Switch" },
  { group: "reach", label: "Reach" },
  { group: "coverage", label: "Coverage" },
];

/**
 * One-tap queue configurations. Each view resets filters then applies its
 * snapshot — the queue rebuilds on the next claim. Speed to lead pairs with
 * the GHL intake: fresh inbound leads already jump the queue ordering, this
 * view narrows the session to ONLY them for a callback blitz.
 *
 * Every snapshot value below MUST be a legal option from AdvancedFilters /
 * src/data/constants.ts — claim_dialer_leads matches these strings exactly, so
 * a typo silently returns an empty queue rather than erroring.
 *
 * The ads/agency/buying-signal views ride on enrichment columns. Where coverage
 * is still thin the list will be short, not wrong — check the live match count
 * before committing a session to one.
 */
const SYSTEM_VIEWS: SmartView[] = [
  // ── Intent: why this business would buy right now ───────────────────────
  {
    key: "speed_to_lead",
    label: "Speed to lead",
    icon: Zap,
    hint: "Fresh inbound ad leads only — call within 5 minutes of the form.",
    snapshot: { leadType: "inbound" },
    accent: "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    group: "intent",
  },
  {
    key: "hot_tier",
    label: "Hot tier",
    icon: Flame,
    hint: "Tier 1 prospects only.",
    snapshot: { prospectTier: "Tier 1 - Hot" },
    group: "intent",
  },
  {
    key: "tier_two_run",
    label: "Tier 2 run",
    icon: Thermometer,
    hint: "Tier 2 only, kept off the hot list so it gets worked properly instead of skimmed when Tier 1 dries up.",
    snapshot: { prospectTier: "Tier 2 - Warm", mobileGatekeeper: "hide" },
    group: "intent",
  },
  {
    key: "signal_untouched",
    label: "Signal, untouched",
    icon: Sparkles,
    hint: "Strong buying signal and not one dial against them — the most valuable records we own, so don't burn them on a lazy opener.",
    snapshot: { buyingSignalStrength: "Strong", callRecency: "never", mobileGatekeeper: "hide" },
    group: "intent",
  },
  {
    key: "proven_no_ads",
    label: "Proven, no ads",
    icon: BadgeCheck,
    hint: "50+ reviews at 4.0+ and not buying a single click. Demand is already proven — they just go invisible the second someone searches.",
    snapshot: {
      minReviewCount: 50,
      minGbpRating: 4.0,
      hasGoogleAds: "No",
      hasExistingAgency: "no",
    },
    group: "intent",
  },
  {
    key: "ads_paused",
    label: "Ads switched off",
    icon: PauseCircle,
    hint: "Google Ads sitting paused — something stopped working. Find out what broke before you offer anything.",
    snapshot: { hasGoogleAds: "Yes - Paused" },
    group: "intent",
  },
  {
    key: "meta_gap",
    label: "Google on, Meta off",
    icon: Megaphone,
    hint: "Already paying for Google clicks with nothing on Meta — you're not selling paid traffic, only the channel they're missing.",
    snapshot: { hasGoogleAds: "Yes - Active", hasFacebookAds: "No" },
    group: "intent",
  },

  // ── Switch: someone else already has the budget ─────────────────────────
  {
    key: "agency_switch",
    label: "Agency switch",
    icon: ArrowLeftRight,
    hint: "Budget approved and going elsewhere. Ask what they were promised versus what they've actually had — never bag the incumbent.",
    snapshot: { hasExistingAgency: "yes" },
    group: "switch",
  },
  {
    key: "paid_ads_switch",
    label: "Paid-ads switch",
    icon: Target,
    hint: "Another agency runs their Google or Meta ads. Ask for last month's cost per booked job — most owners have never been shown it.",
    snapshot: { hasExistingAgency: "yes", existingAgencyServices: ["google_ads", "meta_ads"] },
    group: "switch",
  },
  {
    key: "seo_switch",
    label: "SEO switch",
    icon: Search,
    hint: "Paying someone for SEO. Ask which keywords they rank for and how many calls it made last month — the vague answer is the opening.",
    snapshot: { hasExistingAgency: "yes", existingAgencyServices: ["seo"] },
    group: "switch",
  },

  // ── Reach: how you get a human on the phone ─────────────────────────────
  {
    key: "dm_direct",
    label: "DM direct",
    icon: UserCheck,
    hint: "Captured decision-maker mobiles — the premium golden-window calls.",
    snapshot: { hasDmPhone: "yes", mobileGatekeeper: "hide" },
    group: "reach",
  },
  {
    key: "mobile_run",
    label: "Mobile run",
    icon: Smartphone,
    hint: "Cold mobiles, gatekeeper-flagged excluded. The standard power hour.",
    snapshot: { phoneType: "mobile", mobileGatekeeper: "hide", leadType: "cold" },
    group: "reach",
  },
  {
    key: "gatekeeper_crack",
    label: "Gatekeeper crack list",
    icon: ShieldQuestion,
    hint: "Mobiles that reach a screener — goal is intel + the owner's direct number, not a pitch.",
    snapshot: { mobileGatekeeper: "only" },
    group: "reach",
  },
  {
    key: "landline_capture",
    label: "Landline capture",
    icon: PhoneForwarded,
    hint: "Office landlines with no DM number yet — capture the route to the owner.",
    snapshot: { phoneType: "landline", hasDmPhone: "no" },
    group: "reach",
  },
  {
    key: "business_lines",
    label: "Business lines",
    icon: Building2,
    hint: "1300/1800 switchboards — enrichment sessions only, worst cold-call odds.",
    snapshot: { phoneType: "business_line" },
    group: "reach",
  },

  // ── Coverage: making sure the database actually gets worked ─────────────
  {
    key: "never_called",
    label: "Never called",
    icon: Inbox,
    hint: "Zero attempt history. No 'we spoke a while back' crutch — straight cold opener, and write the data back properly.",
    snapshot: { callRecency: "never", mobileGatekeeper: "hide" },
    group: "coverage",
  },
  {
    key: "rework_90",
    label: "90-day re-work",
    icon: History,
    hint: "Untouched for three months. Their situation has moved on — open with what's changed since, not the pitch they already said no to.",
    snapshot: { callRecency: "90", mobileGatekeeper: "hide" },
    group: "coverage",
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
    <div className={cn("space-y-1.5", disabled && "opacity-60")}>
      {GROUP_ORDER.map(({ group, label }) => {
        const views = SYSTEM_VIEWS.filter((v) => v.group === group);
        if (views.length === 0) return null;
        return (
          <div key={group} className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 w-16 shrink-0 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              {label}
            </span>
            {views.map((v) => {
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
          </div>
        );
      })}

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 w-16 shrink-0 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Saved</span>
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
    </div>
  );
}
