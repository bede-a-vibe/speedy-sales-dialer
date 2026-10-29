import { useState } from "react";
import { Phone, Pencil, Mail, Globe, MapPin, ExternalLink, User, MessageSquareText, Shield, UserCheck, UserX, Clock, CheckCircle2, CircleDashed, Smartphone, Landmark, Building2, AlertTriangle, PhoneOff, Star, Briefcase, Zap, Handshake } from "lucide-react";
import { resolveDialTarget } from "@/lib/dialTarget";
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
    dm_phone_verified?: boolean | null;
    dm_email?: string | null;
    gatekeeper_name?: string | null;
    gatekeeper_notes?: string | null;
    best_route_to_decision_maker?: string | null;
    best_route_to_dm?: string | null;
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
  /** Rep confirmed on a live call that this number reaches the named person. */
  onConfirmDM?: () => void;
  /** Rep reached someone else — clear the number and never re-add it. */
  onRejectDM?: () => void;
  /** Rename the business — scraped names go stale or are just wrong. */
  onRenameBusiness?: (name: string) => Promise<void> | void;
  /** Optional slot rendered in the header row (e.g. recovery actions). */
  headerActions?: React.ReactNode;
}

export function ContactCard({ contact, onAddDM, onCallDM, onConfirmDM, onRejectDM, onMarkPhoneQuality, onRenameBusiness, headerActions }: ContactCardProps) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(contact.business_name);
  const [isSavingName, setIsSavingName] = useState(false);

  const commitRename = async () => {
    const next = renameValue.trim();
    if (!next || next === contact.business_name) { setIsRenaming(false); return; }
    setIsSavingName(true);
    try {
      await onRenameBusiness?.(next);
      setIsRenaming(false);
    } finally {
      setIsSavingName(false);
    }
  };

  // A "DM number" identical to the office line is enrichment noise, not a
  // decision-maker route — never render it as one (last-9 digits compare).
  const cardLast9 = (v?: string | null) => (v ?? "").replace(/\D/g, "").slice(-9);
  if (contact.dm_phone && cardLast9(contact.dm_phone) === cardLast9(contact.phone)) {
    contact = { ...contact, dm_phone: null, dm_phone_type: null };
  }
  const phoneType = PHONE_TYPE_CONFIG[contact.phone_type || "unknown"] || PHONE_TYPE_CONFIG.unknown;
  const PhoneIcon = phoneType.icon;
  const hasDM = contact.dm_name || contact.dm_phone;
  const isDmVerified = Boolean(contact.dm_phone_verified);
  const dmPhoneType = contact.dm_phone_type ? PHONE_TYPE_CONFIG[contact.dm_phone_type] : null;
  const bestRouteToDecisionMaker = contact.best_route_to_decision_maker || contact.best_route_to_dm;
  const decisionMakerRole = contact.dm_role || contact.dm_title;
  const isBusinessRoutedNumber = contact.phone_type === "landline" || contact.phone_type === "business_line";
  // Same resolver the dial engine uses: on a switchboard main line an unverified
  // DM mobile is dialled first, otherwise the main number rings until a rep
  // confirms the DM number on a call. The note under the DM number must say
  // which one is true, or it tells the rep the wrong number will ring.
  const dmMobileRingsFirst = resolveDialTarget(contact).isDmDirect;
  // Switchboard checklist: what we still need to get past reception. The number
  // type itself is already on the phone row, so it is not repeated here.
  const businessLineWorkflowItems = isBusinessRoutedNumber
    ? [
        {
          label: "Direct line",
          value: contact.dm_phone ? contact.dm_phone : "still needed",
          complete: Boolean(contact.dm_phone),
        },
        {
          label: "Gatekeeper",
          value: contact.gatekeeper_name ? contact.gatekeeper_name : "not captured",
          complete: Boolean(contact.gatekeeper_name),
        },
        {
          label: "Route",
          value: bestRouteToDecisionMaker ? bestRouteToDecisionMaker : "ask how to reach the right person fastest",
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

      {/* Header: the name on its own line, then one line of context chips, then links and actions.
          Industry and location live here once (they used to repeat lower down), and actions
          sit on their own row so a long business name never has to wrap around them. */}
      <div className="space-y-2">
        {onRenameBusiness && isRenaming ? (
          <div className="flex items-center gap-1.5">
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); void commitRename(); }
                if (e.key === "Escape") { setIsRenaming(false); setRenameValue(contact.business_name); }
              }}
              className="w-full max-w-md rounded-md border border-primary/40 bg-background px-2 py-1 text-lg font-bold text-foreground outline-none"
            />
            <button type="button" onClick={() => void commitRename()} disabled={isSavingName}
              className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-700 dark:text-emerald-300">
              {isSavingName ? "Saving…" : "Save"}
            </button>
            <button type="button" onClick={() => { setIsRenaming(false); setRenameValue(contact.business_name); }}
              className="px-1.5 py-1 text-xs text-muted-foreground hover:text-foreground">
              Cancel
            </button>
          </div>
        ) : (
          <h3 className="group flex items-start gap-1.5 text-lg font-bold leading-tight text-foreground">
            <span className="min-w-0 break-words">{contact.business_name}</span>
            {onRenameBusiness && (
              <button
                type="button"
                title="Rename this business"
                onClick={() => { setRenameValue(contact.business_name); setIsRenaming(true); }}
                className="mt-1 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
              >
                <Pencil className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
              </button>
            )}
          </h3>
        )}

        {/* Context chips: who they are and where the lead sits, in one glance */}
        <div className="flex flex-wrap items-center gap-1.5">
          {contact.industry && (
            <span className="inline-flex items-center gap-1 rounded border border-border bg-accent px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest text-accent-foreground">
              <Briefcase className="h-3 w-3" />
              {contact.industry}
            </span>
          )}
          {(contact.city || contact.state) && (
            <span className="inline-flex items-center gap-1 rounded border border-border bg-secondary px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest text-secondary-foreground">
              <MapPin className="h-3 w-3" />
              {[contact.city, contact.state].filter(Boolean).join(", ")}
            </span>
          )}
          {contact.contact_person && (
            <span className="inline-flex items-center gap-1 rounded border border-border bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground">
              <User className="h-3 w-3" />
              {contact.contact_person}
            </span>
          )}
          {contact.lifecycle_stage && (
            <span className={`rounded border px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest ${LIFECYCLE_STAGE_COLORS[contact.lifecycle_stage as LifecycleStage] || "bg-accent text-accent-foreground border-border"}`}>
              {LIFECYCLE_STAGE_LABELS[contact.lifecycle_stage as LifecycleStage] || contact.lifecycle_stage}
            </span>
          )}
          {tierCfg && (
            <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-widest ${tierCfg.color}`}>
              <Zap className="h-3 w-3" />
              {tierCfg.label}
            </span>
          )}
          {poolCfg && poolLabel && (
            <span className={`rounded border px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest ${poolCfg.color}`}>
              {poolLabel}
            </span>
          )}
          {hasRating && (
            <span className="inline-flex items-center gap-1 rounded border border-yellow-500/30 bg-yellow-500/10 px-2 py-0.5 text-[10px] font-mono text-amber-800 dark:text-yellow-300" title={`${reviewCount} Google reviews`}>
              <Star className="h-3 w-3 fill-yellow-500 text-yellow-600 dark:fill-yellow-400 dark:text-yellow-400" />
              {rating ? rating.toFixed(1) : "—"} ({reviewCount})
            </span>
          )}
          {contact.business_size && (
            <span className="rounded border border-border bg-secondary px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest text-secondary-foreground">
              {contact.business_size}
            </span>
          )}
          {contact.buying_signal_strength && contact.buying_signal_strength !== "None" && (
            <span className="inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest text-emerald-700 dark:text-emerald-300">
              <Zap className="h-3 w-3" />
              Signal: {contact.buying_signal_strength}
            </span>
          )}
        </div>

        {/* Links on the left, actions on the right */}
        {(() => {
          const ghlUrl = getGhlContactUrl(contact.ghl_contact_id);
          const hasLinks = Boolean(contact.gmb_link || ghlUrl || contact.website || contact.email);
          if (!hasLinks && !headerActions) return null;
          const linkClass = "inline-flex items-center gap-1 rounded-md border border-border bg-secondary px-2 py-1 text-[11px] text-secondary-foreground transition-colors hover:bg-accent";
          return (
            <div className="flex flex-wrap items-center gap-1.5">
              {contact.gmb_link && (
                <a href={contact.gmb_link} target="_blank" rel="noopener noreferrer" className={linkClass} title="Google Business Profile">
                  <MapPin className="h-3 w-3" /> GMB <ExternalLink className="h-2.5 w-2.5 opacity-50" />
                </a>
              )}
              {ghlUrl && (
                <a href={ghlUrl} target="_blank" rel="noopener noreferrer" className={linkClass} title="Open contact in GoHighLevel">
                  <UserCheck className="h-3 w-3" /> GHL <ExternalLink className="h-2.5 w-2.5 opacity-50" />
                </a>
              )}
              {contact.website && (
                <a href={contact.website} target="_blank" rel="noopener noreferrer" className={linkClass} title={contact.website}>
                  <Globe className="h-3 w-3" /> Website <ExternalLink className="h-2.5 w-2.5 opacity-50" />
                </a>
              )}
              {contact.email && (
                <a href={`mailto:${contact.email}`} className={`${linkClass} max-w-[220px]`} title={contact.email}>
                  <Mail className="h-3 w-3 shrink-0" /> <span className="truncate">{contact.email}</span>
                </a>
              )}
              {headerActions && <div className="ml-auto flex items-center gap-1.5">{headerActions}</div>}
            </div>
          );
        })()}
      </div>

      {/* Phone: the number, its type, the attempts, and the number-quality control on one line */}
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={`tel:${contact.phone}`}
          className="group flex min-w-[200px] flex-1 items-center gap-2 rounded-md border border-primary/20 bg-primary/10 px-3 py-2 text-primary transition-colors hover:bg-primary/20"
        >
          <PhoneIcon className="h-4 w-4 shrink-0 group-hover:animate-pulse" />
          <span className="font-mono text-sm font-semibold">{contact.phone}</span>
          <span className={`ml-auto rounded border px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-widest ${phoneType.color}`}>
            {phoneType.label}
          </span>
        </a>
        {(contact.call_attempt_count ?? 0) > 0 && (
          <span className="rounded border border-border bg-accent px-2 py-1 font-mono text-[11px] text-muted-foreground" title="Dials to this lead so far">
            {contact.call_attempt_count} attempt{(contact.call_attempt_count ?? 0) !== 1 ? "s" : ""}
          </span>
        )}
        {(contact.voicemail_count ?? 0) > 0 && (
          <span className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 font-mono text-[11px] text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
            {contact.voicemail_count} VM{(contact.voicemail_count ?? 0) !== 1 ? "s" : ""}
          </span>
        )}
        {onMarkPhoneQuality && (
          <div className="flex items-center gap-0.5 rounded-md border border-border bg-card p-0.5" role="group" aria-label="Number quality">
            {["confirmed", "suspect", "dead"].map((q) => {
              const cfg = PHONE_QUALITY_CONFIG[q];
              const QIcon = cfg.icon;
              const isActive = contact.phone_number_quality === q;
              return (
                <button
                  key={q}
                  type="button"
                  onClick={() => onMarkPhoneQuality(q)}
                  title={`Number ${cfg.label.toLowerCase()}`}
                  aria-pressed={isActive}
                  className={`flex items-center gap-1 rounded border px-1.5 py-1 text-[10px] transition-colors ${
                    isActive ? cfg.color : "border-transparent bg-transparent text-muted-foreground/60 hover:bg-accent hover:text-foreground"
                  }`}
                >
                  <QIcon className="h-3 w-3" />
                  {isActive && <span className="font-mono uppercase tracking-widest">{cfg.label}</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Decision maker: who to ask for, the direct line, and whether we trust it. On a
          switchboard main line it also carries the checklist for getting past reception.
          One block instead of two stacked cards (Bede, 29 Oct 2026). */}
      {(hasDM || isBusinessRoutedNumber) && (
        <div
          className={`rounded-md border p-3 space-y-2 ${
            hasDM ? "border-green-500/25 bg-green-500/10" : "border-sky-500/30 bg-sky-500/10"
          }`}
          data-testid="decision-maker-block"
        >
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p
              className={`flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest ${
                hasDM ? "text-green-800 dark:text-green-300" : "text-sky-800 dark:text-sky-300"
              }`}
            >
              <UserCheck className="h-3.5 w-3.5" />
              Decision maker
            </p>
            {contact.dm_name && (
              <span className="text-sm font-semibold text-foreground">
                {contact.dm_name}
                {decisionMakerRole && (
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">{decisionMakerRole}</span>
                )}
              </span>
            )}
            {contact.dm_phone && (
              <span
                className={`ml-auto rounded border px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-widest ${
                  isDmVerified
                    ? "border-green-500/30 bg-green-500/10 text-green-800 dark:text-green-300"
                    : "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300"
                }`}
              >
                {isDmVerified ? "Verified" : "Unverified"}
              </span>
            )}
          </div>

          {hasDM && (contact.dm_phone || contact.dm_email) && (
            <div className="flex flex-wrap items-center gap-1.5">
              {contact.dm_phone && (onCallDM ? (
                <button
                  type="button"
                  onClick={() => onCallDM(contact.dm_phone!)}
                  title="Call the decision maker direct"
                  className="flex items-center gap-1.5 rounded-md border border-green-500/30 bg-green-500/15 px-2.5 py-1 font-mono text-sm text-green-800 transition-colors hover:bg-green-500/25 dark:bg-green-500/20 dark:text-green-300 dark:hover:bg-green-500/30"
                >
                  <Smartphone className="h-3.5 w-3.5" />
                  {contact.dm_phone}
                </button>
              ) : (
                <a
                  href={`tel:${contact.dm_phone}`}
                  title="Decision maker direct line"
                  className="flex items-center gap-1.5 rounded-md border border-green-500/30 bg-green-500/15 px-2.5 py-1 font-mono text-sm text-green-800 transition-colors hover:bg-green-500/25 dark:bg-green-500/20 dark:text-green-300 dark:hover:bg-green-500/30"
                >
                  <Smartphone className="h-3.5 w-3.5" />
                  {contact.dm_phone}
                </a>
              ))}
              {contact.dm_phone && dmPhoneType && (
                <span className={`rounded border px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-widest ${dmPhoneType.color}`}>
                  {dmPhoneType.label}
                </span>
              )}
              {contact.dm_email && (
                <a
                  href={`mailto:${contact.dm_email}`}
                  title={contact.dm_email}
                  className="inline-flex max-w-[240px] items-center gap-1 rounded-md border border-border bg-secondary px-2 py-1 text-[11px] text-secondary-foreground transition-colors hover:bg-accent"
                >
                  <Mail className="h-3 w-3 shrink-0" />
                  <span className="truncate">{contact.dm_email}</span>
                </a>
              )}
            </div>
          )}

          {contact.dm_phone && !isDmVerified && (
            <p className="text-[11px] leading-snug text-amber-800/90 dark:text-amber-200/90">
              {dmMobileRingsFirst
                ? "Not confirmed yet. The main line is a switchboard, so the dialer tries this mobile first. Confirm or reject it on the call."
                : `Not confirmed yet. The dialer calls the main line until you confirm this reaches ${contact.dm_name || "the decision maker"}.`}
            </p>
          )}

          {contact.dm_phone && (onConfirmDM || onRejectDM) && (
            <div className="flex flex-wrap items-center gap-1.5">
              {onConfirmDM && !isDmVerified && (
                <button
                  type="button"
                  onClick={onConfirmDM}
                  className="flex h-7 items-center gap-1.5 rounded-md border border-green-500/40 bg-green-500/10 px-2 text-[11px] font-medium text-green-800 transition-colors hover:bg-green-500/20 dark:text-green-300"
                >
                  <UserCheck className="h-3 w-3" />
                  Right person, confirm
                </button>
              )}
              {onRejectDM && (
                <button
                  type="button"
                  onClick={onRejectDM}
                  className="flex h-7 items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-2 text-[11px] font-medium text-destructive transition-colors hover:bg-destructive/20"
                >
                  <UserX className="h-3 w-3" />
                  Wrong person, remove number
                </button>
              )}
            </div>
          )}

          {!hasDM && (onAddDM ? (
            <button
              type="button"
              onClick={onAddDM}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-sky-500/40 bg-background/60 px-3 py-2 text-xs text-sky-900 transition-colors hover:bg-background dark:text-sky-100"
            >
              <UserCheck className="h-3.5 w-3.5" />
              Add decision maker details
            </button>
          ) : (
            <p className="text-[11px] leading-snug text-sky-900/85 dark:text-sky-100/85">
              {isBusinessRoutedNumber
                ? "No decision maker on file. Use this call to find out who runs the show and get a direct mobile or extension before requeueing."
                : "No decision maker on file. Capture the name and a direct mobile or extension in Capture details once you have it."}
            </p>
          ))}

          {hasDM && !contact.dm_phone && isBusinessRoutedNumber && (
            <p className="text-[11px] leading-snug text-sky-900/85 dark:text-sky-100/85">
              No direct line yet. Use this call to get {contact.dm_name ? `${contact.dm_name}'s` : "the decision maker's"} mobile or extension before requeueing.
            </p>
          )}

          {isBusinessRoutedNumber && (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Switchboard checklist">
              {businessLineWorkflowItems.map((item) => {
                const StatusIcon = item.complete ? CheckCircle2 : CircleDashed;
                return (
                  <span
                    key={item.label}
                    title={`${item.label}: ${item.value}`}
                    className={`inline-flex max-w-full items-center gap-1 rounded border px-2 py-0.5 text-[11px] ${
                      item.complete
                        ? "border-green-500/30 bg-green-500/10 text-green-900 dark:text-green-200"
                        : "border-sky-500/30 bg-background/60 text-sky-900/85 dark:text-sky-100/85"
                    }`}
                  >
                    <StatusIcon className="h-3 w-3 shrink-0" />
                    <span className="font-mono text-[10px] uppercase tracking-widest">{item.label}</span>
                    <span className="truncate">{item.value}</span>
                  </span>
                );
              })}
            </div>
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
    </div>
  );
}
