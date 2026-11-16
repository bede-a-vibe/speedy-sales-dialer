/**
 * The ONE place that decides which number a lead gets dialled on.
 *
 * The dial engine reads this to pick the number, the call strip shows that
 * number with a DM-direct badge, and the contact card uses it to word the
 * note under an unverified decision-maker mobile. One resolver, so nothing a
 * rep sees can disagree with the number that actually rings.
 *
 * Policy (set 17 Sep 2026, after scraped decision-maker numbers proved
 * consistently wrong — including numbers belonging to other businesses):
 *  - The main number wins by default. On a mobile-first tradie business the
 *    main mobile IS the owner, so a scraped "decision maker" number adds risk
 *    without adding reach.
 *  - An unverified DM number is only worth the risk when the main line is a
 *    switchboard (landline / 1300 / 1800), where a direct mobile is the only
 *    way past reception.
 *  - A rep-confirmed DM number is always trusted, whatever the main line is.
 *  - A "DM number" identical to the main number is enrichment noise, ignored.
 */

export interface DialTargetContact {
  phone?: string | null;
  phone_type?: string | null;
  dm_phone?: string | null;
  dm_phone_verified?: boolean | null;
}

export interface DialTarget {
  /** The number that will actually be dialled. */
  number: string | null;
  /** True only when we're deliberately dialling a decision-maker direct line. */
  isDmDirect: boolean;
  /** Plain-English reason for the choice. Not rendered anywhere since the route card went (29 Oct 2026); kept for logs and tooling. */
  reason: string;
}

const last9 = (value?: string | null) => (value ?? "").replace(/\D/g, "").slice(-9);

/**
 * An Australian number in the form Dialpad accepts (+61...). Reps type numbers
 * every which way ("0412 174 299", "+0412174299", "412174299", "61 412..."),
 * and a "+0" number cannot ring. Anything that isn't recognisably Australian is
 * passed through with only spaces and punctuation removed.
 */
export function toDialableAU(value?: string | null): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (/^0[2-478]\d{8}$/.test(digits)) return `+61${digits.slice(1)}`;
  if (/^[2-478]\d{8}$/.test(digits)) return `+61${digits}`;
  if (/^61[2-478]\d{8}$/.test(digits)) return `+${digits}`;
  if (/^610[2-478]\d{8}$/.test(digits)) return `+61${digits.slice(3)}`;
  if (/^1[38]00\d{6}$/.test(digits) || /^13\d{4}$/.test(digits)) return digits;
  return raw.startsWith("+") ? `+${digits}` : digits;
}

/** Landline and 1300/1800 numbers route through reception; mobiles don't. */
export function isSwitchboardNumber(phoneType?: string | null): boolean {
  return phoneType === "landline" || phoneType === "business_line";
}

export function resolveDialTarget(contact: DialTargetContact | null | undefined): DialTarget {
  const main = toDialableAU(contact?.phone);
  const dm = toDialableAU(contact?.dm_phone);

  if (!dm || (main && last9(dm) === last9(main))) {
    return { number: main, isDmDirect: false, reason: "Calling the main number." };
  }

  if (contact?.dm_phone_verified) {
    return { number: dm, isDmDirect: true, reason: "Confirmed direct line for the decision maker." };
  }

  if (isSwitchboardNumber(contact?.phone_type)) {
    return {
      number: dm,
      isDmDirect: true,
      reason: "Main line is a switchboard, so we're trying the decision-maker mobile to get past reception. Confirm or reject it on the call.",
    };
  }

  return {
    number: main,
    isDmDirect: false,
    reason: "Calling the main mobile — on a mobile-first business that's usually the owner. The scraped decision-maker number is unconfirmed, so we don't dial it.",
  };
}
