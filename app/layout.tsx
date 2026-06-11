import type { Metadata } from "next";
import { SpeedInsights } from "@vercel/speed-insights/next";

import "@/app/globals.css";

export const metadata: Metadata = {
  title: "Nexus Rentals",
  description: "AI-enhanced property and rental management platform."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}
        <SpeedInsights />
      </body>
    </html>
  );
}
