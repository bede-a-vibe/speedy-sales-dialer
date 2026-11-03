import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Regression: PageTransition wraps the whole app shell. A held transform
 * animation on it made it the containing block for every position: fixed child,
 * so the sidebar scrolled away and the Dialpad panel landed below the screen.
 * jsdom has no layout, so this guards the CSS itself.
 */
describe(".page-enter", () => {
  const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");

  it("never animates transform", () => {
    const keyframes = css.match(/@keyframes page-enter\s*{[\s\S]*?\n}/)?.[0];
    expect(keyframes).toBeTruthy();
    expect(keyframes).not.toMatch(/transform|translate|filter|perspective/);
  });

  it("does not hold its end state after the fade", () => {
    const rule = css.match(/\.page-enter\s*{[^}]*}/)?.[0];
    expect(rule).toBeTruthy();
    expect(rule).not.toMatch(/\b(both|forwards)\b/);
  });
});
