import {
  BellRing,
  Building2,
  ClipboardList,
  CreditCard,
  FileCheck2,
  Gauge,
  Home,
  Settings,
  ShieldCheck,
  Users
} from "lucide-react";
import type { ComponentType } from "react";

import type { UserRole } from "@/lib/store";

type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  description: string;
};

type RoleConfig = {
  label: string;
  homeLabel: string;
  description: string;
  nav: NavItem[];
  routes: string[];
};

export const roleConfigs: Record<UserRole, RoleConfig> = {
  ADMIN: {
    label: "Admin",
    homeLabel: "Executive dashboard",
    description: "Portfolio oversight, reporting, compliance, and team controls.",
    nav: [
      { href: "/dashboard", label: "Executive", icon: Gauge, description: "Portfolio KPIs and executive visibility" },
      { href: "/properties", label: "Portfolio", icon: Building2, description: "Properties, units, and assignments" },
      { href: "/tenants", label: "People", icon: Users, description: "Tenant, manager, and leaseholder directory" },
      { href: "/leases", label: "Leases", icon: Home, description: "Lease pipeline and renewal exposure" },
      { href: "/transactions", label: "Payments", icon: CreditCard, description: "Collections and receivables" },
      { href: "/maintenance", label: "Maintenance", icon: ClipboardList, description: "Service volume and work orders" },
      { href: "/reports", label: "Reporting", icon: FileCheck2, description: "Financials, compliance, and exports" },
      { href: "/settings", label: "Settings", icon: ShieldCheck, description: "Platform settings and permissions" }
    ],
    routes: ["/dashboard", "/properties", "/tenants", "/leases", "/transactions", "/maintenance", "/reports", "/settings", "/units", "/expenses", "/ai-assessments"]
  },
  MANAGER: {
    label: "Manager",
    homeLabel: "Operations dashboard",
    description: "Day-to-day property operations for assigned assets.",
    nav: [
      { href: "/dashboard", label: "Operations", icon: Gauge, description: "Assigned property performance and action queues" },
      { href: "/properties", label: "Properties", icon: Building2, description: "Assigned buildings and unit status" },
      { href: "/tenants", label: "Tenants", icon: Users, description: "Resident roster and communications" },
      { href: "/leases", label: "Leases", icon: Home, description: "Renewals, move-ins, and upcoming expirations" },
      { href: "/transactions", label: "Payments", icon: CreditCard, description: "Overdue rent and rent status" },
      { href: "/maintenance", label: "Maintenance", icon: ClipboardList, description: "Open issues and vendor progress" },
      { href: "/ai-assessments", label: "Inspections", icon: FileCheck2, description: "Damage review and turnover support" }
    ],
    routes: ["/dashboard", "/properties", "/tenants", "/leases", "/transactions", "/maintenance", "/units", "/ai-assessments"]
  },
  TENANT: {
    label: "Tenant",
    homeLabel: "Resident home",
    description: "Rent, maintenance, documents, and communication in one place.",
    nav: [
      { href: "/dashboard", label: "Home", icon: Gauge, description: "Balance, lease health, and announcements" },
      { href: "/leases", label: "My Lease", icon: Home, description: "Lease terms, documents, and contacts" },
      { href: "/transactions", label: "Payments", icon: CreditCard, description: "Balance, history, and rent actions" },
      { href: "/maintenance", label: "Maintenance", icon: ClipboardList, description: "Submit and track requests" },
      { href: "/settings", label: "Profile", icon: Settings, description: "Account details and preferences" },
      { href: "/dashboard#announcements", label: "Messages", icon: BellRing, description: "Recent notices and building updates" }
    ],
    routes: ["/dashboard", "/leases", "/transactions", "/maintenance", "/settings"]
  }
};

export function getRoleConfig(role: UserRole) {
  return roleConfigs[role];
}

export function canAccessPath(role: UserRole, pathname: string) {
  const config = roleConfigs[role];
  if (!config) return false;
  return config.routes.some((route) => pathname.startsWith(route));
}
