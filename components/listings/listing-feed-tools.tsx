"use client";

import { Check, Copy, ExternalLink } from "lucide-react";
import { useState } from "react";

function FeedUrlRow({ label, url, description }: { label: string; url: string; description: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-[var(--text)]">{label}</span>
        <div className="flex items-center gap-1.5">
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-[var(--line-strong)] bg-[var(--panel)] px-2 py-1 text-xs font-medium text-[var(--text)] transition hover:border-[var(--brand)]"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open
          </a>
          <button
            type="button"
            onClick={copy}
            className="inline-flex items-center gap-1 rounded-md border border-[var(--line-strong)] bg-[var(--panel)] px-2 py-1 text-xs font-medium text-[var(--text)] transition hover:border-[var(--brand)]"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
      <code className="mt-2 block truncate rounded bg-[var(--panel)] px-2 py-1 text-xs text-[var(--muted-strong)]">{url}</code>
      <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{description}</p>
    </div>
  );
}

export function ListingFeedTools({ genericUrl, zillowUrl }: { genericUrl: string; zillowUrl: string }) {
  return (
    <div className="space-y-3">
      <FeedUrlRow
        label="Zillow / MITS feed (XML)"
        url={zillowUrl}
        description="MITS-style XML of every active, feed-ready listing. Used for Zillow/partner feed onboarding."
      />
      <FeedUrlRow
        label="Generic feed (JSON)"
        url={genericUrl}
        description="Partner-neutral JSON of the same listings. Useful for debugging and future integrations."
      />
      <p className="rounded-md border border-amber-600/18 bg-amber-500/12 px-3 py-2 text-xs leading-5 text-amber-800">
        These feeds are used for partner approval and syndication. Zillow / Apartments.com must approve Nexus and validate the
        feed before any listing goes live externally — generating a feed does not publish to those sites.
      </p>
    </div>
  );
}
