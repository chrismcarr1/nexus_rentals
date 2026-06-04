"use client";

import { useEffect } from "react";

export function DropdownDismissListener() {
  useEffect(() => {
    function closeDetailsOutside(target: EventTarget | null) {
      if (!(target instanceof Node)) return;

      document.querySelectorAll<HTMLDetailsElement>("details[open]").forEach((details) => {
        if (!details.contains(target)) {
          details.open = false;
        }
      });
    }

    function closeDetailsAction(target: EventTarget | null) {
      if (!(target instanceof Element)) return;

      const details = target.closest("details[open]");
      if (!details || target.closest("summary")) return;

      if (target.closest("a, button, [role='menuitem']")) {
        (details as HTMLDetailsElement).open = false;
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;

      document.querySelectorAll<HTMLDetailsElement>("details[open]").forEach((details) => {
        details.open = false;
      });
    }

    function handlePointerDown(event: PointerEvent) {
      closeDetailsOutside(event.target);
    }

    function handleClick(event: MouseEvent) {
      closeDetailsAction(event.target);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("click", handleClick);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("click", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return null;
}
