import Link from "next/link";
import { ShieldCheck } from "lucide-react";

import { NexusLogo } from "@/components/brand/nexus-logo";
import { cn } from "@/lib/utils";

type AuthShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  cardTitle: string;
  cardDescription?: string;
  noteTitle: string;
  note: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
};

export function AuthShell({
  eyebrow,
  title,
  description,
  cardTitle,
  cardDescription,
  noteTitle,
  note,
  children,
  footer,
  wide = false
}: AuthShellProps) {
  return (
    <main className="auth-page">
      <header className="auth-header">
        <Link href="/" className="auth-brand" aria-label="Nexus Rentals home">
          <NexusLogo variant="full" size="sm" priority />
        </Link>
        <Link href="/" className="auth-home-link">Back to home</Link>
      </header>

      <div className={cn("auth-layout", wide && "auth-layout-wide")}>
        <section className="auth-intro">
          <p className="auth-eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p className="auth-intro-copy">{description}</p>
          <div className="auth-assurance">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            <div>
              <strong>{noteTitle}</strong>
              <p>{note}</p>
            </div>
          </div>
        </section>

        <section className={cn("auth-card", wide && "auth-card-wide")}>
          <div className="auth-card-header">
            <h2>{cardTitle}</h2>
            {cardDescription ? <p>{cardDescription}</p> : null}
          </div>
          <div className="auth-card-body">{children}</div>
          {footer ? <div className="auth-card-footer">{footer}</div> : null}
        </section>
      </div>

      <footer className="auth-page-footer">
        <NexusLogo variant="full" size="xs" />
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <Link href="/terms" className="auth-home-link">Terms</Link>
          <Link href="/privacy" className="auth-home-link">Privacy</Link>
          <Link href="/payment-terms" className="auth-home-link">Payment terms</Link>
          <Link href="/privacy-request" className="auth-home-link">Privacy requests</Link>
        </span>
      </footer>
    </main>
  );
}
