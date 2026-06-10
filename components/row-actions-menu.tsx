"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";

import { cn } from "@/lib/utils";

const MENU_WIDTH = 216;
const MENU_GAP = 6;
const VIEWPORT_PADDING = 8;

export function RowActionsMenu({
  label = "Row actions",
  children,
  className
}: {
  label?: string;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties>({
    left: 0,
    top: 0,
    width: MENU_WIDTH
  });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const menuWidth = Math.min(MENU_WIDTH, Math.max(160, window.innerWidth - VIEWPORT_PADDING * 2));
    const menuHeight = menuRef.current?.offsetHeight ?? 240;
    const maxLeft = window.innerWidth - menuWidth - VIEWPORT_PADDING;
    const left = Math.max(VIEWPORT_PADDING, Math.min(rect.right - menuWidth, maxLeft));
    const belowTop = rect.bottom + MENU_GAP;
    const aboveTop = rect.top - menuHeight - MENU_GAP;
    const top =
      belowTop + menuHeight > window.innerHeight - VIEWPORT_PADDING
        ? Math.max(VIEWPORT_PADDING, aboveTop)
        : belowTop;

    setPosition({
      left,
      top,
      width: menuWidth
    });
  }, []);

  useLayoutEffect(() => {
    if (open) {
      updatePosition();
    }
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;

      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }

      setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;

      setOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);

  return (
    <span className={cn("row-actions relative inline-block text-left", className)}>
      <button
        ref={triggerRef}
        type="button"
        className={cn("row-actions-trigger", open && "row-actions-trigger-open")}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((current) => !current)}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              id={menuId}
              role="menu"
              className="row-actions-menu row-actions-menu-floating"
              style={position}
            >
              {children}
            </div>,
            document.body
          )
        : null}
    </span>
  );
}

export function RowActionLink({
  href,
  children,
  destructive = false
}: {
  href: string;
  children: ReactNode;
  destructive?: boolean;
}) {
  return (
    <a
      href={href}
      role="menuitem"
      className={cn(
        "row-action-item",
        destructive && "row-action-item-destructive"
      )}
    >
      {children}
    </a>
  );
}
