import { useState } from "react";
import { ChevronDown, Info } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MultiSelect } from "@/components/ui/multi-select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import {
  TRADE_TYPES,
  WORK_TYPES,
  BUSINESS_SIZES,
  PROSPECT_TIERS,
  AD_STATUS_OPTIONS,
  BUYING_SIGNAL_OPTIONS,
  GBP_RATING_OPTIONS,
  REVIEW_COUNT_OPTIONS,
  PHONE_TYPE_OPTIONS,
  DM_STATUS_OPTIONS,
  INDUSTRIES,
  AUSTRALIAN_STATES,
} from "@/data/constants";
import type { EnrichmentCoverage } from "@/hooks/useEnrichmentCoverage";

export interface SalesRepOption {
  user_id: string;
  display_name: string | null;
  email: string | null;
}

export type DialerFilterPreset = "all" | "hot_today" | "dm_direct" | "dm_capture" | "google_ads" | "high_review" | "landline_enrichment";

interface AdvancedFiltersProps {
  industries: string[];
  setIndustries: (v: string[]) => void;
  states: string[];
  setStates: (v: string[]) => void;
  contactOwner: string;
  setContactOwner: (v: string) => void;
  salesReps: SalesRepOption[];
  tradeTypes: string[];
  setTradeTypes: (v: string[]) => void;
  workType: string;
  setWorkType: (v: string) => void;
  businessSize: string;
  setBusinessSize: (v: string) => void;
  prospectTier: string;
  setProspectTier: (v: string) => void;
  minGbpRating: number | null;
  setMinGbpRating: (v: number | null) => void;
  minReviewCount: number | null;
  setMinReviewCount: (v: number | null) => void;
  hasGoogleAds: string;
  setHasGoogleAds: (v: string) => void;
  hasFacebookAds: string;
  setHasFacebookAds: (v: string) => void;
  buyingSignalStrength: string;
  setBuyingSignalStrength: (v: string) => void;
  phoneType: string;
  setPhoneType: (v: string) => void;
  hasDmPhone: string;
  setHasDmPhone: (v: string) => void;
  selectedPreset: DialerFilterPreset;
  onPresetChange: (preset: DialerFilterPreset) => void;
  onReset: () => void;
  disabled?: boolean;
  /** Live count of contacts matching the current filter set. Null while loading. */
  matchingContactCount?: number | null;
  /** Per-column coverage stats so we can warn about empty enrichment fields. */
  enrichmentCoverage?: EnrichmentCoverage;
}

const PHONE_TYPE_LABELS: Record<string, string> = {
  mobile: "Mobile",
  landline: "Landline",
  unknown: "Unknown",
};

function getRepLabel(rep: SalesRepOption) {
  return rep.display_name?.trim() || rep.email || "Unknown";
}

/** Small grey hint shown under enrichment-only filters when 0 rows are populated. */
function CoverageHint({ count, total }: { count: number; total: number }) {
  if (total === 0) return null;
  if (count === 0) {
    return (
      <p className="text-[10px] leading-tight text-muted-foreground/70">
        No contacts have this set yet
      </p>
    );
  }
  if (count < total * 0.05) {
    return (
      <p className="text-[10px] leading-tight text-muted-foreground/70">
        Only {count.toLocaleString()} contacts have this set
      </p>
    );
  }
  return null;
}

