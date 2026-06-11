import Link from "next/link";
import { ShieldCheck } from "lucide-react";

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
          <span className="auth-brand-mark" aria-hidden="true">N</span>
          <span>Nexus Rentals</span>
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
        <span>Nexus Rentals</span>
        <span>Clear tools for everyday rental operations.</span>
      </footer>
    </main>
  );
}
