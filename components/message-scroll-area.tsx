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
    // Mark the conversation read server-side via a same-origin POST (no longer a
    // CSRF-able GET). Fire-and-forget; failure only leaves the unread dot.
    void fetch("/api/discussions/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ conversation: conversationKey })
    }).catch(() => {});
    window.dispatchEvent(
      new CustomEvent("nexus:notification-read", {
        detail: { href: `/messages?conversation=${encodeURIComponent(conversationKey)}` }
      })
    );
  }, [conversationKey, messageCount]);

  return (
    <div ref={scrollRef} className="messages-scroll-area flex-1 space-y-3 overflow-y-auto px-5 py-5">
      {children}
    </div>
  );
}
