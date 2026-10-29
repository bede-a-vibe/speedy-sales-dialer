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
// no "No email" filler, links and actions sharing one wrapping row, phone +
// type + attempts + number quality on one line.
describe("ContactCard header", () => {
  it("shows the industry once and the location as a chip, with no email filler", () => {
    render(<ContactCard contact={base} onMarkPhoneQuality={vi.fn()} />);
    expect(screen.getAllByText("Electricians")).toHaveLength(1);
    expect(screen.getByText("ACT")).toBeInTheDocument();
    expect(screen.queryByText("No email")).toBeNull();
    expect(screen.getByText("1 attempt")).toBeInTheDocument();
    expect(screen.getByText("5.0 (16)")).toBeInTheDocument();
  });

  it("puts the email in the links row only when there is one, in the same row as the header actions", () => {
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

  it("renders one decision-maker block with the direct line, the verification state and the two actions", () => {
    const onConfirmDM = vi.fn();
    const onRejectDM = vi.fn();
    render(
      <ContactCard
        contact={{ ...base, phone_type: "landline", dm_name: "Nathan Pike", dm_role: "Owner", dm_phone: "0408 250 687", dm_phone_type: "mobile", dm_phone_verified: false, dm_email: "nathan@apex.example" }}
        onConfirmDM={onConfirmDM}
        onRejectDM={onRejectDM}
      />,
    );
    const block = screen.getByTestId("decision-maker-block");
    expect(block.textContent).toContain("Nathan Pike");
    expect(block.textContent).toContain("Owner");
    expect(block.textContent).toContain("Unverified");
    expect(screen.getByRole("link", { name: /0408 250 687/ })).toHaveAttribute("href", "tel:0408 250 687");
    expect(screen.getByRole("link", { name: /nathan@apex.example/ })).toHaveAttribute("href", "mailto:nathan@apex.example");
    expect(block.textContent).toContain("switchboard, so the dialer tries this mobile first");
    screen.getByRole("button", { name: /Right person, confirm/ }).click();
    screen.getByRole("button", { name: /Wrong person, remove number/ }).click();
    expect(onConfirmDM).toHaveBeenCalledTimes(1);
    expect(onRejectDM).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Business Line Workflow")).toBeNull();
    expect(screen.queryByText(/Number type/)).toBeNull();
  });

  it("shows the switchboard checklist and a capture hint for a landline with no decision maker", () => {
    render(<ContactCard contact={{ ...base, phone_type: "landline" }} />);
    const block = screen.getByTestId("decision-maker-block");
    expect(block.textContent).toContain("No decision maker on file");
    expect(block.textContent).toContain("still needed");
    expect(block.textContent).toContain("not captured");
    expect(screen.queryByRole("button", { name: /Add decision maker/ })).toBeNull();
  });

  it("does not show a decision-maker email when there is no name or number behind it", () => {
    render(<ContactCard contact={{ ...base, phone_type: "landline", dm_email: "someone@apex.example" }} />);
    const block = screen.getByTestId("decision-maker-block");
    expect(screen.queryByRole("link", { name: /someone@apex.example/ })).toBeNull();
    expect(block.textContent).toContain("No decision maker on file");
    expect(block.textContent).toContain("who runs the show");
  });

  it("keeps the next-step line for a switchboard lead with a name but no direct line", () => {
    render(<ContactCard contact={{ ...base, phone_type: "landline", dm_name: "Nathan Pike" }} />);
    const block = screen.getByTestId("decision-maker-block");
    expect(block.textContent).toContain("Nathan Pike");
    expect(block.textContent).toContain("No direct line yet");
    expect(block.textContent).toContain("Nathan Pike's mobile or extension");
  });

  it("shows nothing about a decision maker for a mobile lead with none on file", () => {
    render(<ContactCard contact={base} />);
    expect(screen.queryByTestId("decision-maker-block")).toBeNull();
  });
});
