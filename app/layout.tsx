import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

import "@/app/globals.css";

export const metadata: Metadata = {
  title: "Nexus Rentals",
  description: "Professional property and rental management software for managers and residents.",
  applicationName: "Nexus Rentals",
  icons: {
    icon: [
      { url: "/icon.png", type: "image/png", sizes: "512x512" },
      { url: "/brand/nexus-house-icon-transparent.png", type: "image/png", sizes: "512x512" }
    ],
    apple: "/icon.png"
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
