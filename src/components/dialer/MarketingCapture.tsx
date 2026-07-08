import { useEffect, useMemo, useState } from "react";
import { Megaphone, Loader2, Check, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AGENCY_SERVICES } from "@/data/constants";
import { useUpdateContact } from "@/hooks/useContacts";
import { ghlUpdateContactFields } from "@/lib/ghl";
import { cn } from "@/lib/utils";

type TriState = "yes" | "no" | "unknown";

interface MarketingCaptureProps {
  contactId: string;
  ghlContactId?: string | null;
  hasGoogleAds: string | null;
  hasFacebookAds: string | null;
  hasSeo: string | null;
  hasExistingAgency: boolean | null;
  existingAgencyName: string | null;
  existingAgencyServices: string[];
  existingAgencyNotes: string | null;
  /** Set by deep-crawl when it's finished scraping this site. */
  deepCrawlAttempted?: boolean | null;
}

function toTri(v: string | null): TriState {
  if (v == null) return "unknown";
  const s = String(v).toLowerCase();
  if (s === "yes") return "yes";
  if (s === "no") return "no";
  return "unknown";
}

function TriButtons({
  value,
  onChange,
  labels,
  disabled,
}: {
  value: TriState;
  onChange: (v: TriState) => void;
  labels: { yes: string; no: string; unknown: string };
  disabled?: boolean;
}) {
  return (
    <div className="flex gap-2">
      {(["yes", "no", "unknown"] as const).map((opt) => (
        <button
          key={opt}
          type="button"
          disabled={disabled}
          onClick={() => onChange(opt)}
          className={cn(
            "flex-1 rounded border px-2 py-1.5 text-xs font-medium transition-colors",
            value === opt
              ? "border-primary bg-primary/10 text-foreground"
              : "border-border bg-card text-muted-foreground hover:border-muted-foreground/50",
            disabled && "opacity-60",
          )}
        >
          {labels[opt]}
        </button>
      ))}
    </div>
  );
}

/**
 * Marketing tab: Adwords, Meta Ads, Existing Agency (all tri-state).
 * Ad flags auto-populate from the deep-crawl scraper (written as 'yes').
 */
