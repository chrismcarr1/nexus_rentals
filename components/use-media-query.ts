"use client";

import { useSyncExternalStore } from "react";

/**
 * Tracks a CSS media query. Returns false during server rendering and the
 * first client paint, then updates once the real viewport is known.
 */
export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (onStoreChange) => {
      const mediaQueryList = window.matchMedia(query);
      mediaQueryList.addEventListener("change", onStoreChange);
      return () => mediaQueryList.removeEventListener("change", onStoreChange);
    },
    () => window.matchMedia(query).matches,
    () => false
  );
}
