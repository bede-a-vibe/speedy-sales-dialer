import { Phone, Mail, Globe, MapPin, ExternalLink, User, MessageSquareText, Shield, UserCheck, Clock, Smartphone, Landmark, Building2, AlertTriangle, PhoneOff, ArrowRight, Info, CheckCircle2, CircleDashed, Star, Briefcase, Zap, Handshake } from "lucide-react";
import { getGhlContactUrl } from "@/lib/ghlUrls";
import { LIFECYCLE_STAGE_COLORS, LIFECYCLE_STAGE_LABELS, type LifecycleStage } from "@/data/constants";

const PHONE_QUALITY_CONFIG: Record<string, { label: string; color: string; icon: typeof Phone }> = {
  confirmed: { label: "Confirmed", color: "text-green-700 dark:text-green-300 bg-green-500/10 dark:bg-green-500/15 border-green-500/30", icon: Phone },
  unconfirmed: { label: "Unconfirmed", color: "text-muted-foreground bg-accent border-border", icon: Phone },
  suspect: { label: "Suspect", color: "text-amber-700 dark:text-yellow-300 bg-yellow-500/10 dark:bg-yellow-500/15 border-yellow-500/30", icon: AlertTriangle },
  dead: { label: "Dead", color: "text-rose-700 dark:text-red-300 bg-red-500/10 dark:bg-red-500/15 border-red-500/30", icon: PhoneOff },
};

const PHONE_TYPE_CONFIG: Record<string, { label: string; color: string; icon: typeof Phone }> = {
  mobile: { label: "Mobile", color: "text-green-700 dark:text-green-300 bg-green-500/10 dark:bg-green-500/15 border-green-500/30", icon: Smartphone },
  landline: { label: "Landline", color: "text-orange-700 dark:text-orange-300 bg-orange-500/10 dark:bg-orange-500/15 border-orange-500/30", icon: Landmark },
  business_line: { label: "Business", color: "text-blue-700 dark:text-blue-300 bg-blue-500/10 dark:bg-blue-500/15 border-blue-500/30", icon: Building2 },
  unknown: { label: "Unknown", color: "text-muted-foreground bg-accent border-border", icon: Phone },
};

const TIER_CONFIG: Record<string, { label: string; color: string }> = {
  "Tier 1 - Hot": { label: "Hot", color: "text-rose-700 dark:text-red-300 bg-red-500/10 dark:bg-red-500/20 border-red-500/30 dark:border-red-500/40" },
  "Tier 2 - Warm": { label: "Warm", color: "text-amber-700 dark:text-amber-300 bg-amber-500/10 dark:bg-amber-500/20 border-amber-500/30 dark:border-amber-500/40" },
  "Tier 3 - Nurture": { label: "Nurture", color: "text-blue-700 dark:text-blue-300 bg-blue-500/10 dark:bg-blue-500/20 border-blue-500/30 dark:border-blue-500/40" },
  "Tier 4 - Long Shot": { label: "Long Shot", color: "text-slate-700 dark:text-slate-300 bg-slate-500/10 dark:bg-slate-500/20 border-slate-500/30 dark:border-slate-500/40" },
  "Tier 5 - New / No Reviews": { label: "New / No Reviews", color: "text-violet-700 dark:text-violet-300 bg-violet-500/10 dark:bg-violet-500/20 border-violet-500/30 dark:border-violet-500/40" },
};

const POOL_CONFIG: Record<string, { label: string; color: string }> = {
  cold: { label: "Cold", color: "text-slate-700 dark:text-slate-300 bg-slate-500/10 dark:bg-slate-500/15 border-slate-500/30" },
  warm: { label: "Warm", color: "text-green-700 dark:text-green-300 bg-green-500/10 dark:bg-green-500/15 border-green-500/30" },
  outbound: { label: "Outbound", color: "text-indigo-700 dark:text-indigo-300 bg-indigo-500/10 dark:bg-indigo-500/15 border-indigo-500/30" },
};

