/**
 * The ONE place that decides which number a lead gets dialled on.
 *
 * Both the dial engine and the contact card read this, so the number a rep
 * sees can never disagree with the number that actually rings.
 *
 * Policy (set 17 Sep 2026 after scraped decision-maker numbers proved
 * consistently wrong on mobile-first businesses):
 *  - The main number wins by default. For a tradie, a mobile main number IS
 *    the owner, so a scraped "decision maker" number adds risk, not reach.
 *  - A scraped DM number is only worth dialling when the main line is a
 *    switchboard (landline / 1300 / 1800), where a direct mobile is the only
 *    way past reception.
 *  - A human-confirmed DM number is always trusted, whatever the main line is.
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
  /** Plain-English reason, shown to the rep on the card. */
  reason: string;
}

const last9 = (value?: string | null) => (value ?? "").replace(/\D/g, "").slice(-9);

/** Landline and 1300/1800 numbers route through reception; mobiles don't. */
export function isSwitchboardNumber(phoneType?: string | null): boolean {
  return phoneType === "landline" || phoneType === "business_line";
}

export function resolveDialTarget(contact: DialTargetContact | null | undefined): DialTarget {
  const main = contact?.phone?.trim() || null;
  const dm = contact?.dm_phone?.trim() || null;

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
      reason: "Main line is a switchboard, so we're trying the decision-maker mobile to get past reception.",
    };
  }

  return {
    number: main,
    isDmDirect: false,
    reason: "Calling the main mobile — on a mobile-first business that's usually the owner. The scraped decision-maker number is unconfirmed, so we don't dial it.",
  };
}
