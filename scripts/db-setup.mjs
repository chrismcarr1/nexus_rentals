import { config } from "dotenv";

import bcrypt from "bcryptjs";
import postgres from "postgres";

config({ path: ".env.local" });
config();

const databaseUrl = process.env.DATABASE_URL?.startsWith("postgres://")
  ? `postgresql://${process.env.DATABASE_URL.slice("postgres://".length)}`
  : process.env.DATABASE_URL;
const databaseUrlHelp =
  "DATABASE_URL is missing, invalid, or still a placeholder. Set it to a real hosted Postgres connection string like postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require in .env.local for local development and in Vercel environment variables for production.";

if (!databaseUrl) {
  console.error(databaseUrlHelp);
  process.exit(1);
}
if (!databaseUrl.startsWith("postgresql://")) {
  console.error(`${databaseUrlHelp} SQLite/file URLs are not supported.`);
  process.exit(1);
}
try {
  const parsed = new URL(databaseUrl);
  const databaseName = parsed.pathname.replace(/^\//, "");
  const placeholders = ["user", "password", "host", "database", "db"];
  if ([parsed.username, parsed.password, parsed.hostname, databaseName].some((value) => placeholders.includes(value.toLowerCase()))) {
    console.error(databaseUrlHelp);
    process.exit(1);
  }
} catch {
  console.error(databaseUrlHelp);
  process.exit(1);
}

const sql = postgres(databaseUrl, {
  max: 1,
  idle_timeout: 5,
  connect_timeout: 10,
  prepare: false,
  ssl: "require"
});

function iso(date) {
  return date.toISOString();
}

function shiftDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function shiftMonths(date, amount) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + amount);
  return next;
}

