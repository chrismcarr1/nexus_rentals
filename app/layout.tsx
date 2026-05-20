import type { Metadata } from "next";

import "@/app/globals.css";

export const metadata: Metadata = {
  title: "Nexus Rentals",
  description: "AI-enhanced property and rental management platform."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
