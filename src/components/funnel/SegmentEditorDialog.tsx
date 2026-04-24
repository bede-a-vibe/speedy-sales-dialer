import { useEffect, useMemo, useState } from "react";
import { Loader2, Wand2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { MultiSelect } from "@/components/ui/multi-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AUSTRALIAN_STATES,
  INDUSTRIES,
  TRADE_TYPES,
  WORK_TYPES,
  BUSINESS_SIZES,
  PROSPECT_TIERS,
  BUYING_SIGNAL_OPTIONS,
  PHONE_TYPE_OPTIONS,
  AD_STATUS_OPTIONS,
  GBP_RATING_OPTIONS,
  REVIEW_COUNT_OPTIONS,
} from "@/data/constants";
import {
  countContactsForSegment,
  type Segment,
  type SegmentFilters,
  type SegmentInput,
} from "@/lib/benchmarkSegments";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const DIALER_FILTERS_STORAGE_KEY = "dialer:advanced-filters:v1";

type StoredDialerFilters = {
  industries?: string[];
  states?: string[];
  tradeTypes?: string[];
  workType?: string;
  businessSize?: string;
  prospectTier?: string;
  minGbpRating?: number | null;
  minReviewCount?: number | null;
  hasGoogleAds?: string;
  hasFacebookAds?: string;
  buyingSignalStrength?: string;
  phoneType?: string;
  hasDmPhone?: string;
};

function readDialerFilters(): StoredDialerFilters | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DIALER_FILTERS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as StoredDialerFilters) : null;
  } catch {
    return null;
  }
}

const PHONE_TYPE_LABELS: Record<string, string> = {
  mobile: "Mobile",
  landline: "Landline",
  unknown: "Unknown",
};

interface SegmentEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Segment to edit, or null/undefined when creating a new one. */
  initial?: Segment | null;
  onSave: (input: SegmentInput) => Promise<unknown>;
  /** Disable the "Share with team" toggle (e.g. user not signed in). */
  canShare?: boolean;
}

function emptyFilters(): SegmentFilters {
  return {
    states: [],
    industries: [],
    tradeTypes: [],
    workType: null,
    businessSize: null,
    prospectTier: null,
    buyingSignalStrength: null,
    phoneType: null,
    hasGoogleAds: null,
    hasFacebookAds: null,
    hasDmPhone: null,
    minGbpRating: null,
    minReviewCount: null,
  };
}

