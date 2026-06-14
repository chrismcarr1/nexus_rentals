import Link from "next/link";
import { MessageSquare } from "lucide-react";

import { DetailSection } from "@/components/detail-section";
import { EmptyState } from "@/components/empty-state";
import { formatDate } from "@/lib/utils";
import type { DashboardMessagePreview } from "@/services/dashboard";

export function TenantMessagesCard({ messages, unreadCount }: { messages: DashboardMessagePreview[]; unreadCount: number }) {
  return (
    <DetailSection
      title="Tenant messages"
      description={unreadCount ? `${unreadCount} unread conversation${unreadCount === 1 ? "" : "s"}.` : "Latest resident conversations."}
      actions={
        <Link href="/messages" className="text-sm font-semibold text-[var(--brand)] hover:text-[var(--brand-strong)]">
          Open messages
        </Link>
      }
    >
      {messages.length ? (
        <div>
          {messages.map((message) => (
            <Link
              key={message.conversationKey}
              href={`/messages?conversation=${encodeURIComponent(message.conversationKey)}`}
              className="group flex items-start gap-3 border-b border-[var(--line)] px-1 py-2.5 last:border-b-0 hover:bg-[var(--surface-hover)]"
            >
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${message.hasUnread ? "bg-[var(--brand)]" : "bg-[var(--line-strong)]"}`} />
              <span className="min-w-0 flex-1">
                <span className={`block truncate text-sm ${message.hasUnread ? "font-semibold text-[var(--text)]" : "font-medium text-[var(--muted-strong)]"}`}>
                  {message.tenantName}
                  <span className="ml-2 text-xs font-normal text-[var(--muted)]">
                    {message.propertyName}
                    {message.unitNumber ? ` / Unit ${message.unitNumber}` : ""}
                  </span>
                </span>
                {message.snippet ? (
                  <span className="mt-0.5 line-clamp-1 block text-xs text-[var(--muted)]">{message.snippet}</span>
                ) : null}
              </span>
              {message.lastMessageAt ? (
                <span className="shrink-0 text-xs tabular-nums text-[var(--muted)]">{formatDate(message.lastMessageAt)}</span>
              ) : null}
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState icon={MessageSquare} title="No unread tenant messages" description="New resident conversations will appear here." />
      )}
    </DetailSection>
  );
}
