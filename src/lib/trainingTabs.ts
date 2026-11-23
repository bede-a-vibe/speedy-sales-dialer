export const TRAINING_TABS = ["reviews", "classroom", "library", "practice"] as const;
export type TrainingTab = (typeof TRAINING_TABS)[number];

/**
 * Which Training tab a link means. Links made before Classroom and Training
 * merged carry no tab, so the rest of the query decides: a course or lesson is
 * the Classroom, a Loom is reviews, a practice module is Practice. Two old
 * modules moved: real calls to the call library, the objection bank to its lesson.
 */
export function trainingTabFor(params: URLSearchParams): TrainingTab {
  const tab = params.get("tab");
  if ((TRAINING_TABS as readonly string[]).includes(tab ?? "")) return tab as TrainingTab;
  if (params.get("course") || params.get("lesson")) return "classroom";
  if (params.get("loom")) return "reviews";
  const mod = params.get("module");
  if (mod === "real-calls") return "library";
  if (mod === "objections") return "classroom";
  if (mod || params.get("drill")) return "practice";
  return "reviews";
}

/** Where an old /classroom or /playbook link lands now. */
export function legacyClassroomSearch(search: string): string {
  const params = new URLSearchParams(search);
  if (!params.get("tab")) params.set("tab", params.get("drill") ? "practice" : "classroom");
  return `?${params.toString()}`;
}
