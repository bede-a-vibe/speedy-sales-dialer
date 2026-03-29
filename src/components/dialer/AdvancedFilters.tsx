import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  TRADE_TYPES,
  WORK_TYPES,
  BUSINESS_SIZES,
  PROSPECT_TIERS,
  AD_STATUS_OPTIONS,
  BUYING_SIGNAL_OPTIONS,
  GBP_RATING_OPTIONS,
  REVIEW_COUNT_OPTIONS,
} from "@/data/constants";

interface AdvancedFiltersProps {
  tradeType: string;
  setTradeType: (v: string) => void;
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
  onReset: () => void;
  disabled?: boolean;
}

export function AdvancedFilters({
  tradeType, setTradeType,
  workType, setWorkType,
  businessSize, setBusinessSize,
  prospectTier, setProspectTier,
  minGbpRating, setMinGbpRating,
  minReviewCount, setMinReviewCount,
  hasGoogleAds, setHasGoogleAds,
  hasFacebookAds, setHasFacebookAds,
  buyingSignalStrength, setBuyingSignalStrength,
  onReset,
  disabled = false,
}: AdvancedFiltersProps) {
  return (
    <div className="rounded-lg border border-border bg-card/50 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Advanced Filters</h3>
        <Button variant="ghost" size="sm" onClick={onReset} disabled={disabled} className="text-xs text-muted-foreground">
          Reset All
        </Button>
      </div>

      {/* Row 1: Business Qualification */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Trade Type</label>
          <Select value={tradeType} onValueChange={setTradeType} disabled={disabled}>
            <SelectTrigger className="h-8 border-border bg-card text-xs">
              <SelectValue placeholder="All Trades" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Trades</SelectItem>
              {TRADE_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
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
        </div>

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
        </div>
      </div>

      {/* Row 2: Digital Presence & GBP */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
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
        </div>
      </div>
    </div>
  );
}
