import {
  BellRing,
  BarChart3,
  Building2,
  ClipboardList,
  CreditCard,
  FileCheck2,
  FileText,
  Gauge,
  Home,
  MessageSquare,
  Receipt,
  Settings,
  ShieldCheck,
  TableProperties,
  Users
} from "lucide-react";

import type { UserRole } from "@/lib/store";

export const navIconNames = {
  barChart3: BarChart3.displayName ?? "BarChart3",
  bellRing: BellRing.displayName ?? "BellRing",
  building2: Building2.displayName ?? "Building2",
  clipboardList: ClipboardList.displayName ?? "ClipboardList",
  creditCard: CreditCard.displayName ?? "CreditCard",
  fileCheck2: FileCheck2.displayName ?? "FileCheck2",
  fileText: FileText.displayName ?? "FileText",
  gauge: Gauge.displayName ?? "Gauge",
  home: Home.displayName ?? "Home",
  messageSquare: MessageSquare.displayName ?? "MessageSquare",
  receipt: Receipt.displayName ?? "Receipt",
  settings: Settings.displayName ?? "Settings",
  shieldCheck: ShieldCheck.displayName ?? "ShieldCheck",
  tableProperties: TableProperties.displayName ?? "TableProperties",
  users: Users.displayName ?? "Users"
} as const;

export type NavIconName = keyof typeof navIconNames;

type NavItem = {
  href: string;
  label: string;
  icon: NavIconName;
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
      { href: "/dashboard", label: "Executive", icon: "gauge", description: "Portfolio KPIs and executive visibility" },
      { href: "/properties", label: "Portfolio", icon: "building2", description: "Properties, units, and assignments" },
      { href: "/tenants", label: "People", icon: "users", description: "Tenant, manager, and leaseholder directory" },
      { href: "/leases", label: "Leases", icon: "home", description: "Lease pipeline and renewal exposure" },
      { href: "/transactions", label: "Payments", icon: "creditCard", description: "Collections and receivables" },
      { href: "/expenses", label: "Expenses", icon: "receipt", description: "Operating spend and vendor cost tracking" },
      { href: "/maintenance", label: "Maintenance", icon: "clipboardList", description: "Service volume and work orders" },
      { href: "/documents", label: "Documents", icon: "fileText", description: "Lease, property, unit, and inspection files" },
      { href: "/ai-assessments", label: "Inspections", icon: "fileCheck2", description: "Damage review and turnover support" },
      { href: "/reports", label: "Reporting", icon: "fileCheck2", description: "Financials, compliance, and exports" },
      { href: "/settings", label: "Settings", icon: "shieldCheck", description: "Platform settings and permissions" }
    ],
    routes: ["/dashboard", "/properties", "/tenants", "/leases", "/transactions", "/maintenance", "/documents", "/reports", "/settings", "/units", "/expenses", "/ai-assessments", "/api/stripe/connect"]
  },
  MANAGER: {
    label: "Manager",
    homeLabel: "Operations dashboard",
    description: "Day-to-day property operations for assigned assets.",
    nav: [
      { href: "/dashboard", label: "Dashboard", icon: "gauge", description: "Assigned property performance and action queues" },
      { href: "/properties", label: "Properties", icon: "building2", description: "Assigned buildings and unit status" },
      { href: "/units", label: "Units", icon: "tableProperties", description: "Unit inventory, occupancy, and lease status" },
      { href: "/tenants", label: "Tenants", icon: "users", description: "Resident roster and communications" },
      { href: "/leases", label: "Leases", icon: "home", description: "Renewals, move-ins, and upcoming expirations" },
      { href: "/applications", label: "Applications", icon: "fileCheck2", description: "Rental applications and applicant review" },
      { href: "/transactions", label: "Payments", icon: "creditCard", description: "Overdue rent and rent status" },
      { href: "/maintenance", label: "Maintenance", icon: "clipboardList", description: "Open issues and vendor progress" },
      { href: "/documents", label: "Documents", icon: "fileText", description: "Lease, property, unit, and inspection files" },
      { href: "/reports", label: "Reports", icon: "barChart3", description: "Portfolio reporting and operating visibility" },
      { href: "/settings", label: "Settings", icon: "settings", description: "Profile and assigned property context" }
    ],
    routes: ["/dashboard", "/properties", "/units", "/tenants", "/leases", "/applications", "/move-ins", "/transactions", "/expenses", "/maintenance", "/messages", "/documents", "/reports", "/ai-assessments", "/settings", "/manager-guide", "/api/stripe/connect"]
  },
  TENANT: {
    label: "Tenant",
    homeLabel: "Resident home",
    description: "Rent, maintenance, documents, and communication in one place.",
    nav: [
      { href: "/dashboard", label: "Home", icon: "gauge", description: "Balance, lease health, and announcements" },
      { href: "/leases", label: "My Lease", icon: "home", description: "Lease terms, documents, and contacts" },
      { href: "/transactions", label: "Payments", icon: "creditCard", description: "Balance, history, and rent actions" },
      { href: "/maintenance", label: "Maintenance", icon: "clipboardList", description: "Submit and track requests" },
      { href: "/messages", label: "Messages", icon: "messageSquare", description: "Discussion with your manager" },
      { href: "/settings", label: "Profile", icon: "settings", description: "Account details and preferences" },
      { href: "/dashboard#announcements", label: "Notices", icon: "bellRing", description: "Recent building updates" }
    ],
    routes: ["/dashboard", "/leases", "/transactions", "/maintenance", "/messages", "/settings", "/renter-guide"]
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