async function main() {
  const now = new Date();

  const store = {
    organizations: [{ id: "org_nexus", name: "Nexus Rentals", email: "contact@nexusrentals.local", phone: "(415) 555-0190", mailingAddress: "240 Valencia Street, Suite 500, San Francisco, CA 94103", logoPath: "/demo/logo-mark.svg", createdAt: iso(now), updatedAt: iso(now) }],
    users: [
      { id: "user_admin", organizationId: "org_nexus", email: "demo@nexusrentals.local", passwordHash: await bcrypt.hash("DemoPass123!", 12), firstName: "Avery", lastName: "Stone", role: "ADMIN", isActive: true, title: "Principal Operator", phone: "(415) 555-0132", createdAt: iso(now), updatedAt: iso(now) },
      { id: "user_manager", organizationId: "org_nexus", email: "manager@nexusrentals.local", passwordHash: await bcrypt.hash("ManagerPass123!", 12), firstName: "Jordan", lastName: "Lee", role: "MANAGER", isActive: true, title: "Property Manager", phone: "(415) 555-0177", createdAt: iso(now), updatedAt: iso(now) },
      { id: "user_tenant", organizationId: "org_nexus", email: "tenant@nexusrentals.local", passwordHash: await bcrypt.hash("TenantPass123!", 12), firstName: "Sam", lastName: "Carter", role: "TENANT", isActive: true, title: "Resident", createdAt: iso(now), updatedAt: iso(now) }
    ],
    properties: [
      { id: "prop_harbor", organizationId: "org_nexus", managerId: "user_manager", name: "Harbor Point Residences", addressLine1: "880 Mission Bay Blvd", city: "San Francisco", state: "CA", postalCode: "94158", status: "ACTIVE", description: "A mixed-use mid-rise asset with renovated interiors and strong waterfront demand.", amenities: "Fitness studio, secure package room, rooftop lounge, EV charging", notes: "Premium Class A demo property with high occupancy.", createdAt: iso(now), updatedAt: iso(now) },
      { id: "prop_maple", organizationId: "org_nexus", managerId: "user_manager", name: "Maple Terrace Townhomes", addressLine1: "1416 Maple Terrace", city: "Oakland", state: "CA", postalCode: "94612", status: "ACTIVE", description: "Townhome cluster with stable long-term residents and lower turnover.", amenities: "Private garages, dog run, community patio", notes: "Strong family occupancy, maintenance-heavy landscaping.", createdAt: iso(now), updatedAt: iso(now) },
      { id: "prop_cedar", organizationId: "org_nexus", name: "Cedar Heights Flats", addressLine1: "522 Cedar Street", city: "Berkeley", state: "CA", postalCode: "94709", status: "ACTIVE", description: "Small-format student and graduate housing with high lease velocity.", amenities: "Bike storage, parcel lockers, study lounge", notes: "Targeted to graduate students and faculty.", createdAt: iso(now), updatedAt: iso(now) }
    ],
    units: [
      { id: "unit_3a", propertyId: "prop_harbor", unitNumber: "3A", nickname: "Bay View", unitType: "Apartment", bedrooms: 2, bathrooms: 2, squareFeet: 1040, monthlyRent: 4250, depositAmount: 4250, occupancyStatus: "OCCUPIED", leaseStatus: "ACTIVE", amenities: "Water view, balcony, quartz kitchen", createdAt: iso(now), updatedAt: iso(now) },
      { id: "unit_5c", propertyId: "prop_harbor", unitNumber: "5C", nickname: "Skyline Loft", unitType: "Loft", bedrooms: 1, bathrooms: 1, squareFeet: 780, monthlyRent: 3395, depositAmount: 3200, occupancyStatus: "NOTICE", leaseStatus: "ACTIVE", amenities: "Double-height windows, smart lock", createdAt: iso(now), updatedAt: iso(now) },
      { id: "unit_2b", propertyId: "prop_harbor", unitNumber: "2B", nickname: "Garden Studio", unitType: "Studio", bedrooms: 0, bathrooms: 1, squareFeet: 520, monthlyRent: 2595, depositAmount: 2500, occupancyStatus: "VACANT", leaseStatus: "UPCOMING", amenities: "Courtyard access, in-unit laundry", createdAt: iso(now), updatedAt: iso(now) },
      { id: "unit_12", propertyId: "prop_maple", unitNumber: "12", nickname: "Endcap Townhome", unitType: "Townhome", bedrooms: 3, bathrooms: 2.5, squareFeet: 1460, monthlyRent: 3895, depositAmount: 3800, occupancyStatus: "OCCUPIED", leaseStatus: "ACTIVE", amenities: "Private garage, fenced patio", createdAt: iso(now), updatedAt: iso(now) },
      { id: "unit_15", propertyId: "prop_maple", unitNumber: "15", nickname: "Corner Renovation", unitType: "Townhome", bedrooms: 2, bathrooms: 2, squareFeet: 1220, monthlyRent: 3495, depositAmount: 3400, occupancyStatus: "TURNOVER", leaseStatus: "EXPIRED", amenities: "Updated flooring, townhouse entry", createdAt: iso(now), updatedAt: iso(now) },
      { id: "unit_1d", propertyId: "prop_cedar", unitNumber: "1D", nickname: "Courtyard Flat", unitType: "Apartment", bedrooms: 1, bathrooms: 1, squareFeet: 640, monthlyRent: 2795, depositAmount: 2700, occupancyStatus: "OCCUPIED", leaseStatus: "ACTIVE", amenities: "Courtyard-facing, built-ins", createdAt: iso(now), updatedAt: iso(now) },
      { id: "unit_4a", propertyId: "prop_cedar", unitNumber: "4A", nickname: "Top Floor", unitType: "Apartment", bedrooms: 2, bathrooms: 1, squareFeet: 890, monthlyRent: 3150, depositAmount: 3000, occupancyStatus: "OCCUPIED", leaseStatus: "UPCOMING", amenities: "Top floor, skylight, storage niche", createdAt: iso(now), updatedAt: iso(now) }
    ],
    tenants: [
      { id: "tenant_sam", organizationId: "org_nexus", firstName: "Sam", lastName: "Carter", email: "tenant@nexusrentals.local", phone: "(510) 555-0189", employer: "Bayshore Labs", emergencyName: "Nina Carter", emergencyPhone: "(510) 555-0121", notes: "Pays via ACH, prefers text updates.", createdAt: iso(now), updatedAt: iso(now) },
      { id: "tenant_maya", organizationId: "org_nexus", firstName: "Maya", lastName: "Patel", email: "maya.patel@example.com", phone: "(415) 555-0171", employer: "Kite Health", createdAt: iso(now), updatedAt: iso(now) },
      { id: "tenant_luis", organizationId: "org_nexus", firstName: "Luis", lastName: "Moreno", email: "luis.moreno@example.com", phone: "(415) 555-0147", employer: "Arc Transit", createdAt: iso(now), updatedAt: iso(now) },
      { id: "tenant_elena", organizationId: "org_nexus", firstName: "Elena", lastName: "Kim", email: "elena.kim@example.com", phone: "(510) 555-0118", employer: "UC Berkeley", createdAt: iso(now), updatedAt: iso(now) }
    ],
    leases: [
      { id: "lease_3a", unitId: "unit_3a", tenantIds: ["tenant_sam"], startDate: iso(shiftMonths(now, -8)), endDate: iso(shiftMonths(now, 4)), monthlyRent: 4250, dueDay: 1, securityDeposit: 4250, recurringCharges: "Parking 175, Pet 50", lateFeePolicy: "5% of unpaid balance after day 5", status: "ACTIVE", createdAt: iso(now), updatedAt: iso(now) },
      { id: "lease_5c", unitId: "unit_5c", tenantIds: ["tenant_maya"], startDate: iso(shiftMonths(now, -12)), endDate: iso(shiftDays(now, 24)), monthlyRent: 3395, dueDay: 1, securityDeposit: 3200, recurringCharges: "Storage 65", lateFeePolicy: "$95 fixed fee after day 4", status: "ACTIVE", createdAt: iso(now), updatedAt: iso(now) },
      { id: "lease_12", unitId: "unit_12", tenantIds: ["tenant_luis"], startDate: iso(shiftMonths(now, -10)), endDate: iso(shiftMonths(now, 2)), monthlyRent: 3895, dueDay: 1, securityDeposit: 3800, recurringCharges: "Trash 35", status: "ACTIVE", createdAt: iso(now), updatedAt: iso(now) },
      { id: "lease_1d", unitId: "unit_1d", tenantIds: ["tenant_elena"], startDate: iso(shiftMonths(now, -3)), endDate: iso(shiftMonths(now, 9)), monthlyRent: 2795, dueDay: 1, securityDeposit: 2700, recurringCharges: "Internet 60", status: "ACTIVE", createdAt: iso(now), updatedAt: iso(now) },
      { id: "lease_15", unitId: "unit_15", tenantIds: [], startDate: iso(shiftMonths(now, -16)), endDate: iso(shiftDays(now, -8)), monthlyRent: 3495, dueDay: 1, securityDeposit: 3400, recurringCharges: "Parking 125", status: "EXPIRED", notes: "Former tenant moved out; awaiting full turn invoice.", createdAt: iso(now), updatedAt: iso(now) }
    ],
    payments: [
      { id: "pay_1", unitId: "unit_3a", leaseId: "lease_3a", description: "April rent", amount: 4250, dueDate: iso(shiftDays(now, -17)), paidDate: iso(shiftDays(now, -16)), status: "PAID", lateFeeAmount: 0, balanceDue: 0, categoryTag: "Rent", createdAt: iso(now), updatedAt: iso(now) },
      { id: "pay_2", unitId: "unit_5c", leaseId: "lease_5c", description: "April rent", amount: 3395, dueDate: iso(shiftDays(now, -17)), status: "LATE", lateFeeAmount: 95, balanceDue: 3490, categoryTag: "Rent", createdAt: iso(now), updatedAt: iso(now) },
      { id: "pay_3", unitId: "unit_12", leaseId: "lease_12", description: "April rent", amount: 3895, dueDate: iso(shiftDays(now, -17)), paidDate: iso(shiftDays(now, -15)), status: "PAID", lateFeeAmount: 0, balanceDue: 0, categoryTag: "Rent", createdAt: iso(now), updatedAt: iso(now) },
      { id: "pay_4", unitId: "unit_1d", leaseId: "lease_1d", description: "April rent", amount: 2795, dueDate: iso(shiftDays(now, -17)), paidDate: iso(shiftDays(now, -14)), status: "PAID", lateFeeAmount: 0, balanceDue: 0, categoryTag: "Rent", createdAt: iso(now), updatedAt: iso(now) },
      { id: "pay_5", unitId: "unit_15", leaseId: "lease_15", description: "Move-out balance", amount: 680, dueDate: iso(shiftDays(now, -7)), status: "PENDING", lateFeeAmount: 0, balanceDue: 680, categoryTag: "Turnover", createdAt: iso(now), updatedAt: iso(now) }
    ],
    expenses: [
      { id: "exp_1", propertyId: "prop_harbor", unitId: "unit_3a", title: "Lobby paint touch-up", description: "Common area patch and paint before investor walkthrough.", amount: 740, incurredAt: iso(shiftDays(now, -6)), category: "REPAIR", tags: "paint,common area", vendor: "Bluebird Finishes", createdAt: iso(now), updatedAt: iso(now) },
      { id: "exp_2", propertyId: "prop_maple", unitId: "unit_15", title: "Turnover deep clean", description: "Pre-listing clean and odor treatment.", amount: 280, incurredAt: iso(shiftDays(now, -3)), category: "CLEANING", tags: "turnover,cleaning", vendor: "Spark Crew", createdAt: iso(now), updatedAt: iso(now) },
      { id: "exp_3", propertyId: "prop_maple", unitId: "unit_12", title: "Irrigation repair", description: "Rear planter drip line replacement.", amount: 520, incurredAt: iso(shiftDays(now, -12)), category: "MAINTENANCE", tags: "landscape,outdoor", vendor: "West Bay Grounds", createdAt: iso(now), updatedAt: iso(now) },
      { id: "exp_4", propertyId: "prop_cedar", unitId: "unit_1d", title: "Water utility", description: "Monthly building water allocation.", amount: 415, incurredAt: iso(shiftDays(now, -10)), category: "UTILITIES", tags: "utility,water", vendor: "EBMUD", createdAt: iso(now), updatedAt: iso(now) }
    ],
    maintenanceRequests: [
      { id: "maint_1", propertyId: "prop_maple", unitId: "unit_15", title: "Door jamb repair", description: "Move-out inspection found cracked frame and hinge pull-out.", status: "IN_PROGRESS", priority: "HIGH", estimatedCost: 650, assignedTo: "Bay Area Handyman Co.", requestedAt: iso(now), timeline: "Created from turnover inspection; materials ordered; carpenter scheduled Friday.", createdAt: iso(now), updatedAt: iso(now) },
      { id: "maint_2", propertyId: "prop_harbor", unitId: "unit_5c", title: "Dishwasher leak review", description: "Tenant reported intermittent pooling under lower rack.", status: "OPEN", priority: "MEDIUM", estimatedCost: 320, requestedAt: iso(now), timeline: "Initial intake complete; awaiting vendor triage window.", createdAt: iso(now), updatedAt: iso(now) },
      { id: "maint_3", propertyId: "prop_cedar", unitId: "unit_1d", title: "Window balance replacement", description: "Bedroom sash drops unexpectedly and does not remain open.", status: "RESOLVED", priority: "LOW", estimatedCost: 210, actualCost: 185, requestedAt: iso(now), timeline: "Repaired by campus vendor; tenant confirmed resolution.", createdAt: iso(now), updatedAt: iso(now) }
    ],
    inspections: [{ id: "insp_15", unitId: "unit_15", leaseId: "lease_15", inspectionDate: iso(shiftDays(now, -5)), type: "Move-out", notes: "Flooring gouges, wall patching, and entry door frame damage observed.", createdAt: iso(now), updatedAt: iso(now) }],
    damageAssessments: [{ id: "assess_15", inspectionId: "insp_15", createdById: "user_manager", summary: "High-severity turnover assessment with likely flooring damage, wall damage, and door/window damage impacts.", damageCategories: "flooring damage, wall damage, door/window damage", severity: "HIGH", confidenceScore: 0.88, estimatedLow: 1850, estimatedHigh: 4200, wearAndTear: false, explanation: "Observed issues exceed routine wear thresholds and likely require localized framing repair, patch/paint, and plank replacement in a visible traffic zone. Estimate is directional and should be validated by contractor bids.", recommendedNext: "Obtain two contractor estimates, preserve photo documentation, and reconcile against security deposit schedule before issuing the final accounting.", createdAt: iso(now), updatedAt: iso(now) }],
    uploadedFiles: [
      { id: "file_prop_cover_1", propertyId: "prop_harbor", kind: "PROPERTY_IMAGE", label: "Cover image", path: "/demo/property-cover.svg", mimeType: "image/svg+xml", createdAt: iso(now) },
      { id: "file_prop_cover_2", propertyId: "prop_maple", kind: "PROPERTY_IMAGE", label: "Cover image", path: "/demo/property-cover.svg", mimeType: "image/svg+xml", createdAt: iso(now) },
      { id: "file_prop_cover_3", propertyId: "prop_cedar", kind: "PROPERTY_IMAGE", label: "Cover image", path: "/demo/property-cover.svg", mimeType: "image/svg+xml", createdAt: iso(now) },
      { id: "file_unit_3a", unitId: "unit_3a", kind: "UNIT_IMAGE", label: "Unit hero", path: "/demo/unit-b.svg", mimeType: "image/svg+xml", createdAt: iso(now) },
      { id: "file_unit_5c", unitId: "unit_5c", kind: "UNIT_IMAGE", label: "Unit hero", path: "/demo/unit-c.svg", mimeType: "image/svg+xml", createdAt: iso(now) },
      { id: "file_unit_2b", unitId: "unit_2b", kind: "UNIT_IMAGE", label: "Unit hero", path: "/demo/unit-a.svg", mimeType: "image/svg+xml", createdAt: iso(now) },
      { id: "file_unit_12", unitId: "unit_12", kind: "UNIT_IMAGE", label: "Unit hero", path: "/demo/unit-d.svg", mimeType: "image/svg+xml", createdAt: iso(now) },
      { id: "file_unit_15", unitId: "unit_15", kind: "UNIT_IMAGE", label: "Unit hero", path: "/demo/unit-e.svg", mimeType: "image/svg+xml", createdAt: iso(now) },
      { id: "file_unit_1d", unitId: "unit_1d", kind: "UNIT_IMAGE", label: "Unit hero", path: "/demo/unit-f.svg", mimeType: "image/svg+xml", createdAt: iso(now) },
      { id: "file_unit_4a", unitId: "unit_4a", kind: "UNIT_IMAGE", label: "Unit hero", path: "/demo/unit-g.svg", mimeType: "image/svg+xml", createdAt: iso(now) },
      { id: "file_base_1", unitId: "unit_15", kind: "MOVE_IN_IMAGE", label: "Move-in baseline", path: "/demo/baseline.svg", mimeType: "image/svg+xml", createdAt: iso(now) },
      { id: "file_move_1", inspectionId: "insp_15", kind: "MOVE_OUT_IMAGE", label: "Move-out photo 1", path: "/demo/damage-floor.svg", mimeType: "image/svg+xml", createdAt: iso(now) },
      { id: "file_move_2", inspectionId: "insp_15", kind: "MOVE_OUT_IMAGE", label: "Move-out photo 2", path: "/demo/damage-wall.svg", mimeType: "image/svg+xml", createdAt: iso(now) },
      { id: "file_assess_1", assessmentId: "assess_15", kind: "DAMAGE_IMAGE", label: "Assessment image 1", path: "/demo/damage-floor.svg", mimeType: "image/svg+xml", createdAt: iso(now) },
      { id: "file_assess_2", assessmentId: "assess_15", kind: "DAMAGE_IMAGE", label: "Assessment image 2", path: "/demo/damage-wall.svg", mimeType: "image/svg+xml", createdAt: iso(now) }
    ],
    notifications: [
      { id: "note_1", organizationId: "org_nexus", userId: "user_admin", type: "RENT_OVERDUE", title: "1 rent payment is overdue", body: "Unit 5C at Harbor Point has an overdue balance of $3,490 including fees.", isRead: false, createdAt: iso(now) },
      { id: "note_2", organizationId: "org_nexus", userId: "user_manager", type: "LEASE_EXPIRING", title: "Lease expiring in 24 days", body: "Skyline Loft lease ends soon. Renewal decision is still pending.", isRead: false, createdAt: iso(now) },
      { id: "note_3", organizationId: "org_nexus", type: "MAINTENANCE_OPEN", title: "Maintenance item still open", body: "Dishwasher leak review has not been scheduled with a vendor yet.", isRead: false, createdAt: iso(now) },
      { id: "note_4", organizationId: "org_nexus", type: "DAMAGE_ASSESSMENT", title: "New AI assessment available", body: "Turnover estimate for Maple Terrace unit 15 is ready for review.", isRead: false, createdAt: iso(now) }
    ],
    passwordResetTokens: [{ id: "reset_demo", userId: "user_admin", token: "demo-reset-token", expiresAt: iso(shiftDays(now, 2)), createdAt: iso(now) }]
  };

  await sql`
    create table if not exists app_store (
      id text primary key,
      data jsonb not null,
      updated_at timestamptz not null default now()
    )
  `;
  await sql`
    insert into app_store (id, data, updated_at)
    values (${"default"}, ${sql.json(store)}::jsonb, now())
    on conflict (id) do update set data = excluded.data, updated_at = now()
  `;

  console.log("Hosted Postgres datastore initialized.");
  console.log("Admin: demo@nexusrentals.local / DemoPass123!");
  await sql.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
