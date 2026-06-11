import type { NextConfig } from "next";

// Baseline hardening headers applied to every response. These are intentionally
// conservative: no full Content-Security-Policy (which would risk breaking
// inline styles / charts), only the high-value, low-risk protections.
const securityHeaders = [
  // Clickjacking: forbid this app from being framed by any other origin so a
  // payment or destructive button cannot be overlaid in a hidden iframe.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  // MIME sniffing: user-uploaded files are served same-origin, so stop browsers
  // from reinterpreting them (e.g. a disguised file) as HTML/JavaScript.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Limit referrer leakage of internal paths/tokens to third parties.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Force HTTPS for a year (browsers ignore this on localhost) to block
  // SSL-strip / downgrade attacks against session cookies.
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" }
];

const nextConfig: NextConfig = {
  // Remove the framework-fingerprinting "x-powered-by: Next.js" header.
  poweredByHeader: false,
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb"
    }
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders
      }
    ];
  }
};

export default nextConfig;
