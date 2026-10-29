import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Notes } from "@/components/playbook/Classroom";

// The Classroom lesson body is plain text with a handful of markdown habits.
// Lessons written for Lachlan (29 Oct 2026) use [label](url) links and
// *italics*, which the renderer used to print literally.
describe("Classroom Notes renderer", () => {
  it("turns [label](url) into a link with the label as text", () => {
    render(<Notes text={"**Open the full script here:** [SETTER SCRIPT v2 on Miro](https://miro.com/app/board/abc=/?moveToWidget=1)"} />);
    const link = screen.getByRole("link", { name: "SETTER SCRIPT v2 on Miro" });
    expect(link).toHaveAttribute("href", "https://miro.com/app/board/abc=/?moveToWidget=1");
    expect(link).toHaveAttribute("target", "_blank");
    expect(screen.queryByText(/\[SETTER SCRIPT/)).toBeNull();
  });

  it("still links a bare URL on its own line", () => {
    render(<Notes text={"https://miro.com/app/board/abc=/?moveToWidget=1"} />);
    expect(screen.getByRole("link", { name: "https://miro.com/app/board/abc=/?moveToWidget=1" })).toBeInTheDocument();
  });

  it("renders *italic* without touching **bold**", () => {
    const { container } = render(<Notes text={"It means a real question about *their* business. **Bold** stays bold."} />);
    expect(container.querySelector("em")?.textContent).toBe("their");
    expect(container.querySelector("strong")?.textContent).toBe("Bold");
    expect(container.textContent).not.toContain("*");
  });

  it("leaves a lone asterisk and a score like 3*2 alone", () => {
    const { container } = render(<Notes text={"Score it 3*2 and move on * no drama"} />);
    expect(container.querySelector("em")).toBeNull();
    expect(container.textContent).toContain("3*2");
  });
});
