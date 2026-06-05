"use client";

import { useId, useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function InviteLinkCopyPanel({
  inviteUrl,
  emailStatus,
  emailError
}: {
  inviteUrl: string;
  emailStatus?: string;
  emailError?: string;
}) {
  const [copied, setCopied] = useState(false);
  const inputId = useId();

  async function copyInviteLink() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(inviteUrl);
      } else {
        const input = document.getElementById(inputId);
        if (!(input instanceof HTMLInputElement)) throw new Error("Copy input not found.");
        input.select();
        document.execCommand("copy");
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Card className="border-[rgba(13,143,123,0.26)] p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="section-kicker">Tenant access</p>
          <h2 className="mt-2 text-xl font-semibold text-[var(--text)]">Invite link ready</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            {emailStatus === "sent"
              ? "Email delivery was requested, and this link is also ready to copy and send directly."
              : "Email delivery is not confirmed. Copy this secure link and send it to the tenant by text, email, or message."}
          </p>
          {emailError ? <p className="mt-2 text-xs leading-5 text-amber-700">{emailError}</p> : null}
        </div>
        <Badge tone={emailStatus === "sent" ? "success" : "warning"}>{emailStatus === "sent" ? "Email requested" : "Copy recommended"}</Badge>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
        <Input id={inputId} readOnly value={inviteUrl} className="font-mono text-xs" onFocus={(event) => event.currentTarget.select()} />
        <Button type="button" variant="secondary" onClick={() => void copyInviteLink()}>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copied" : "Copy link"}
        </Button>
        <a
          href={inviteUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-[var(--line-strong)] bg-[var(--panel)] px-3.5 py-2 text-sm font-semibold text-[var(--text)] transition hover:border-[var(--brand)] hover:bg-[var(--surface-hover)]"
        >
          <ExternalLink className="h-4 w-4" />
          Open
        </a>
      </div>
    </Card>
  );
}
