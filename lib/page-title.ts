export type NavLinkLike = { href: string; label: string };

const fallbackTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/operations": "Operations",
  "/properties": "Properties",
  "/units": "Units",
  "/tenants": "Tenants",
  "/leases": "Leases",
  "/applications": "Applications",
  "/transactions": "Payments",
  "/expenses": "Expenses",
  "/maintenance": "Maintenance",
  "/documents": "Documents",
  "/messages": "Messages",
  "/reports": "Reports",
  "/settings": "Settings",
  "/ai-assessments": "Inspections",
  "/move-ins": "New Move-In",
  "/manager-guide": "Manager Guide",
  "/renter-guide": "Renter Guide"
};

/**
 * Resolves the page title shown in the mobile top bar from the current
 * pathname. Prefers the role's own nav labels (longest matching href wins)
 * so the header always agrees with the active nav item.
 */
export function getPageTitle(pathname: string, navItems: NavLinkLike[]): string {
  const path = pathname.split(/[?#]/)[0] || "/";
  let best: NavLinkLike | null = null;

  for (const item of navItems) {
    const href = item.href.split(/[?#]/)[0];
    if (!href) continue;
    if (path === href || path.startsWith(`${href}/`)) {
      if (!best || href.length > best.href.split(/[?#]/)[0].length) {
        best = item;
      }
    }
  }
  if (best) return best.label;

  const segment = `/${path.split("/").filter(Boolean)[0] ?? ""}`;
  if (fallbackTitles[segment]) return fallbackTitles[segment];

  const word = segment.replace("/", "").replace(/-/g, " ");
  if (!word) return "Nexus";
  return word.charAt(0).toUpperCase() + word.slice(1);
}
