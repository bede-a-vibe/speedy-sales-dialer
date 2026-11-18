import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LevelUpBar, levelOf } from "@/components/dashboard/LevelUpBar";

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
});
