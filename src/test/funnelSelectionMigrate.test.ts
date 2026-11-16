import { describe, expect, it } from "vitest";
import { withFirstMeetingShowed } from "@/hooks/useFunnelMetricSelection";

describe("saved funnel selections", () => {
  it("puts first-meeting showed right before Show-Up Rate", () => {
    expect(withFirstMeetingShowed(["dials", "showed", "show_up_rate"])).toEqual(["dials", "showed", "first_meeting_showed", "show_up_rate"]);
  });
  it("leaves selections without Show-Up Rate or already migrated alone", () => {
    expect(withFirstMeetingShowed(["dials"])).toEqual(["dials"]);
    expect(withFirstMeetingShowed(["first_meeting_showed", "show_up_rate"])).toEqual(["first_meeting_showed", "show_up_rate"]);
  });
});
