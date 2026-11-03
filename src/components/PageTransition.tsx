import { useLocation } from "react-router-dom";
import type { ReactNode } from "react";

/**
 * Gentle opacity fade on route change, in plain CSS (`.page-enter` in
 * index.css). This replaced framer-motion, which cost ~128 KB on every
 * signed-in page for this one effect, and its exit-then-enter "wait" mode made
 * every navigation sit on a faded page first. Reduced motion turns it off.
 *
 * Never animate transform here: this div wraps the whole app shell, so it would
 * capture every position: fixed child. See the note in index.css.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const location = useLocation();
  return (
    <div key={location.pathname} className="page-enter">
      {children}
    </div>
  );
}
