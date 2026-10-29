import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ContactCard } from "@/components/ContactCard";

const base = {
  business_name: "Apex Electrical and Data",
  contact_person: null,
  phone: "+61 406 020 003",
  phone_type: "mobile",
  email: null,
  website: "https://apex.example",
  gmb_link: "https://maps.example/apex",
  industry: "Electricians",
  city: null,
  state: "ACT",
  call_attempt_count: 1,
  phone_number_quality: "suspect",
  prospect_tier: "Tier 3 - Nurture",
  lead_type: "cold",
  gbp_rating: 5,
  review_count: 16,
  lifecycle_stage: "attempting",
};

// The tidied contact card header (29 Oct 2026): industry and location once,
// no "No email" filler, links and actions on one row, phone + type + attempts
// + number quality on one line.
describe("ContactCard header", () => {
  it("shows the industry once and the location as a chip, with no email filler", () => {
    render(<ContactCard contact={base} onMarkPhoneQuality={vi.fn()} />);
    expect(screen.getAllByText("Electricians")).toHaveLength(1);
    expect(screen.getByText("ACT")).toBeInTheDocument();
    expect(screen.queryByText("No email")).toBeNull();
    expect(screen.getByText("1 attempt")).toBeInTheDocument();
    expect(screen.getByText("5.0 (16)")).toBeInTheDocument();
  });

  it("puts the email in the links row only when there is one, next to the header actions", () => {
    render(
      <ContactCard
        contact={{ ...base, email: "office@apex.example" }}
        headerActions={<button type="button">I booked this in GHL</button>}
      />,
    );
    const email = screen.getByRole("link", { name: /office@apex.example/ });
    expect(email).toHaveAttribute("href", "mailto:office@apex.example");
    expect(screen.getByRole("link", { name: /GMB/ })).toHaveAttribute("href", base.gmb_link);
    expect(screen.getByRole("button", { name: "I booked this in GHL" })).toBeInTheDocument();
  });

  it("labels the active number-quality state and keeps the other two as icon buttons", () => {
    const onMark = vi.fn();
    render(<ContactCard contact={base} onMarkPhoneQuality={onMark} />);
    const group = screen.getByRole("group", { name: "Number quality" });
    const buttons = group.querySelectorAll("button");
    expect(buttons).toHaveLength(3);
    expect(group.textContent).toContain("Suspect");
    expect(group.textContent).not.toContain("Dead");
    buttons[2].click();
    expect(onMark).toHaveBeenCalledWith("dead");
  });

  it("shows the phone type inside the phone link", () => {
    render(<ContactCard contact={base} />);
    const tel = screen.getByRole("link", { name: /\+61 406 020 003/ });
    expect(tel).toHaveAttribute("href", "tel:+61 406 020 003");
    expect(tel.textContent).toContain("Mobile");
  });
});
