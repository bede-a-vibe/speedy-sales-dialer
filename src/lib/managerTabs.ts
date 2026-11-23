/**
 * Manager: four tabs, each holding the views that belong together (Bede, 24 Nov
 * 2026: simplify, no double-ups). ?tab= still carries the view, so links made
 * when every view was its own tab open the same screen.
 */
export const MANAGER_TABS = [
  {
    value: "reviews",
    label: "Call reviews",
    views: [
      { value: "review", label: "Review calls" },
      { value: "loom", label: "Looms" },
      { value: "study", label: "Call study" },
    ],
  },
  { value: "targets", label: "KPIs & targets", views: [{ value: "kpis", label: "KPIs & targets" }] },
  {
    value: "coaching",
    label: "Coaching",
    views: [
      { value: "flags", label: "Flags" },
      { value: "oneonones", label: "1:1s" },
      { value: "roleplay", label: "Roleplay" },
    ],
  },
  { value: "access", label: "Setter access", views: [{ value: "playbook", label: "Setter access" }] },
] as const;

export type ManagerTab = (typeof MANAGER_TABS)[number];
export type ManagerView = ManagerTab["views"][number]["value"];

/** Views that were a second copy of another page, and the page that has them. */
const MOVED: Record<string, string> = {
  eod: "/goals?tab=eod",
  earnings: "/goals?tab=what-if",
  revenue: "/pipelines?tab=closing",
  numbers: "/admin/lead-data?tab=numbers",
};

/** Where an old Manager link lives now, or null if it is still on Manager. */
export function movedManagerTab(tab: string | null): string | null {
  return tab && Object.prototype.hasOwnProperty.call(MOVED, tab) ? MOVED[tab] : null;
}

/** The tab and view a ?tab= value means. A tab's own name opens its first view. */
export function managerViewFor(value: string | null): { tab: ManagerTab; view: ManagerView } {
  for (const tab of MANAGER_TABS) {
    const view = tab.views.find((v) => v.value === value);
    if (view) return { tab, view: view.value };
  }
  const tab = MANAGER_TABS.find((t) => t.value === value) ?? MANAGER_TABS[0];
  return { tab, view: tab.views[0].value };
}