interface ContactCardProps {
  contact: {
    business_name: string;
    contact_person: string | null;
    phone: string;
    phone_type?: string | null;
    email: string | null;
    website: string | null;
    gmb_link: string | null;
    industry: string;
    city: string | null;
    state: string | null;
    follow_up_note?: string | null;
    dm_name?: string | null;
    dm_role?: string | null;
    dm_title?: string | null;
    dm_phone?: string | null;
    dm_phone_type?: string | null;
    dm_email?: string | null;
    gatekeeper_name?: string | null;
    gatekeeper_notes?: string | null;
    best_route_to_decision_maker?: string | null;
    best_route_to_dm?: string | null;
    best_time_to_call?: string | null;
    phone_number_quality?: string | null;
    call_attempt_count?: number | null;
    voicemail_count?: number | null;
    ghl_contact_id?: string | null;
    prospect_tier?: string | null;
    lead_type?: string | null;
    lead_channel?: string | null;
    lead_source?: string | null;
    google_rating?: number | null;
    google_review_count?: number | null;
    gbp_rating?: number | null;
    review_count?: number | null;
    business_size?: string | null;
    buying_signal_strength?: string | null;
    has_existing_agency?: boolean | null;
    existing_agency_name?: string | null;
    existing_agency_services?: string[] | null;
    lifecycle_stage?: string | null;
  };
  onMarkPhoneQuality?: (quality: string) => void;
  onAddDM?: () => void;
  onCallDM?: (phone: string) => void;
  /** Optional slot rendered in the header row (e.g. recovery actions). */
  headerActions?: React.ReactNode;
}