export function MarketingCapture({
  contactId,
  ghlContactId,
  hasGoogleAds,
  hasFacebookAds,
  hasSeo,
  hasExistingAgency,
  existingAgencyName,
  existingAgencyServices,
  existingAgencyNotes,
  deepCrawlAttempted,
}: MarketingCaptureProps) {
  const updateContact = useUpdateContact();
  const [saving, setSaving] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const [gAds, setGAds] = useState<TriState>(toTri(hasGoogleAds));
  const [fbAds, setFbAds] = useState<TriState>(toTri(hasFacebookAds));
  const [seo, setSeo] = useState<TriState>(toTri(hasSeo));
  const [hasAgency, setHasAgency] = useState<TriState>(
    hasExistingAgency === true ? "yes" : hasExistingAgency === false ? "no" : "unknown",
  );
  const [agencyName, setAgencyName] = useState(existingAgencyName ?? "");
  const [services, setServices] = useState<string[]>(existingAgencyServices ?? []);
  const [notes, setNotes] = useState(existingAgencyNotes ?? "");

  // Track whether the CURRENT value came from the scraper (heuristic: value === 'yes'
  // AND deep_crawl_attempted AND rep hasn't touched it in this session).
  const initialFromScraper = useMemo(
    () => ({
      gAds: Boolean(deepCrawlAttempted) && toTri(hasGoogleAds) === "yes",
      fbAds: Boolean(deepCrawlAttempted) && toTri(hasFacebookAds) === "yes",
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [contactId],
  );
  const [repTouched, setRepTouched] = useState<{ gAds: boolean; fbAds: boolean }>({ gAds: false, fbAds: false });

  useEffect(() => {
    setGAds(toTri(hasGoogleAds));
    setFbAds(toTri(hasFacebookAds));
    setSeo(toTri(hasSeo));
    setHasAgency(hasExistingAgency === true ? "yes" : hasExistingAgency === false ? "no" : "unknown");
    setAgencyName(existingAgencyName ?? "");
    setServices(existingAgencyServices ?? []);
    setNotes(existingAgencyNotes ?? "");
    setRepTouched({ gAds: false, fbAds: false });
  }, [contactId, hasGoogleAds, hasFacebookAds, hasSeo, hasExistingAgency, existingAgencyName, existingAgencyServices, existingAgencyNotes]);

  const persist = async (
    patch: Record<string, unknown>,
    label: string,
    ghlFields?: Record<string, string>,
  ) => {
    setSaving(label);
    try {
      await updateContact.mutateAsync({ id: contactId, ...patch });
      setSavedAt(Date.now());
      if (ghlContactId && ghlFields && Object.keys(ghlFields).length > 0) {
        try {
          await ghlUpdateContactFields(ghlContactId, ghlFields);
        } catch (err) {
          console.warn("[MarketingCapture] GHL push failed", err);
        }
      }
    } finally {
      setSaving(null);
    }
  };

  const triToDb = (v: TriState): string | null => (v === "yes" ? "yes" : v === "no" ? "no" : null);

  const onGAds = (v: TriState) => {
    setGAds(v);
    setRepTouched((t) => ({ ...t, gAds: true }));
    void persist(
      { has_google_ads: triToDb(v) },
      "Adwords",
      { "contact.has_google_ads": triToDb(v) ?? "" },
    );
  };
  const onFbAds = (v: TriState) => {
    setFbAds(v);
    setRepTouched((t) => ({ ...t, fbAds: true }));
    void persist(
      { has_facebook_ads: triToDb(v) },
      "Meta Ads",
      { "contact.has_facebookmeta_ads": triToDb(v) ?? "" },
    );
  };
  const onSeo = (v: TriState) => {
    setSeo(v);
    void persist(
      { has_seo: triToDb(v) },
      "SEO",
      { "contact.has_seo": triToDb(v) ?? "" },
    );
  };

  const toggleService = (val: string) => {
    const next = services.includes(val) ? services.filter((s) => s !== val) : [...services, val];
    setServices(next);
    void persist(
      { existing_agency_services: next },
      "services",
      { "contact.existing_agency_services": next.join(", ") },
    );
  };

  const showGAdsHint = initialFromScraper.gAds && !repTouched.gAds && gAds === "yes";
  const showFbAdsHint = initialFromScraper.fbAds && !repTouched.fbAds && fbAds === "yes";

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Marketing</span>
        </div>
        {saving ? (
          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <Loader2 className="h-2.5 w-2.5 animate-spin" /> Saving {saving}
          </span>
        ) : savedAt ? (
          <span className="inline-flex items-center gap-1 text-[10px] text-primary">
            <Check className="h-2.5 w-2.5" /> Saved
          </span>
        ) : null}
      </div>

      {/* Running Adwords */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <label className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Running Adwords
          </label>
          {showGAdsHint && (
            <span className="inline-flex items-center gap-1 text-[10px] text-sky-700 dark:text-sky-300">
              <Sparkles className="h-2.5 w-2.5" /> detected from website
            </span>
          )}
        </div>
        <TriButtons
          value={gAds}
          onChange={onGAds}
          labels={{ yes: "Yes", no: "No", unknown: "Not sure" }}
        />
      </div>

      {/* Meta Ads */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <label className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Meta Ads
          </label>
          {showFbAdsHint && (
            <span className="inline-flex items-center gap-1 text-[10px] text-sky-700 dark:text-sky-300">
              <Sparkles className="h-2.5 w-2.5" /> detected from website
            </span>
          )}
        </div>
        <TriButtons
          value={fbAds}
          onChange={onFbAds}
          labels={{ yes: "Yes", no: "No", unknown: "Not sure" }}
        />
      </div>

      {/* SEO */}
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-widest text-muted-foreground">
          SEO
        </label>
        <TriButtons
          value={seo}
          onChange={onSeo}
          labels={{ yes: "Yes", no: "No", unknown: "Not sure" }}
        />
      </div>

      {/* Existing Agency (bottom) */}
      <div className="space-y-2 border-t border-border pt-3">
        <label className="text-[10px] uppercase tracking-widest text-muted-foreground">
          Existing Agency
        </label>
        <p className="text-[11px] leading-tight text-muted-foreground">
          Prospects already paying an agency are actively investing in growth — higher intent for us.
        </p>
        <TriButtons
          value={hasAgency}
          onChange={(opt) => {
            setHasAgency(opt);
            void persist(
              {
                has_existing_agency: opt === "yes" ? true : opt === "no" ? false : null,
                ...(opt !== "yes" ? { existing_agency_services: [], existing_agency_name: null } : {}),
              },
              "agency status",
              {
                "contact.has_existing_agency": opt,
                ...(opt !== "yes"
                  ? { "contact.existing_agency_name": "", "contact.existing_agency_services": "" }
                  : {}),
              },
            );
          }}
          labels={{ yes: "Yes, has agency", no: "No agency", unknown: "Not sure" }}
        />

        {hasAgency === "yes" && (
          <div className="space-y-2 pt-1">
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Services they're buying
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {AGENCY_SERVICES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => toggleService(s.value)}
                    className={cn(
                      "rounded border px-2 py-1.5 text-left text-xs transition-colors",
                      services.includes(s.value)
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-card text-muted-foreground hover:border-muted-foreground/50",
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Agency name
              </label>
              <Input
                value={agencyName}
                onChange={(e) => setAgencyName(e.target.value)}
                onBlur={() =>
                  persist(
                    { existing_agency_name: agencyName || null },
                    "agency name",
                    { "contact.existing_agency_name": agencyName },
                  )
                }
                placeholder="e.g. King Kong, WebFX"
                className="h-8 text-xs"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Notes (spend, contract, pain points)
              </label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={() => persist({ existing_agency_notes: notes || null }, "agency notes")}
                placeholder="e.g. $3k/mo, unhappy with reporting, contract ends Aug"
                className="min-h-[60px] text-xs"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default MarketingCapture;