export function AdvancedFilters({
  industries, setIndustries,
  states, setStates,
  contactOwner, setContactOwner,
  salesReps,
  tradeTypes, setTradeTypes,
  workType, setWorkType,
  businessSize, setBusinessSize,
  prospectTier, setProspectTier,
  minGbpRating, setMinGbpRating,
  minReviewCount, setMinReviewCount,
  hasGoogleAds, setHasGoogleAds,
  hasFacebookAds, setHasFacebookAds,
  buyingSignalStrength, setBuyingSignalStrength,
  phoneType, setPhoneType,
  hasDmPhone, setHasDmPhone,
  selectedPreset, onPresetChange,
  onReset,
  disabled = false,
  matchingContactCount = null,
  enrichmentCoverage,
}: AdvancedFiltersProps) {
  const [enrichmentOpen, setEnrichmentOpen] = useState(false);
  const cov: EnrichmentCoverage = enrichmentCoverage ?? {
    prospect_tier: 0, buying_signal_strength: 0, gbp_rating: 0, review_count: 0,
    work_type: 0, business_size: 0, dm_phone: 0,
    has_google_ads_known: 0, has_facebook_ads_known: 0, total: 0,
  };

  const matchLabel =
    matchingContactCount === null
      ? null
      : matchingContactCount === 0
        ? "No contacts match these filters"
        : `${matchingContactCount.toLocaleString()} contacts match`;

  return (
    <div className="rounded-lg border border-border bg-card/50 p-4 space-y-4">
      {/* Header + live match count */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">Filters</h3>
          {matchLabel ? (
            <span
              className={cn(
                "text-xs",
                matchingContactCount === 0 ? "text-destructive font-medium" : "text-muted-foreground",
              )}
            >
              · {matchLabel}
            </span>
          ) : null}
        </div>
        <Button variant="ghost" size="sm" onClick={onReset} disabled={disabled} className="text-xs text-muted-foreground">
          Reset All
        </Button>
      </div>

      {matchingContactCount === 0 ? (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>No contacts match the current filter set. Click "Reset All" or remove a filter to refill the queue.</span>
        </div>
      ) : null}

      {/* Calling presets */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground">Calling presets</p>
          {selectedPreset !== "all" ? <Badge variant="secondary" className="text-[10px]">Preset active</Badge> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant={selectedPreset === "hot_today" ? "default" : "outline"} size="sm" className="h-8 text-xs" onClick={() => onPresetChange("hot_today")} disabled={disabled}>Hot today</Button>
          <Button type="button" variant={selectedPreset === "dm_direct" ? "default" : "outline"} size="sm" className="h-8 text-xs" onClick={() => onPresetChange("dm_direct")} disabled={disabled}>DM direct dials</Button>
          <Button type="button" variant={selectedPreset === "dm_capture" ? "default" : "outline"} size="sm" className="h-8 text-xs" onClick={() => onPresetChange("dm_capture")} disabled={disabled}>DM capture</Button>
          <Button type="button" variant={selectedPreset === "high_review" ? "default" : "outline"} size="sm" className="h-8 text-xs" onClick={() => onPresetChange("high_review")} disabled={disabled}>High reviews</Button>
          <Button type="button" variant={selectedPreset === "landline_enrichment" ? "default" : "outline"} size="sm" className="h-8 text-xs" onClick={() => onPresetChange("landline_enrichment")} disabled={disabled}>Landline enrichment</Button>
        </div>
      </div>

      {/* === ACTIVE FILTERS (always visible — these have data backing them) === */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Industry</label>
          <MultiSelect
            options={INDUSTRIES}
            selected={industries}
            onChange={setIndustries}
            placeholder="All Industries"
            disabled={disabled}
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">State</label>
          <MultiSelect
            options={AUSTRALIAN_STATES}
            selected={states}
            onChange={setStates}
            placeholder="All States"
            disabled={disabled}
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Contact Owner</label>
          <Select value={contactOwner} onValueChange={setContactOwner} disabled={disabled}>
            <SelectTrigger className="h-8 border-border bg-card text-xs">
              <SelectValue placeholder="All Reps" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Reps</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {salesReps.map((rep) => (
                <SelectItem key={rep.user_id} value={rep.user_id}>{getRepLabel(rep)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Phone Type</label>
          <Select value={phoneType} onValueChange={setPhoneType} disabled={disabled}>
            <SelectTrigger className="h-8 border-border bg-card text-xs">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {PHONE_TYPE_OPTIONS.map((t) => (
                <SelectItem key={t} value={t}>{PHONE_TYPE_LABELS[t] || t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1 sm:col-span-2">
          <label className="text-xs font-medium text-muted-foreground">Trade Type</label>
          <MultiSelect
            options={TRADE_TYPES}
            selected={tradeTypes}
            onChange={setTradeTypes}
            placeholder="All Trades"
            disabled={disabled}
          />
        </div>
      </div>

      {/* === ADVANCED ENRICHMENT FILTERS (collapsed by default) === */}
      <Collapsible open={enrichmentOpen} onOpenChange={setEnrichmentOpen}>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            type="button"
            className="h-8 w-full justify-between px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <span>Advanced enrichment filters</span>
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", enrichmentOpen && "rotate-180")} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 pt-2">
          <p className="text-[11px] text-muted-foreground/80 italic">
            These filters depend on enrichment data that is still being populated.
            Use carefully — picking a value with no matches will empty the queue.
          </p>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Prospect Tier</label>
              <Select value={prospectTier} onValueChange={setProspectTier} disabled={disabled}>
                <SelectTrigger className="h-8 border-border bg-card text-xs">
                  <SelectValue placeholder="All Tiers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Tiers</SelectItem>
                  {PROSPECT_TIERS.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <CoverageHint count={cov.prospect_tier} total={cov.total} />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Buying Signal</label>
              <Select value={buyingSignalStrength} onValueChange={setBuyingSignalStrength} disabled={disabled}>
                <SelectTrigger className="h-8 border-border bg-card text-xs">
                  <SelectValue placeholder="Any Signal" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any Signal</SelectItem>
                  {BUYING_SIGNAL_OPTIONS.map((b) => (
                    <SelectItem key={b} value={b}>{b}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <CoverageHint count={cov.buying_signal_strength} total={cov.total} />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">GBP Rating</label>
              <Select
                value={minGbpRating != null ? String(minGbpRating) : "any"}
                onValueChange={(v) => setMinGbpRating(v === "any" ? null : Number(v))}
                disabled={disabled}
              >
                <SelectTrigger className="h-8 border-border bg-card text-xs">
                  <SelectValue placeholder="Any Rating" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any Rating</SelectItem>
                  {GBP_RATING_OPTIONS.filter((o) => o.value > 0).map((o) => (
                    <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <CoverageHint count={cov.gbp_rating} total={cov.total} />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Min Reviews</label>
              <Select
                value={minReviewCount != null ? String(minReviewCount) : "any"}
                onValueChange={(v) => setMinReviewCount(v === "any" ? null : Number(v))}
                disabled={disabled}
              >
                <SelectTrigger className="h-8 border-border bg-card text-xs">
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any</SelectItem>
                  {REVIEW_COUNT_OPTIONS.filter((o) => o.value > 0).map((o) => (
                    <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <CoverageHint count={cov.review_count} total={cov.total} />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Work Type</label>
              <Select value={workType} onValueChange={setWorkType} disabled={disabled}>
                <SelectTrigger className="h-8 border-border bg-card text-xs">
                  <SelectValue placeholder="All Work Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Work Types</SelectItem>
                  {WORK_TYPES.map((w) => (
                    <SelectItem key={w} value={w}>{w}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <CoverageHint count={cov.work_type} total={cov.total} />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Business Size</label>
              <Select value={businessSize} onValueChange={setBusinessSize} disabled={disabled}>
                <SelectTrigger className="h-8 border-border bg-card text-xs">
                  <SelectValue placeholder="All Sizes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sizes</SelectItem>
                  {BUSINESS_SIZES.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <CoverageHint count={cov.business_size} total={cov.total} />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">DM Reachability</label>
              <Select value={hasDmPhone} onValueChange={setHasDmPhone} disabled={disabled}>
                <SelectTrigger className="h-8 border-border bg-card text-xs">
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any</SelectItem>
                  {DM_STATUS_OPTIONS.map((d) => (
                    <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <CoverageHint count={cov.dm_phone} total={cov.total} />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Google Ads</label>
              <Select value={hasGoogleAds} onValueChange={setHasGoogleAds} disabled={disabled}>
                <SelectTrigger className="h-8 border-border bg-card text-xs">
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any</SelectItem>
                  {AD_STATUS_OPTIONS.map((a) => (
                    <SelectItem key={a} value={a}>{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <CoverageHint count={cov.has_google_ads_known} total={cov.total} />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Facebook Ads</label>
              <Select value={hasFacebookAds} onValueChange={setHasFacebookAds} disabled={disabled}>
                <SelectTrigger className="h-8 border-border bg-card text-xs">
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any</SelectItem>
                  {AD_STATUS_OPTIONS.map((a) => (
                    <SelectItem key={a} value={a}>{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <CoverageHint count={cov.has_facebook_ads_known} total={cov.total} />
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
