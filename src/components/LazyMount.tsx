import { lazy, Suspense, useState, type ComponentType } from "react";

/**
 * Mount a dialog the first time it opens and keep it mounted after that, so its
 * close animation still plays. Until then neither its code nor its queries load.
 */
function useEverOpened(open: boolean) {
  const [ever, setEver] = useState(open);
  if (open && !ever) setEver(true);
  return ever;
}

function lazyDialog<P extends { open: boolean }>(load: () => Promise<{ default: ComponentType<P> }>) {
  const Inner = lazy(load) as unknown as ComponentType<P>;
  return function LazyDialog(props: P) {
    const ever = useEverOpened(props.open);
    if (!ever) return null;
    return (
      <Suspense fallback={null}>
        <Inner {...props} />
      </Suspense>
    );
  };
}

export const LazyQuickBookDialog = lazyDialog(() =>
  import("@/components/QuickBookDialog").then((m) => ({ default: m.QuickBookDialog })),
);

export const LazyCommandPalette = lazyDialog(() =>
  import("@/components/CommandPalette").then((m) => ({ default: m.CommandPalette })),
);
