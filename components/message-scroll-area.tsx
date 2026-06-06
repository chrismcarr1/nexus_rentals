"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

export function MessageScrollArea({
  conversationKey,
  messageCount,
  children
}: {
  conversationKey: string;
  messageCount: number;
  children: ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
    window.dispatchEvent(
      new CustomEvent("nexus:notification-read", {
        detail: { href: `/api/discussions/read?conversation=${encodeURIComponent(conversationKey)}` }
      })
    );
  }, [conversationKey, messageCount]);

  return (
    <div ref={scrollRef} className="messages-scroll-area flex-1 space-y-3 overflow-y-auto px-5 py-5">
      {children}
    </div>
  );
}
