/**
 * The stages a call reached, made to add up: a later stage implies every
 * earlier one, and a booked call reached them all. So the stage counts only
 * ever step down: answers >= intro >= problem >= solution >= ask >= booked.
 */
export function callStagesOf(l: {
  outcome: string | null;
  reached_connection?: boolean | null;
  reached_problem_awareness?: boolean | null;
  reached_solution_awareness?: boolean | null;
  reached_commitment?: boolean | null;
}) {
  const booked = l.outcome === "booked";
  const ask = booked || !!l.reached_commitment;
  const solution = ask || !!l.reached_solution_awareness;
  const problem = solution || !!l.reached_problem_awareness;
  const intro = problem || !!l.reached_connection;
  return { intro, problem, solution, ask, booked };
}
