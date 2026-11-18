import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DashboardFold } from "@/components/dashboard/DashboardFold";

describe("Dashboard folds", () => {
  beforeEach(() => window.localStorage.clear());

  it("starts closed, opens on click, and remembers it", () => {
    const { unmount } = render(<DashboardFold id="x" title="My goals" summary="targets"><p>Goal content</p></DashboardFold>);
    expect(screen.queryByText("Goal content")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /My goals/ }));
    expect(screen.getByText("Goal content")).toBeInTheDocument();
    unmount();
    render(<DashboardFold id="x" title="My goals" summary="targets"><p>Goal content</p></DashboardFold>);
    expect(screen.getByText("Goal content")).toBeInTheDocument();
  });
});