export function ContactCard({ contact, onAddDM, onCallDM, onMarkPhoneQuality, headerActions }: ContactCardProps) {
  const phoneType = PHONE_TYPE_CONFIG[contact.phone_type || "unknown"] || PHONE_TYPE_CONFIG.unknown;
  const PhoneIcon = phoneType.icon;
  const hasDM = contact.dm_name || contact.dm_phone;
  const dmPhoneType = contact.dm_phone_type ? PHONE_TYPE_CONFIG[contact.dm_phone_type] : null;
  const bestRouteToDecisionMaker = contact.best_route_to_decision_maker || contact.best_route_to_dm;
  const decisionMakerRole = contact.dm_role || contact.dm_title;
  const isBusinessRoutedNumber = contact.phone_type === "landline" || contact.phone_type === "business_line";
  const dialStrategyLabel = contact.dm_phone
    ? "Best route"
    : isBusinessRoutedNumber
      ? "Switchboard route"
      : "Primary route";
  const dialStrategySummary = contact.dm_phone
    ? `Call the decision maker direct on ${contact.dm_phone}.`
    : isBusinessRoutedNumber
      ? contact.gatekeeper_name
        ? `Main line likely routes through ${contact.gatekeeper_name}.`
        : "Main line likely routes through reception or a gatekeeper."
      : "This looks like a direct number, so start here.";
  const businessLineWorkflowItems = isBusinessRoutedNumber
    ? [
        {
          label: "Number type",
          value: phoneType.label,
          complete: true,
        },
        {
          label: "Decision maker direct line",
          value: contact.dm_phone ? contact.dm_phone : "Still needed",
          complete: Boolean(contact.dm_phone),
        },
        {
          label: "Gatekeeper context",
          value: contact.gatekeeper_name ? contact.gatekeeper_name : "Not captured",
          complete: Boolean(contact.gatekeeper_name),
        },
        {
          label: "Routing guidance",
          value: bestRouteToDecisionMaker ? bestRouteToDecisionMaker : "Ask how to reach the right person fastest",
          complete: Boolean(bestRouteToDecisionMaker),
        },
      ]
    : [];

  const tierCfg = contact.prospect_tier ? TIER_CONFIG[contact.prospect_tier] : null;
  const poolCfg = contact.lead_type ? POOL_CONFIG[contact.lead_type.toLowerCase()] : null;
  const channelLabel = contact.lead_channel && contact.lead_channel.toLowerCase() !== "all" ? contact.lead_channel : null;
  const poolLabel = poolCfg
    ? channelLabel
      ? `${poolCfg.label} · ${channelLabel.charAt(0).toUpperCase() + channelLabel.slice(1)}`
      : poolCfg.label
    : null;
  const rating = contact.google_rating ?? contact.gbp_rating ?? null;
  const reviewCount = contact.google_review_count ?? contact.review_count ?? 0;
  const hasRating = reviewCount > 0;
  const agencyServices = (contact.existing_agency_services || []).filter(Boolean);

  return (
    <div className="bg-card border border-border rounded-lg p-5 space-y-4 shadow-card transition-all duration-200 motion-safe:hover:-translate-y-px hover:shadow-md hover:border-primary/40">
      {/* Follow-up Note Banner */}
      {contact.follow_up_note && (
        <div className="flex items-start gap-2.5 bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/30 rounded-md px-3.5 py-2.5 text-amber-900 dark:text-amber-100">
          <MessageSquareText className="h-4 w-4 mt-0.5 shrink-0 text-amber-700 dark:text-amber-300" />
          <div>
            <p className="text-[10px] uppercase tracking-widest font-mono text-amber-800 dark:text-amber-300 mb-0.5">Follow-up Note</p>
            <p className="text-sm leading-snug">{contact.follow_up_note}</p>
          </div>
        </div>
      )}

      {/* Gatekeeper Warning Banner */}
      {contact.gatekeeper_name && isBusinessRoutedNumber && (
        <div className="flex items-start gap-2.5 bg-orange-500/10 dark:bg-orange-500/15 border border-orange-500/30 rounded-md px-3.5 py-2.5 text-orange-900 dark:text-orange-100">
          <Shield className="h-4 w-4 mt-0.5 shrink-0 text-orange-700 dark:text-orange-300" />
          <div>
            <p className="text-[10px] uppercase tracking-widest font-mono text-orange-800 dark:text-orange-300 mb-0.5">Gatekeeper</p>
            <p className="text-sm leading-snug">
              <span className="font-semibold">{contact.gatekeeper_name}</span>
              {bestRouteToDecisionMaker && (
                <span className="ml-2 text-orange-800/80 dark:text-orange-300/80">
                  <Clock className="h-3 w-3 inline mr-1" />
                  Route: {bestRouteToDecisionMaker}
                </span>
              )}
            </p>
            {contact.gatekeeper_notes && (
              <p className="mt-1 text-xs leading-snug text-orange-900/90 dark:text-orange-100/90">{contact.gatekeeper_notes}</p>
            )}
          </div>
        </div>
      )}

      {/* Business Name & Industry */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-bold text-foreground">{contact.business_name}</h3>
          {contact.contact_person && (
            <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-1">
              <User className="h-3.5 w-3.5" />
              {contact.contact_person}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {headerActions}
          {contact.lifecycle_stage && (
            <span className={`text-[10px] uppercase tracking-widest font-mono px-2 py-1 rounded border ${LIFECYCLE_STAGE_COLORS[contact.lifecycle_stage as LifecycleStage] || "bg-accent text-accent-foreground border-border"}`}>
              {LIFECYCLE_STAGE_LABELS[contact.lifecycle_stage as LifecycleStage] || contact.lifecycle_stage}
            </span>
          )}
          <span className="text-[10px] uppercase tracking-widest font-mono bg-accent text-accent-foreground px-2 py-1 rounded">
            {contact.industry}
          </span>
        </div>
      </div>

      {/* Intelligence badge row */}
      {(tierCfg || poolLabel || contact.industry || hasRating || contact.business_size || contact.buying_signal_strength) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {tierCfg && (
            <span className={`inline-flex items-center gap-1 text-[11px] uppercase tracking-wider font-mono font-bold px-2.5 py-1 rounded border ${tierCfg.color}`}>
              <Zap className="h-3 w-3" />
              {tierCfg.label}
            </span>
          )}
          {poolCfg && poolLabel && (
            <span className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-widest font-mono px-2 py-1 rounded border ${poolCfg.color}`}>
              {poolLabel}
            </span>
          )}
          {contact.industry && (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest font-mono px-2 py-1 rounded border border-border bg-accent text-accent-foreground">
              <Briefcase className="h-3 w-3" />
              {contact.industry}
            </span>
          )}
          {hasRating && (
            <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-1 rounded border border-yellow-500/30 bg-yellow-500/10 text-amber-800 dark:text-yellow-300">
              <Star className="h-3 w-3 fill-yellow-500 text-yellow-600 dark:fill-yellow-400 dark:text-yellow-400" />
              {rating ? rating.toFixed(1) : "—"} · {reviewCount} reviews
            </span>
          )}
          {contact.business_size && (
            <span className="inline-flex items-center text-[10px] uppercase tracking-widest font-mono px-2 py-1 rounded border border-border bg-secondary text-secondary-foreground">
              {contact.business_size}
            </span>
          )}
          {contact.buying_signal_strength && (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest font-mono px-2 py-1 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
              <Zap className="h-3 w-3" />
              Signal: {contact.buying_signal_strength}
            </span>
          )}
        </div>
      )}

      {/* Existing agency callout */}
      {contact.has_existing_agency && (
        <div className="flex items-start gap-2.5 bg-fuchsia-500/10 border border-fuchsia-500/30 rounded-md px-3.5 py-2.5 text-fuchsia-900 dark:text-fuchsia-100">
          <Handshake className="h-4 w-4 mt-0.5 shrink-0 text-fuchsia-700 dark:text-fuchsia-300" />
          <div>
            <p className="text-[10px] uppercase tracking-widest font-mono text-fuchsia-800 dark:text-fuchsia-300 mb-0.5">Already Investing in Growth</p>
            <p className="text-sm leading-snug">
              Already with an agency{contact.existing_agency_name ? `: ${contact.existing_agency_name}` : ""}
              {agencyServices.length > 0 && (
                <span className="text-fuchsia-800/80 dark:text-fuchsia-200/80"> ({agencyServices.join(", ")})</span>
              )}
              <span className="block text-xs text-fuchsia-800/80 dark:text-fuchsia-200/80 mt-0.5">Higher intent — they're already spending. Position as an upgrade.</span>
            </p>
          </div>
        </div>
      )}

      {/* Business Phone with Type Badge */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <a
            href={`tel:${contact.phone}`}
            className="flex-1 flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-md px-3 py-2.5 text-primary hover:bg-primary/20 transition-colors group"
          >
            <PhoneIcon className="h-4 w-4 group-hover:animate-pulse" />
            <span className="font-mono text-sm font-semibold">{contact.phone}</span>
          </a>
          <span className={`text-[10px] uppercase tracking-widest font-mono px-2 py-1.5 rounded border ${phoneType.color}`}>
            {phoneType.label}
          </span>
        </div>

        {/* Call Stats & Phone Quality */}
        <div className="flex items-center gap-2 text-xs">
          {(contact.call_attempt_count ?? 0) > 0 && (
            <span className="font-mono text-muted-foreground bg-accent px-2 py-1 rounded border border-border">
              {contact.call_attempt_count} attempt{(contact.call_attempt_count ?? 0) !== 1 ? 's' : ''}
            </span>
          )}
          {(contact.voicemail_count ?? 0) > 0 && (
            <span className="font-mono text-amber-400 bg-amber-500/15 px-2 py-1 rounded border border-amber-500/30">
              {contact.voicemail_count} VM{(contact.voicemail_count ?? 0) !== 1 ? 's' : ''}
            </span>
          )}
          {onMarkPhoneQuality && (
            <div className="flex items-center gap-1 ml-auto">
              {['confirmed', 'suspect', 'dead'].map((q) => {
                const cfg = PHONE_QUALITY_CONFIG[q];
                const QIcon = cfg.icon;
                const isActive = contact.phone_number_quality === q;
                return (
                  <button
                    key={q}
                    onClick={() => onMarkPhoneQuality(q)}
                    title={`Mark as ${cfg.label}`}
                    className={`p-1 rounded border transition-colors ${
                      isActive ? cfg.color + ' ring-1 ring-offset-1 ring-offset-background' : 'text-muted-foreground/50 bg-transparent border-transparent hover:' + cfg.color
                    }`}
                  >
                    <QIcon className="h-3 w-3" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Dial Strategy */}
      <div className="rounded-md border border-border bg-background/80 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 text-primary" />
          <p className="text-[10px] uppercase tracking-widest font-mono text-muted-foreground">{dialStrategyLabel}</p>
        </div>
        <p className="text-sm text-foreground">{dialStrategySummary}</p>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          {bestRouteToDecisionMaker && (
            <span className="inline-flex items-center gap-1 rounded border border-border bg-secondary px-2 py-1">
              <ArrowRight className="h-3 w-3" /> Route: {bestRouteToDecisionMaker}
            </span>
          )}
          {contact.best_time_to_call && (
            <span className="inline-flex items-center gap-1 rounded border border-border bg-secondary px-2 py-1">
              <Clock className="h-3 w-3" /> Best time: {contact.best_time_to_call}
            </span>
          )}
        </div>
      </div>

      {isBusinessRoutedNumber && (
        <div className="rounded-md border border-sky-500/30 bg-sky-500/10 p-3 space-y-3">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-sky-300" />
            <p className="text-[10px] uppercase tracking-widest font-mono text-sky-300">Business Line Workflow</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {businessLineWorkflowItems.map((item) => {
              const StatusIcon = item.complete ? CheckCircle2 : CircleDashed;
              return (
                <div key={item.label} className="rounded-md border border-sky-500/20 bg-background/60 px-3 py-2">
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest font-mono text-sky-200/80">
                    <StatusIcon className={`h-3.5 w-3.5 ${item.complete ? 'text-green-400' : 'text-sky-300/70'}`} />
                    {item.label}
                  </div>
                  <p className="mt-1 text-sm text-foreground">{item.value}</p>
                </div>
              );
            })}
          </div>
          {!contact.dm_phone && (
            <p className="text-xs text-sky-100/85">
              Best next step: use this call to confirm the correct decision maker and capture a direct mobile or extension before requeueing.
            </p>
          )}
        </div>
      )}

      {/* Decision Maker Section */}
      {hasDM ? (
        <div className="bg-green-500/10 border border-green-500/25 rounded-md p-3 space-y-2">
          <div className="flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-green-400" />
            <p className="text-[10px] uppercase tracking-widest font-mono text-green-400">Decision Maker</p>
          </div>
          <div className="space-y-1.5">
            {contact.dm_name && (
              <p className="text-sm font-semibold text-foreground">
                {contact.dm_name}
                {decisionMakerRole && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">({decisionMakerRole})</span>
                )}
              </p>
            )}
            {contact.dm_phone && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onCallDM?.(contact.dm_phone!)}
                  className="flex items-center gap-2 bg-green-500/20 border border-green-500/30 rounded-md px-3 py-1.5 text-green-300 hover:bg-green-500/30 transition-colors text-sm font-mono"
                >
                  <Smartphone className="h-3.5 w-3.5" />
                  {contact.dm_phone}
                </button>
                {dmPhoneType && (
                  <span className={`text-[9px] uppercase tracking-widest font-mono px-1.5 py-1 rounded border ${dmPhoneType.color}`}>
                    {dmPhoneType.label}
                  </span>
                )}
              </div>
            )}
            {contact.dm_email && (
              <a
                href={`mailto:${contact.dm_email}`}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <Mail className="h-3.5 w-3.5" />
                {contact.dm_email}
              </a>
            )}
          </div>
        </div>
      ) : (
        contact.phone_type === "landline" || contact.phone_type === "business_line" ? (
          <button
            onClick={onAddDM}
            className="w-full flex items-center justify-center gap-2 bg-secondary/50 border border-dashed border-border rounded-md px-3 py-2.5 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors text-sm"
          >
            <UserCheck className="h-4 w-4" />
            Add Decision Maker Details
          </button>
        ) : null
      )}

      {/* Contact Info Grid */}
      <div className="grid grid-cols-2 gap-3">
        <a
          href={`mailto:${contact.email}`}
          className="flex items-center gap-2 bg-secondary border border-border rounded-md px-3 py-2.5 text-secondary-foreground hover:bg-accent transition-colors"
        >
          <Mail className="h-4 w-4" />
          <span className="text-sm truncate">{contact.email || "No email"}</span>
        </a>

        <a
          href={contact.website || "#"}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 bg-secondary border border-border rounded-md px-3 py-2.5 text-secondary-foreground hover:bg-accent transition-colors"
        >
          <Globe className="h-4 w-4" />
          <span className="text-sm truncate">Website</span>
          <ExternalLink className="h-3 w-3 ml-auto opacity-50" />
        </a>

        <a
          href={contact.gmb_link || "#"}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 bg-secondary border border-border rounded-md px-3 py-2.5 text-secondary-foreground hover:bg-accent transition-colors"
        >
          <MapPin className="h-4 w-4" />
          <span className="text-sm truncate">GMB Profile</span>
          <ExternalLink className="h-3 w-3 ml-auto opacity-50" />
        </a>

        {(() => {
          const ghlUrl = getGhlContactUrl(contact.ghl_contact_id);
          if (!ghlUrl) return null;
          return (
            <a
              href={ghlUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Open contact in GoHighLevel"
              className="flex items-center gap-2 bg-secondary border border-border rounded-md px-3 py-2.5 text-secondary-foreground hover:bg-accent transition-colors"
            >
              <UserCheck className="h-4 w-4" />
              <span className="text-sm truncate">GHL Contact</span>
              <ExternalLink className="h-3 w-3 ml-auto opacity-50" />
            </a>
          );
        })()}

        {(contact.city || contact.state) && (
          <div className="flex items-center gap-2 bg-secondary border border-border rounded-md px-3 py-2.5 text-secondary-foreground">
            <MapPin className="h-4 w-4" />
            <span className="text-sm truncate">{[contact.city, contact.state].filter(Boolean).join(", ")}</span>
          </div>
        )}
      </div>
    </div>
  );
}