export function SegmentEditorDialog({
  open,
  onOpenChange,
  initial,
  onSave,
  canShare = true,
}: SegmentEditorDialogProps) {
  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);
  const [filters, setFilters] = useState<SegmentFilters>(emptyFilters());
  const [saving, setSaving] = useState(false);

  // Match-count state (debounced)
  const [matchCount, setMatchCount] = useState<number | null>(null);
  const [matchLoading, setMatchLoading] = useState(false);

  // Reset / preload form when opening.
  useEffect(() => {
    if (!open) return;
    if (initial) {
      setName(initial.name);
      setShared(initial.shared);
      setFilters({ ...emptyFilters(), ...(initial.filters ?? {}) });
    } else {
      setName("");
      setShared(false);
      setFilters(emptyFilters());
    }
  }, [open, initial]);

  // Debounced live "X contacts match" count.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setMatchLoading(true);
    const t = window.setTimeout(async () => {
      try {
        const c = await countContactsForSegment(filters);
        if (!cancelled) setMatchCount(c);
      } catch {
        if (!cancelled) setMatchCount(null);
      } finally {
        if (!cancelled) setMatchLoading(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [open, filters]);

  const dialerFilters = useMemo(() => (open ? readDialerFilters() : null), [open]);
  const canCopyFromDialer = !!dialerFilters;

  const handleCopyFromDialer = () => {
    const d = readDialerFilters();
    if (!d) {
      toast.message("No dialer filters saved yet", {
        description: "Adjust the Filters panel on the dialer page first.",
      });
      return;
    }
    setFilters({
      states: d.states ?? [],
      industries: d.industries ?? [],
      tradeTypes: d.tradeTypes ?? [],
      workType: d.workType && d.workType !== "all" ? d.workType : null,
      businessSize: d.businessSize && d.businessSize !== "all" ? d.businessSize : null,
      prospectTier: d.prospectTier && d.prospectTier !== "all" ? d.prospectTier : null,
      buyingSignalStrength:
        d.buyingSignalStrength && d.buyingSignalStrength !== "all" ? d.buyingSignalStrength : null,
      phoneType: d.phoneType && d.phoneType !== "all" ? d.phoneType : null,
      hasGoogleAds: d.hasGoogleAds && d.hasGoogleAds !== "all" ? d.hasGoogleAds : null,
      hasFacebookAds: d.hasFacebookAds && d.hasFacebookAds !== "all" ? d.hasFacebookAds : null,
      hasDmPhone:
        d.hasDmPhone === "yes" || d.hasDmPhone === "no" ? (d.hasDmPhone as "yes" | "no") : null,
      minGbpRating: d.minGbpRating ?? null,
      minReviewCount: d.minReviewCount ?? null,
    });
    toast.success("Filters copied from dialer");
  };

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("Give your segment a name first");
      return;
    }
    setSaving(true);
    try {
      await onSave({ name: trimmedName, color: null, filters, shared });
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save segment");
    } finally {
      setSaving(false);
    }
  };

  const updateFilter = <K extends keyof SegmentFilters>(key: K, value: SegmentFilters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit segment" : "New benchmark segment"}</DialogTitle>
          <DialogDescription>
            Define a saved combination of filters. Each segment becomes one row in the Custom Monitor's
            Segments view.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Top action: copy from dialer */}
          <div className="flex items-center justify-between gap-2 rounded-md border border-dashed border-border bg-muted/30 px-3 py-2">
            <div>
              <p className="text-xs font-medium text-foreground">Copy from current dialer filters</p>
              <p className="text-[11px] text-muted-foreground">
                {canCopyFromDialer
                  ? "Pulls in whatever filter set you have active on the Dialer page."
                  : "No dialer filters saved yet — adjust them on the Dialer page first."}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleCopyFromDialer}
              disabled={!canCopyFromDialer}
            >
              <Wand2 className="h-3.5 w-3.5" />
              Copy filters
            </Button>
          </div>

          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="segment-name" className="text-xs font-medium">
              Name
            </Label>
            <Input
              id="segment-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. NSW Plumbers (Hot)"
              maxLength={80}
            />
          </div>

          {/* Filter grid */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">State</Label>
              <MultiSelect
                options={AUSTRALIAN_STATES}
                selected={filters.states ?? []}
                onChange={(v) => updateFilter("states", v)}
                placeholder="All States"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Industry</Label>
              <MultiSelect
                options={INDUSTRIES}
                selected={filters.industries ?? []}
                onChange={(v) => updateFilter("industries", v)}
                placeholder="All Industries"
              />
            </div>

            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs text-muted-foreground">Trade Type</Label>
              <MultiSelect
                options={TRADE_TYPES}
                selected={filters.tradeTypes ?? []}
                onChange={(v) => updateFilter("tradeTypes", v)}
                placeholder="All Trades"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Work Type</Label>
              <Select
                value={filters.workType ?? "all"}
                onValueChange={(v) => updateFilter("workType", v === "all" ? null : v)}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="All Work Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Work Types</SelectItem>
                  {WORK_TYPES.map((w) => (
                    <SelectItem key={w} value={w}>
                      {w}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Business Size</Label>
              <Select
                value={filters.businessSize ?? "all"}
                onValueChange={(v) => updateFilter("businessSize", v === "all" ? null : v)}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="All Sizes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sizes</SelectItem>
                  {BUSINESS_SIZES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Prospect Tier</Label>
              <Select
                value={filters.prospectTier ?? "all"}
                onValueChange={(v) => updateFilter("prospectTier", v === "all" ? null : v)}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="All Tiers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Tiers</SelectItem>
                  {PROSPECT_TIERS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Buying Signal</Label>
              <Select
                value={filters.buyingSignalStrength ?? "all"}
                onValueChange={(v) =>
                  updateFilter("buyingSignalStrength", v === "all" ? null : v)
                }
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Any Signal" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any Signal</SelectItem>
                  {BUYING_SIGNAL_OPTIONS.map((b) => (
                    <SelectItem key={b} value={b}>
                      {b}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Phone Type</Label>
              <Select
                value={filters.phoneType ?? "all"}
                onValueChange={(v) => updateFilter("phoneType", v === "all" ? null : v)}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {PHONE_TYPE_OPTIONS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {PHONE_TYPE_LABELS[t] ?? t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Has Google Ads</Label>
              <Select
                value={filters.hasGoogleAds ?? "all"}
                onValueChange={(v) => updateFilter("hasGoogleAds", v === "all" ? null : v)}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any</SelectItem>
                  {AD_STATUS_OPTIONS.map((a) => (
                    <SelectItem key={a} value={a}>
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Has Facebook Ads</Label>
              <Select
                value={filters.hasFacebookAds ?? "all"}
                onValueChange={(v) => updateFilter("hasFacebookAds", v === "all" ? null : v)}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any</SelectItem>
                  {AD_STATUS_OPTIONS.map((a) => (
                    <SelectItem key={a} value={a}>
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">DM Reachability</Label>
              <Select
                value={filters.hasDmPhone ?? "all"}
                onValueChange={(v) =>
                  updateFilter("hasDmPhone", v === "all" ? null : (v as "yes" | "no"))
                }
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any</SelectItem>
                  <SelectItem value="yes">Has DM Phone</SelectItem>
                  <SelectItem value="no">No DM Phone</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Min GBP Rating</Label>
              <Select
                value={filters.minGbpRating != null ? String(filters.minGbpRating) : "any"}
                onValueChange={(v) => updateFilter("minGbpRating", v === "any" ? null : Number(v))}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Any Rating" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any Rating</SelectItem>
                  {GBP_RATING_OPTIONS.filter((o) => o.value > 0).map((o) => (
                    <SelectItem key={o.value} value={String(o.value)}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Min Reviews</Label>
              <Select
                value={filters.minReviewCount != null ? String(filters.minReviewCount) : "any"}
                onValueChange={(v) =>
                  updateFilter("minReviewCount", v === "any" ? null : Number(v))
                }
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any</SelectItem>
                  {REVIEW_COUNT_OPTIONS.filter((o) => o.value > 0).map((o) => (
                    <SelectItem key={o.value} value={String(o.value)}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Sharing toggle */}
          <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
            <div>
              <p className="text-xs font-medium text-foreground">Share with team</p>
              <p className="text-[11px] text-muted-foreground">
                {shared
                  ? "Visible to everyone on the team. Only you (or an admin) can edit."
                  : "Private to your account — saved on this device."}
              </p>
            </div>
            <Switch
              checked={shared}
              onCheckedChange={setShared}
              disabled={!canShare}
              aria-label="Share with team"
            />
          </div>

          {/* Live match count footer */}
          <div
            className={cn(
              "flex items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs",
              matchCount === 0 ? "text-destructive" : "text-muted-foreground",
            )}
          >
            <span className="flex items-center gap-2">
              {matchLoading ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Counting matches…
                </>
              ) : matchCount === null ? (
                "Couldn't count matches"
              ) : matchCount === 0 ? (
                "No contacts match these filters"
              ) : (
                <>
                  <span className="font-mono font-medium text-foreground">
                    {matchCount.toLocaleString()}
                  </span>{" "}
                  contacts match these filters
                </>
              )}
            </span>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {initial ? "Save changes" : "Create segment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
