import Link from "next/link";
import { MessageSquare, Send } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { MessageScrollArea } from "@/components/message-scroll-area";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { sendDiscussionMessageAction } from "@/lib/actions";
import { requireRoles } from "@/lib/auth";
import { getDiscussionPageData } from "@/lib/discussions";
import { UserRole } from "@/lib/store";
import { cn, initials } from "@/lib/utils";

function formatMessageTime(value?: string) {
  if (!value) return "No messages yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No messages yet";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function shortTime(value?: string) {
  if (!value) return "New";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "New";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}

function getSubjectInitials(subject: string) {
  const words = subject.split(/\s+/).filter(Boolean);
  return initials(words[0], words[1]);
}

export default async function MessagesPage({ searchParams }: { searchParams?: Promise<Record<string, string>> }) {
  const user = await requireRoles([UserRole.MANAGER, UserRole.TENANT]);
  const params = (await searchParams) ?? {};
  const data = await getDiscussionPageData(user, params.conversation);
  const selected = data.selectedConversation;
  const activeName = selected ? (user.role === "TENANT" ? selected.managerName : selected.tenantName) : "Select a thread";

  return (
    <div className="messages-page">
      {params.error ? (
        <div className="page-alert page-alert-error">
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
        <section className="surface-panel messages-layout overflow-hidden">
          <aside className="messages-conversations flex min-h-0 flex-col border-r border-[var(--line)] bg-[var(--panel)]">
            <div className="border-b border-[var(--line)] p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="page-title text-[var(--text)]">Messages</h1>
                </div>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--line-strong)] bg-[var(--surface-strong)] text-[var(--brand)]">
                  <MessageSquare className="h-4 w-4" />
                </div>
              </div>
            </div>
            <div className="messages-list flex-1 overflow-y-auto p-2">
              {data.conversations.map((conversation) => {
                const active = selected?.key === conversation.key;

                return (
                  <Link
                    key={conversation.key}
                    href={`/messages?conversation=${encodeURIComponent(conversation.key)}`}
                    className={cn(
                      "group relative mb-1 flex items-start gap-3 rounded-md border px-3 py-3 pr-5 transition",
                      active
                        ? "border-[var(--brand)] bg-[var(--accent-soft)]"
                        : conversation.hasUnread
                          ? "border-[var(--line-strong)] bg-[var(--surface-strong)] hover:border-[var(--brand)]/60 hover:bg-[var(--surface-hover)]"
                          : "border-transparent hover:border-[var(--line-strong)] hover:bg-[var(--surface-hover)]"
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-md border text-xs font-bold",
                        active || conversation.hasUnread
                          ? "border-[var(--brand)] bg-[#061712] text-[var(--brand)]"
                          : "border-[var(--line)] bg-[var(--surface-strong)] text-[var(--muted)]"
                      )}
                    >
                      {getSubjectInitials(conversation.subject)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-start justify-between gap-2">
                        <span className="block truncate text-sm font-semibold text-[var(--text)]">{conversation.subject}</span>
                        <span className="shrink-0 text-[11px] font-medium text-[var(--muted)]">{shortTime(conversation.lastMessageAt)}</span>
                      </span>
                      <span
                        className={cn(
                          "mt-1 block truncate text-xs",
                          conversation.hasUnread ? "font-medium text-[var(--text)]" : "text-[var(--muted)]"
                        )}
                      >
                        {conversation.lastMessageBody ?? conversation.description}
                      </span>
                    </span>
                    {conversation.hasUnread ? (
                      <>
                        <span className="messages-unread-dot" aria-hidden="true" />
                        <span className="sr-only">Unread message</span>
                      </>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </aside>

          <div className="messages-thread-column min-w-0">
            <Card className="message-panel flex min-h-0 flex-col rounded-none border-0 bg-[var(--surface)] shadow-none">
              {selected ? (
                <>
                  <div className="border-b border-[var(--line)] px-5 py-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[var(--brand)] bg-[#061712] text-sm font-bold text-[var(--brand)]">
                          {getSubjectInitials(activeName)}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-base font-semibold text-[var(--text)]">{activeName}</p>
                          <p className="mt-0.5 truncate text-xs text-[var(--muted)]">{selected.subject}</p>
                        </div>
                      </div>
                      <Badge tone="default">{data.messages.length ? `${data.messages.length} messages` : "New thread"}</Badge>
                    </div>
                    <p className="mt-3 truncate text-xs text-[var(--muted)]">
                      {selected.description} / {user.role === "TENANT" ? "Manager conversation" : "Resident conversation"} / {selected.lastMessageAt ? `Last ${shortTime(selected.lastMessageAt)}` : "No activity yet"}
                    </p>
                  </div>

                  <MessageScrollArea conversationKey={selected.key} messageCount={data.messages.length}>
                    {data.messages.length ? (
                      data.messages.map((message) => (
                        <div key={message.id} className={`flex ${message.isCurrentUser ? "justify-end" : "justify-start"}`}>
                          <div
                            className={`max-w-[680px] rounded-md border px-4 py-3 ${
                              message.isCurrentUser
                                ? "border-[var(--brand)]/50 bg-[var(--accent-soft)]"
                                : "border-[var(--line)] bg-[var(--panel-strong)]"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold text-[var(--text)]">{message.senderName}</p>
                              <Badge tone={message.senderRole === "TENANT" ? "success" : "default"}>{message.senderRole}</Badge>
                            </div>
                            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--text)]">{message.body}</p>
                            <p className="mt-3 text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--muted)]">
                              {formatMessageTime(message.createdAt)}
                            </p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <div className="max-w-sm text-center">
                          <div className="mx-auto h-1.5 w-16 rounded-sm bg-[var(--brand)]" />
                          <h2 className="mt-5 text-xl font-semibold">No messages yet</h2>
                          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Send the first message to open this discussion.</p>
                        </div>
                      </div>
                    )}
                  </MessageScrollArea>

                  <form action={sendDiscussionMessageAction} className="border-t border-[var(--line)] bg-[var(--panel)] p-4">
                    <input type="hidden" name="leaseId" value={selected.leaseId} />
                    <input type="hidden" name="tenantId" value={selected.tenantId} />
                    <input type="hidden" name="conversationKey" value={selected.key} />
                    <div className="flex flex-col items-stretch gap-3">
                      <textarea
                        name="body"
                        required
                        minLength={1}
                        maxLength={2000}
                        placeholder="Write a message..."
                        className="field min-h-24 resize-none"
                      />
                      <SubmitButton pendingLabel="Sending..." className="mb-0 gap-2">
                        <Send className="h-4 w-4" />
                        Send
                      </SubmitButton>
                    </div>
                  </form>
                </>
              ) : (
                <div className="flex h-full items-center justify-center">
                  <div className="max-w-sm text-center">
                    <div className="mx-auto h-1.5 w-16 rounded-sm bg-[var(--brand)]" />
                    <h2 className="mt-5 text-xl font-semibold">Select a discussion</h2>
                    <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Choose a tenant or lease thread to review messages.</p>
                  </div>
                </div>
              )}
            </Card>
          </div>
        </section>
      )}
    </div>
  );
}
