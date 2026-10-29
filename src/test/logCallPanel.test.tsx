import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LogCallPanel } from "@/components/dialer/LogCallPanel";
import { EMPTY_CONVERSATION_PROGRESS } from "@/components/dialer/ConversationProgressPanel";

vi.mock("@/hooks/useCallOpeners", () => ({ useCallOpeners: () => ({ data: [] }) }));

function renderPanel(overrides: Partial<React.ComponentProps<typeof LogCallPanel>> = {}) {
  const onOutcomeClick = vi.fn();
  const onConversationProgressChange = vi.fn();
  const onDqReasonChange = vi.fn();
  render(
    <LogCallPanel
      selectedOutcome={null}
      onOutcomeClick={onOutcomeClick}
      isFastLogOutcome={() => true}
      canSubmit
      conversationProgress={EMPTY_CONVERSATION_PROGRESS}
      onConversationProgressChange={onConversationProgressChange}
      onDqReasonChange={onDqReasonChange}
      onEmailFlagChange={() => {}}
      onMobileGatekeeperChange={() => {}}
      {...overrides}
    />,
  );
  return { onOutcomeClick, onConversationProgressChange, onDqReasonChange };
}

// The condensed Log This Call panel (29 Oct 2026): every outcome in one grid,
// stages as pills, flags as chips. The shortcuts and the cascading stage rule
// must survive the layout change.
describe("LogCallPanel, condensed", () => {
  it("shows all eight outcomes with their number-key shortcuts in one group", () => {
    renderPanel();
    const group = screen.getByRole("group", { name: "Call outcome" });
    const buttons = group.querySelectorAll("button");
    expect(buttons).toHaveLength(8);
    const keys = [...group.querySelectorAll("kbd")].map((k) => k.textContent);
    expect([...keys].sort()).toEqual(["1", "2", "3", "4", "5", "6", "7", "8"]);
    expect(screen.getByRole("button", { name: /No Answer/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Book/ })).toBeInTheDocument();
  });

  it("clicking a later stage pill ticks every stage before it", () => {
    const { onConversationProgressChange } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Pitched" }));
    const next = onConversationProgressChange.mock.calls[0][0];
    expect(next.reachedConnection).toBe(true);
    expect(next.reachedProblem).toBe(true);
    expect(next.reachedSolution).toBe(true);
    expect(next.reachedPitched).toBe(true);
    expect(next.reachedCommitment).toBe(false);
  });

  it("shows the DQ reasons as a required radio group only when Disqualified is picked", () => {
    renderPanel();
    expect(screen.queryByRole("radiogroup", { name: "DQ reason" })).toBeNull();
  });

  it("DQ reasons appear for a disqualified outcome and report the pick", () => {
    const { onDqReasonChange } = renderPanel({ selectedOutcome: "disqualified" });
    const group = screen.getByRole("radiogroup", { name: "DQ reason" });
    const radios = group.querySelectorAll("[role=radio]");
    expect(radios.length).toBeGreaterThanOrEqual(3);
    fireEvent.click(radios[0]);
    expect(onDqReasonChange).toHaveBeenCalledTimes(1);
  });

  it("keeps the two flags as chips and the fast-log hint on the selected outcome", () => {
    renderPanel({ selectedOutcome: "no_answer" });
    expect(screen.getByRole("button", { name: /Worth an email tonight/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Mobile reaches a gatekeeper/ })).toBeInTheDocument();
    expect(screen.getByText("again = save")).toBeInTheDocument();
  });
});
