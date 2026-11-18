import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LevelUpBar, levelOf, loadedLine } from "@/components/dashboard/LevelUpBar";

describe("Level-up bar", () => {
  beforeEach(() => window.localStorage.clear());

  it("maps paid first-month cash to levels on the commission brackets", () => {
    expect(levelOf(0)).toBe(0);
    expect(levelOf(17_999)).toBe(0);
    expect(levelOf(18_000)).toBe(1);
    expect(levelOf(30_000)).toBe(2);
    expect(levelOf(38_000)).toBe(3);
    expect(levelOf(60_000)).toBe(4);
  });

  it("celebrates a new level once per month, then stays quiet", () => {
    const { unmount } = render(<LevelUpBar retainerPaid={6_000} celebrateKey="k" />);
    expect(screen.getByText("Warm-up")).toBeInTheDocument();
    expect(screen.getByText("$12,000 to Level 1 (15%)")).toBeInTheDocument();
    expect(screen.queryByText("Level up!")).toBeNull();
    unmount();
    const second = render(<LevelUpBar retainerPaid={19_000} celebrateKey="k" />);
    expect(screen.getByText("Level up!")).toBeInTheDocument();
    second.unmount();
    render(<LevelUpBar retainerPaid={19_500} celebrateKey="k" />);
    expect(screen.queryByText("Level up!")).toBeNull();
  });

  it("shows the max level at the top bracket", () => {
    render(<LevelUpBar retainerPaid={50_000} />);
    expect(screen.getByText("Max level: 25% on every retainer dollar")).toBeInTheDocument();
  });

  it("shows loaded (owed or verbal) retainer in grey and what it does for the level", () => {
    expect(loadedLine(6_000, 0)).toBeNull();
    expect(loadedLine(6_000, 14_000)).toBe("$14,000 loaded: once paid you hit Level 1 (15%)");
    expect(loadedLine(6_000, 4_000)).toBe("$4,000 loaded: $8,000 more to Level 1");
    render(<LevelUpBar retainerPaid={6_000} loaded={14_000} />);
    expect(screen.getByText("$14,000 loaded: once paid you hit Level 1 (15%)")).toBeInTheDocument();
    // Grey runs from 0 to paid + loaded ($20k of a $58k track).
    expect(screen.getByTestId("level-loaded").style.width).toBe(`${(20_000 / 58_000) * 100}%`);
    // The progress value is still paid cash only.
    expect(screen.getByRole("progressbar", { name: "Level-up progress" })).toHaveAttribute("aria-valuenow", "6000");
  });
});
