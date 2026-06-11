import Link from "next/link";

export function PublicSiteFooter() {
  return (
    <footer className="public-footer">
      <div className="public-footer-inner">
        <div>
          <p className="text-sm font-semibold text-white">Nexus Rentals</p>
          <p className="mt-1 text-xs text-slate-400">Clearer property operations for managers and residents.</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-medium text-slate-300">
          <Link href="/#platform">Platform</Link>
          <Link href="/#mission">Mission</Link>
          <Link href="/#about">About us</Link>
          <Link href="/login">Login</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/payment-terms">Payment terms</Link>
          <Link href="/privacy-request">Privacy requests</Link>
        </div>
      </div>
    </footer>
  );
}
