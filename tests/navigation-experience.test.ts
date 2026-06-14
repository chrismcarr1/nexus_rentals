import { promises as fs } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = path.join(__dirname, "..");

async function read(relativePath: string) {
  return fs.readFile(path.join(ROOT, relativePath), "utf8");
}

describe("timeline and collapsible navigation wiring", () => {
  it("replaces page-level payment calendars with operations cards", async () => {
    const dashboard = await read("app/(app)/dashboard/page.tsx");
    const transactions = await read("app/(app)/transactions/page.tsx");
    const operations = await read("app/(app)/operations/page.tsx");
    const middleware = await read("middleware.ts");

    expect(dashboard).toContain("UpcomingOperationsCard");
    expect(transactions).toContain("UpcomingOperationsCard");
    expect(dashboard).not.toContain("PaymentCalendar");
    expect(transactions).not.toContain("PaymentCalendar");
    expect(operations).toContain("Operations Timeline");
    expect(operations).toContain("OPERATIONS_FILTERS");
    expect(middleware).toContain('"/operations"');
  });

  it("keeps icons visible while labels collapse and persists desktop state", async () => {
    const shell = await read("components/app-shell.tsx");
    const nav = await read("components/sidebar-nav.tsx");
    const css = await read("app/globals.css");

    expect(shell).toContain('window.localStorage.getItem("nexus-sidebar-collapsed")');
    expect(shell).toContain('window.localStorage.setItem("nexus-sidebar-collapsed"');
    expect(shell).toContain("collapsed && \"app-sidebar-collapsed\"");
    expect(nav).toContain("sidebar-nav-icon");
    expect(nav).toContain("sidebar-nav-text");
    expect(css).toContain(".app-sidebar-collapsed .sidebar-nav-text");
    expect(css).toContain(".app-sidebar-collapsed .sidebar-nav-icon");
  });

  it("provides an accessible mobile top-nav menu without changing logout behavior", async () => {
    const shell = await read("components/app-shell.tsx");
    const topBar = await read("components/top-bar.tsx");
    const menuPanel = await read("components/mobile-menu-panel.tsx");
    const css = await read("app/globals.css");

    expect(topBar).toContain('aria-controls="mobile-menu"');
    expect(topBar).toContain("mobile-nav-trigger");
    expect(topBar).toContain("mobile-topbar-title");
    expect(shell).toContain("MobileMenuPanel");
    expect(shell).toContain('event.key === "Escape"');
    expect(shell).toContain("<form action={logoutAction}>");
    expect(menuPanel).toContain("logoutAction");
    expect(menuPanel).toContain('role="dialog"');
    expect(css).toContain(".mobile-menu-overlay-open");
    expect(css).toContain(".mobile-nav-trigger");
  });
});
