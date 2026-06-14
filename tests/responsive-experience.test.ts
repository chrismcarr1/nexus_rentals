import { promises as fs } from "node:fs";
import path from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { labelRowCells, nodeText } from "@/components/data-table-labels";
import { getPageTitle } from "@/lib/page-title";
import { roleConfigs } from "@/lib/rbac";

const ROOT = path.join(__dirname, "..");

async function read(relativePath: string) {
  return fs.readFile(path.join(ROOT, relativePath), "utf8");
}

describe("mobile top navigation shell", () => {
  it("keeps the desktop sidebar and hides it on phones in favor of the top menu sheet", async () => {
    const shell = await read("components/app-shell.tsx");
    const css = await read("app/globals.css");

    expect(shell).toContain('"app-sidebar"');
    expect(shell).toContain("MobileMenuPanel");
    // The phone breakpoint hides the permanent sidebar entirely.
    expect(css).toMatch(/@media \(max-width: 767\.98px\) \{[\s\S]*?\.app-sidebar,\s*\.app-sidebar-collapsed \{\s*display: none;/);
    // The top bar is sticky on phones.
    expect(css).toMatch(/@media \(max-width: 767\.98px\) \{\s*\.app-topbar \{\s*position: sticky;/);
    // No remaining left-drawer implementation.
    expect(css).not.toContain(".app-sidebar-mobile-open");
    expect(css).not.toContain(".app-sidebar-backdrop");
  });

  it("forces an icon rail on tablets and keeps the user toggle on desktop", async () => {
    const shell = await read("components/app-shell.tsx");
    expect(shell).toContain('useMediaQuery("(min-width: 768px) and (max-width: 1023.98px)")');
    expect(shell).toContain("sidebarCollapsed || isTabletRail");
  });

  it("gives the admin shell its own mobile menu", async () => {
    const adminShell = await read("components/admin/admin-shell.tsx");
    expect(adminShell).toContain("mobile-menu-overlay");
    expect(adminShell).toContain("mobile-nav-trigger");
    expect(adminShell).toContain('aria-controls="admin-mobile-menu"');
  });

  it("derives the mobile header title from role navigation", () => {
    expect(getPageTitle("/properties", roleConfigs.MANAGER.nav)).toBe("Properties");
    expect(getPageTitle("/properties/abc123", roleConfigs.MANAGER.nav)).toBe("Properties");
    expect(getPageTitle("/transactions", roleConfigs.TENANT.nav)).toBe("Payments");
    expect(getPageTitle("/dashboard", roleConfigs.TENANT.nav)).toBe("Home");
    expect(getPageTitle("/move-ins/new", roleConfigs.MANAGER.nav)).toBe("New Move-In");
    expect(getPageTitle("/expenses", roleConfigs.ADMIN.nav)).toBe("Expenses");
  });
});

describe("responsive data tables", () => {
  it("labels body cells from column headers so phones can render card rows", () => {
    const labels = ["Tenant", "Amount", ""].map((column) => nodeText(column).trim());
    const rows = [
      createElement(
        "tr",
        { key: "row-1", className: "table-row" },
        createElement("td", { key: "a", className: "table-cell" }, "Jordan Smith"),
        createElement("td", { key: "b", className: "table-cell" }, "$1,200"),
        createElement("td", { key: "c", className: "table-cell text-right" }, "Actions")
      )
    ];
    const markup = renderToStaticMarkup(createElement("table", null, createElement("tbody", null, labelRowCells(rows, labels))));

    expect(markup).toContain('data-label="Tenant"');
    expect(markup).toContain('data-label="Amount"');
    // Empty column headers must not produce empty labels.
    expect(markup).not.toContain('data-label=""');
  });

  it("extracts text labels from rich header nodes such as sort links", () => {
    const columns = [createElement("a", { href: "/sort" }, "Due date"), "Status"];
    const labels = columns.map((column) => nodeText(column).trim());
    const rows = createElement(
      "tr",
      null,
      createElement("td", null, "Jun 1"),
      createElement("td", null, "Paid")
    );
    const markup = renderToStaticMarkup(createElement("table", null, createElement("tbody", null, labelRowCells(rows, labels))));

    expect(markup).toContain('data-label="Due date"');
    expect(markup).toContain('data-label="Status"');
  });

  it("labels cells nested inside row components such as ClickableTableRow", () => {
    function RowComponent({ children }: { children?: React.ReactNode }) {
      return createElement("tr", null, children);
    }
    const rows = createElement(
      RowComponent,
      null,
      createElement("td", null, "Cedar Ridge"),
      createElement("td", null, "92%")
    );
    const markup = renderToStaticMarkup(
      createElement("table", null, createElement("tbody", null, labelRowCells(rows, ["Property", "Occupancy"])))
    );

    expect(markup).toContain('data-label="Property"');
    expect(markup).toContain('data-label="Occupancy"');
  });

  it("turns table rows into stacked cards below the phone breakpoint", async () => {
    const css = await read("app/globals.css");
    expect(css).toMatch(/\.data-table-frame thead \{\s*display: none;/);
    expect(css).toMatch(/\.data-table-frame td\[data-label\]::before \{\s*content: attr\(data-label\);/);
    expect(css).toMatch(/\.data-table-frame table \{[\s\S]*?min-width: 0 !important;/);
  });
});

describe("responsive page behaviors", () => {
  it("messages switch between list and thread on phones with a back control", async () => {
    const page = await read("app/(app)/messages/page.tsx");
    const css = await read("app/globals.css");

    expect(page).toContain('selected ? "messages-show-thread" : "messages-show-list"');
    expect(page).toContain('className="messages-back"');
    expect(css).toContain(".messages-show-thread .messages-conversations");
    expect(css).toContain(".messages-show-list .messages-thread-column");
  });

  it("keeps the move-in billing checkbox and its absorbed-charge copy", async () => {
    const wizard = await read("components/new-move-in-wizard.tsx");
    expect(wizard).toContain("Manager absorbs $1 payment charge");
    expect(wizard).toContain("managerAbsorbsPaymentCharge");
  });

  it("documents register shows file names, never raw storage paths, in table cells", async () => {
    const page = await read("app/(app)/documents/page.tsx");
    expect(page).toContain("DataTable");
    // Render display name and original file name, not the storage path field.
    expect(page).not.toMatch(/\{row\.file\.path\}/);
  });
});
