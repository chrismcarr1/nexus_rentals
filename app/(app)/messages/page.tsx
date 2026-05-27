import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { sendDiscussionMessageAction } from "@/lib/actions";
import { requireRoles } from "@/lib/auth";
import { getDiscussionPageData } from "@/lib/discussions";
import { UserRole } from "@/lib/store";

function formatMessageTime(value?: string) {
  if (!value) return "No messages yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No messages yet";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default async function MessagesPage({ searchParams }: { searchParams?: Promise<Record<string, string>> }) {
  const user = await requireRoles([UserRole.MANAGER, UserRole.TENANT]);
  const params = (await searchParams) ?? {};
  const data = await getDiscussionPageData(user, params.conversation);
  const selected = data.selectedConversation;

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Discussions"
        title={user.role === "TENANT" ? "Message your property manager." : "Resident conversations and lease follow-up."}
        description={
          user.role === "TENANT"
            ? "Keep lease, payment, and maintenance questions in one shared thread with management."
            : "Discuss renewals, maintenance, balances, and resident questions without relying on email delivery."
        }
      />

      {params.error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {params.error}
        </div>
      ) : null}

      {!data.conversations.length ? (
        <EmptyState
          title="No discussions available"
          description={
            user.role === "TENANT"
              ? "Accept a manager invite or connect an active lease before starting a discussion."
              : "Create or connect a lease with a tenant before starting a discussion."
          }
        />
      ) : (
        <section className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
          <Card className="p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Threads</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">Discussions</h2>
              </div>
              <Badge tone="default">{data.conversations.length}</Badge>
            </div>
            <div className="mt-5 space-y-2">
              {data.conversations.map((conversation) => {
                const active = selected?.key === conversation.key;

                return (
                  <Link
                    key={conversation.key}
                    href={`/messages?conversation=${encodeURIComponent(conversation.key)}`}
                    className={`block rounded-2xl border px-4 py-3 transition ${
                      active
                        ? "border-[var(--line-strong)] bg-[var(--panel-strong)] shadow-[0_16px_34px_rgba(15,23,42,0.08)]"
                        : "border-[var(--line)] bg-white/70 hover:bg-white"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{conversation.subject}</p>
                        <p className="mt-1 text-xs text-[var(--muted)]">{conversation.description}</p>
                      </div>
                      <Badge tone={conversation.messageCount ? "success" : "warning"}>
                        {conversation.messageCount ? conversation.messageCount : "New"}
                      </Badge>
                    </div>
                    <p className="mt-3 line-clamp-2 text-xs leading-5 text-[var(--muted)]">
                      {conversation.lastMessageBody ?? "Start the discussion."}
                    </p>
                    <p className="mt-3 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--muted)]">
                      {formatMessageTime(conversation.lastMessageAt)}
                    </p>
                  </Link>
                );
              })}
            </div>
          </Card>

          <Card className="flex min-h-[640px] flex-col p-5">
            {selected ? (
              <>
                <div className="border-b border-[var(--line)] pb-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--brand)]">
                    {user.role === "TENANT" ? selected.managerName : selected.tenantName}
                  </p>
                  <h2 className="mt-2 text-3xl font-semibold tracking-[-0.03em]">{selected.subject}</h2>
                  <p className="mt-2 text-sm text-[var(--muted)]">{selected.description}</p>
                </div>

                <div className="flex-1 space-y-4 overflow-y-auto py-5">
                  {data.messages.length ? (
                    data.messages.map((message) => (
                      <div key={message.id} className={`flex ${message.isCurrentUser ? "justify-end" : "justify-start"}`}>
                        <div
                          className={`max-w-[min(720px,88%)] rounded-[22px] border px-4 py-3 ${
                            message.isCurrentUser
                              ? "border-[var(--brand)]/20 bg-[var(--accent-soft)]"
                              : "border-[var(--line)] bg-white"
                          }`}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold">{message.senderName}</p>
                            <Badge tone={message.senderRole === "TENANT" ? "success" : "default"}>{message.senderRole}</Badge>
                          </div>
                          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--text)]">{message.body}</p>
                          <p className="mt-3 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--muted)]">
                            {formatMessageTime(message.createdAt)}
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <EmptyState title="No messages yet" description="Send the first message to open this discussion." />
                  )}
                </div>

                <form action={sendDiscussionMessageAction} className="border-t border-[var(--line)] pt-4">
                  <input type="hidden" name="leaseId" value={selected.leaseId} />
                  <input type="hidden" name="tenantId" value={selected.tenantId} />
                  <input type="hidden" name="conversationKey" value={selected.key} />
                  <textarea
                    name="body"
                    required
                    minLength={1}
                    maxLength={2000}
                    placeholder="Write a message..."
                    className="field min-h-32 resize-y"
                  />
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <p className="text-xs text-[var(--muted)]">Messages stay in this lease discussion.</p>
                    <SubmitButton pendingLabel="Sending...">Send message</SubmitButton>
                  </div>
                </form>
              </>
            ) : (
              <EmptyState title="Select a discussion" description="Choose a tenant or lease thread to review messages." />
            )}
          </Card>
        </section>
      )}
    </div>
  );
}
