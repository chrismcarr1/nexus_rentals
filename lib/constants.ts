import {
  Building2,
  ClipboardList,
  CreditCard,
  Gauge,
  Home,
  Receipt,
  Settings,
  Sparkles,
  Users
} from "lucide-react";

export const appNav = [
  { href: "/dashboard", label: "Dashboard", icon: Gauge },
  { href: "/properties", label: "Properties", icon: Building2 },
  { href: "/tenants", label: "Tenants", icon: Users },
  { href: "/leases", label: "Leases", icon: Home },
  { href: "/transactions", label: "Transactions", icon: CreditCard },
  { href: "/expenses", label: "Expenses", icon: Receipt },
  { href: "/maintenance", label: "Maintenance", icon: ClipboardList },
  { href: "/ai-assessments", label: "AI Assessments", icon: Sparkles },
  { href: "/reports", label: "Reports", icon: Gauge },
  { href: "/settings", label: "Settings", icon: Settings }
];
