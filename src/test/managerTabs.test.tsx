import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import ManagerPage from "@/pages/ManagerPage";

const s = vi.hoisted(() => ({ admin: true }));
vi.mock("@/components/AppLayout", () => ({ AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/manager/CallReviewQueue", () => ({ CallReviewQueue: () => <p>review queue</p> }));
vi.mock("@/components/manager/LoomReviews", async () => {
  const { useSearchParams } = await import("react-router-dom");
  return { LoomReviews: () => <p>looms {useSearchParams()[0].get("call") ?? "none"}</p> };
});
vi.mock("@/components/manager/StudyReviews", () => ({ StudyReviews: () => <p>call study</p> }));
vi.mock("@/components/manager/PlaybookLocks", () => ({ PlaybookLocks: () => <p>setter access</p> }));
vi.mock("@/components/manager/OneOnOnePanel", () => ({ OneOnOnePanel: () => <p>one on ones</p> }));
vi.mock("@/components/manager/RoleplayResults", () => ({ RoleplayResults: () => <p>roleplays</p> }));
vi.mock("@/components/targets/TeamKpis", () => ({ TeamKpis: () => <p>team kpis</p> }));
vi.mock("@/components/training/ManagerMetrics", () => ({ ManagerMetrics: () => <p>coaching flags</p> }));
vi.mock("@/components/training/ManagerPlaybook", () => ({ ManagerPlaybook: () => null }));
vi.mock("@/components/LazyMount", () => ({ LazyQuickBookDialog: () => null }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "me", email: "a@b.c" } }) }));
vi.mock("@/hooks/useUserRole", () => ({ useCanViewAdmin: () => s.admin, useIsCoach: () => false }));
vi.mock("@/hooks/useLoomReviews", () => ({ useUnseenLoomCount: () => ({ data: 0 }) }));
vi.mock("@/hooks/useManager", () => ({ useUnseenReviewCount: () => ({ data: 0 }) }));
vi.mock("@/hooks/useTodoList", () => ({ useTodoCount: () => ({ data: 0 }) }));

function Where() {
  const l = useLocation();
  return <p data-testid="at">{l.pathname + l.search}</p>;
}
const open = (url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Where />
      <Routes>
        <Route path="/admin/manager" element={<ManagerPage />} />
        <Route path="*" element={null} />
      </Routes>
    </MemoryRouter>,
  );
const pick = (name: string) => fireEvent.mouseDown(screen.getByRole("tab", { name }), { button: 0 });
const at = () => screen.getByTestId("at").textContent;

describe("Manager tabs", () => {
  it("has four tabs, opening on the call review queue", () => {
    open("/admin/manager");
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "Call reviews", "KPIs & targets", "Coaching", "Setter access", "Review calls", "Looms", "Call study",
    ]);
    expect(screen.getByText("review queue")).toBeVisible();
  });

  it.each([
    ["review", "review queue"], ["loom", "looms none"], ["study", "call study"], ["kpis", "team kpis"],
    ["flags", "coaching flags"], ["oneonones", "one on ones"], ["roleplay", "roleplays"], ["playbook", "setter access"],
    ["coaching", "coaching flags"], ["nonsense", "review queue"], ["constructor", "review queue"],
  ])("?tab=%s opens its screen", (tab, text) => {
    open(`/admin/manager?tab=${tab}`);
    expect(screen.getByText(text)).toBeVisible();
  });

  it.each([
    ["eod", "/goals?tab=eod"], ["earnings", "/goals?tab=what-if"],
    ["revenue", "/pipelines?tab=closing"], ["numbers", "/admin/lead-data?tab=numbers"],
  ])("?tab=%s goes to the page that has it", (tab, to) => {
    open(`/admin/manager?tab=${tab}`);
    expect(at()).toBe(to);
  });

  it("keeps the call on 'Send a Loom on this call'", () => {
    open("/admin/manager?tab=loom&call=c1");
    expect(screen.getByText("looms c1")).toBeVisible();
  });

  it("moves between tabs and views and remembers the place in the URL", () => {
    open("/admin/manager");
    pick("Coaching");
    expect(screen.getByText("coaching flags")).toBeVisible();
    pick("1:1s");
    expect(screen.getByText("one on ones")).toBeVisible();
    expect(at()).toBe("/admin/manager?tab=oneonones");
  });
});

describe("Sidebar", () => {
  beforeEach(() => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  });
  const links = (admin: boolean) => {
    s.admin = admin;
    render(<MemoryRouter><SidebarProvider><AppSidebar /></SidebarProvider></MemoryRouter>);
    return screen.getAllByRole("link").map((l) => l.textContent);
  };
  const daily = ["Dashboard", "Dialer", "Contacts", "Pipelines", "Goals & KPIs", "Training"];

  it("gives a manager one link per page", () => {
    expect(links(true)).toEqual([...daily, "Manager", "Insights", "Clients", "Team & settings", "Lead data"]);
  });
  it("leaves a rep's sidebar as it was", () => {
    expect(links(false)).toEqual([...daily, "Connectors"]);
  });
});
