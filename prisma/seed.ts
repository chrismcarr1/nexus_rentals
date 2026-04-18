import { AssessmentSeverity, ExpenseCategory, FileKind, LeaseStatus, MaintenancePriority, MaintenanceStatus, PaymentStatus, PropertyStatus, UnitOccupancyStatus, UserRole } from "@prisma/client";
import { addDays, addMonths, subDays, subMonths } from "date-fns";

import { db } from "../lib/db";
import { hashPassword } from "../lib/password";

async function main() {
  await db.passwordResetToken.deleteMany();
  await db.notification.deleteMany();
  await db.uploadedFile.deleteMany();
  await db.damageAssessment.deleteMany();
  await db.inspection.deleteMany();
  await db.maintenanceRequest.deleteMany();
  await db.payment.deleteMany();
  await db.expense.deleteMany();
  await db.leaseTenant.deleteMany();
  await db.lease.deleteMany();
  await db.tenant.deleteMany();
  await db.unit.deleteMany();
  await db.property.deleteMany();
  await db.user.deleteMany();
  await db.organization.deleteMany();

  const organization = await db.organization.create({
    data: {
      name: "Northstar Residential Group",
      email: "contact@northstar.local",
      phone: "(415) 555-0190",
      mailingAddress: "240 Valencia Street, Suite 500, San Francisco, CA 94103",
      logoPath: "/demo/logo-mark.svg"
    }
  });

  const adminPassword = await hashPassword("DemoPass123!");
  const managerPassword = await hashPassword("ManagerPass123!");
  const tenantPassword = await hashPassword("TenantPass123!");

  const [admin, manager, tenantUser] = await Promise.all([
    db.user.create({
      data: {
        organizationId: organization.id,
        email: "demo@northstar.local",
        passwordHash: adminPassword,
        firstName: "Avery",
        lastName: "Stone",
        role: UserRole.ADMIN,
        title: "Principal Operator",
        phone: "(415) 555-0132"
      }
    }),
    db.user.create({
      data: {
        organizationId: organization.id,
        email: "manager@northstar.local",
        passwordHash: managerPassword,
        firstName: "Jordan",
        lastName: "Lee",
        role: UserRole.MANAGER,
        title: "Property Manager",
        phone: "(415) 555-0177"
      }
    }),
    db.user.create({
      data: {
        organizationId: organization.id,
        email: "tenant@northstar.local",
        passwordHash: tenantPassword,
        firstName: "Sam",
        lastName: "Carter",
        role: UserRole.TENANT,
        title: "Resident"
      }
    })
  ]);

  const propertyData = [
    {
      name: "Harbor Point Residences",
      addressLine1: "880 Mission Bay Blvd",
      city: "San Francisco",
      state: "CA",
      postalCode: "94158",
      description: "A mixed-use mid-rise asset with renovated interiors and strong waterfront demand.",
      amenities: "Fitness studio, secure package room, rooftop lounge, EV charging",
      notes: "Premium Class A demo property with high occupancy.",
      units: [
        { unitNumber: "3A", nickname: "Bay View", unitType: "Apartment", bedrooms: 2, bathrooms: 2, squareFeet: 1040, monthlyRent: 4250, depositAmount: 4250, occupancyStatus: UnitOccupancyStatus.OCCUPIED, leaseStatus: LeaseStatus.ACTIVE, amenities: "Water view, balcony, quartz kitchen", image: "/demo/unit-b.svg" },
        { unitNumber: "5C", nickname: "Skyline Loft", unitType: "Loft", bedrooms: 1, bathrooms: 1, squareFeet: 780, monthlyRent: 3395, depositAmount: 3200, occupancyStatus: UnitOccupancyStatus.NOTICE, leaseStatus: LeaseStatus.ACTIVE, amenities: "Double-height windows, smart lock", image: "/demo/unit-c.svg" },
        { unitNumber: "2B", nickname: "Garden Studio", unitType: "Studio", bedrooms: 0, bathrooms: 1, squareFeet: 520, monthlyRent: 2595, depositAmount: 2500, occupancyStatus: UnitOccupancyStatus.VACANT, leaseStatus: LeaseStatus.UPCOMING, amenities: "Courtyard access, in-unit laundry", image: "/demo/unit-a.svg" }
      ]
    },
    {
      name: "Maple Terrace Townhomes",
      addressLine1: "1416 Maple Terrace",
      city: "Oakland",
      state: "CA",
      postalCode: "94612",
      description: "Townhome cluster with stable long-term residents and lower turnover.",
      amenities: "Private garages, dog run, community patio",
      notes: "Strong family occupancy, maintenance-heavy landscaping.",
      units: [
        { unitNumber: "12", nickname: "Endcap Townhome", unitType: "Townhome", bedrooms: 3, bathrooms: 2.5, squareFeet: 1460, monthlyRent: 3895, depositAmount: 3800, occupancyStatus: UnitOccupancyStatus.OCCUPIED, leaseStatus: LeaseStatus.ACTIVE, amenities: "Private garage, fenced patio", image: "/demo/unit-d.svg" },
        { unitNumber: "15", nickname: "Corner Renovation", unitType: "Townhome", bedrooms: 2, bathrooms: 2, squareFeet: 1220, monthlyRent: 3495, depositAmount: 3400, occupancyStatus: UnitOccupancyStatus.TURNOVER, leaseStatus: LeaseStatus.EXPIRED, amenities: "Updated flooring, townhouse entry", image: "/demo/unit-e.svg" }
      ]
    },
    {
      name: "Cedar Heights Flats",
      addressLine1: "522 Cedar Street",
      city: "Berkeley",
      state: "CA",
      postalCode: "94709",
      description: "Small-format student and graduate housing with high lease velocity.",
      amenities: "Bike storage, parcel lockers, study lounge",
      notes: "Targeted to graduate students and faculty.",
      units: [
        { unitNumber: "1D", nickname: "Courtyard Flat", unitType: "Apartment", bedrooms: 1, bathrooms: 1, squareFeet: 640, monthlyRent: 2795, depositAmount: 2700, occupancyStatus: UnitOccupancyStatus.OCCUPIED, leaseStatus: LeaseStatus.ACTIVE, amenities: "Courtyard-facing, built-ins", image: "/demo/unit-f.svg" },
        { unitNumber: "4A", nickname: "Top Floor", unitType: "Apartment", bedrooms: 2, bathrooms: 1, squareFeet: 890, monthlyRent: 3150, depositAmount: 3000, occupancyStatus: UnitOccupancyStatus.OCCUPIED, leaseStatus: LeaseStatus.UPCOMING, amenities: "Top floor, skylight, storage niche", image: "/demo/unit-g.svg" }
      ]
    }
  ];

  const createdProperties = [];
  for (const propertyEntry of propertyData) {
    const property = await db.property.create({
      data: {
        organizationId: organization.id,
        name: propertyEntry.name,
        addressLine1: propertyEntry.addressLine1,
        city: propertyEntry.city,
        state: propertyEntry.state,
        postalCode: propertyEntry.postalCode,
        status: PropertyStatus.ACTIVE,
        description: propertyEntry.description,
        amenities: propertyEntry.amenities,
        notes: propertyEntry.notes,
        files: {
          create: [
            {
              kind: FileKind.PROPERTY_IMAGE,
              label: "Cover image",
              path: "/demo/property-cover.svg",
              mimeType: "image/svg+xml"
            }
          ]
        },
        units: {
          create: propertyEntry.units.map((unit) => ({
            unitNumber: unit.unitNumber,
            nickname: unit.nickname,
            unitType: unit.unitType,
            bedrooms: unit.bedrooms,
            bathrooms: unit.bathrooms,
            squareFeet: unit.squareFeet,
            monthlyRent: unit.monthlyRent,
            depositAmount: unit.depositAmount,
            occupancyStatus: unit.occupancyStatus,
            leaseStatus: unit.leaseStatus,
            amenities: unit.amenities,
            files: {
              create: [
                {
                  kind: FileKind.UNIT_IMAGE,
                  label: "Unit hero",
                  path: unit.image,
                  mimeType: "image/svg+xml"
                },
                {
                  kind: FileKind.MOVE_IN_IMAGE,
                  label: "Move-in baseline",
                  path: "/demo/baseline.svg",
                  mimeType: "image/svg+xml"
                }
              ]
            }
          }))
        }
      },
      include: { units: true }
    });
    createdProperties.push(property);
  }

  const units = await db.unit.findMany({ include: { property: true } });

  const tenants = await Promise.all([
    db.tenant.create({
      data: {
        organizationId: organization.id,
        firstName: "Sam",
        lastName: "Carter",
        email: "tenant@northstar.local",
        phone: "(510) 555-0189",
        employer: "Bayshore Labs",
        emergencyName: "Nina Carter",
        emergencyPhone: "(510) 555-0121",
        notes: "Pays via ACH, prefers text updates."
      }
    }),
    db.tenant.create({
      data: {
        organizationId: organization.id,
        firstName: "Maya",
        lastName: "Patel",
        email: "maya.patel@example.com",
        phone: "(415) 555-0171",
        employer: "Kite Health"
      }
    }),
    db.tenant.create({
      data: {
        organizationId: organization.id,
        firstName: "Luis",
        lastName: "Moreno",
        email: "luis.moreno@example.com",
        phone: "(415) 555-0147",
        employer: "Arc Transit"
      }
    }),
    db.tenant.create({
      data: {
        organizationId: organization.id,
        firstName: "Elena",
        lastName: "Kim",
        email: "elena.kim@example.com",
        phone: "(510) 555-0118",
        employer: "UC Berkeley"
      }
    })
  ]);

  const targetUnits = {
    harborOccupied: units.find((unit) => unit.unitNumber === "3A")!,
    harborNotice: units.find((unit) => unit.unitNumber === "5C")!,
    oaklandOccupied: units.find((unit) => unit.unitNumber === "12")!,
    cedarOccupied: units.find((unit) => unit.unitNumber === "1D")!,
    turnover: units.find((unit) => unit.unitNumber === "15")!
  };

  const leases = await Promise.all([
    db.lease.create({
      data: {
        unitId: targetUnits.harborOccupied.id,
        startDate: subMonths(new Date(), 8),
        endDate: addMonths(new Date(), 4),
        monthlyRent: targetUnits.harborOccupied.monthlyRent,
        dueDay: 1,
        securityDeposit: targetUnits.harborOccupied.depositAmount,
        recurringCharges: "Parking 175, Pet 50",
        lateFeePolicy: "5% of unpaid balance after day 5",
        status: LeaseStatus.ACTIVE,
        tenants: {
          create: [{ tenantId: tenants[0].id }]
        }
      }
    }),
    db.lease.create({
      data: {
        unitId: targetUnits.harborNotice.id,
        startDate: subMonths(new Date(), 12),
        endDate: addDays(new Date(), 24),
        monthlyRent: targetUnits.harborNotice.monthlyRent,
        dueDay: 1,
        securityDeposit: targetUnits.harborNotice.depositAmount,
        recurringCharges: "Storage 65",
        lateFeePolicy: "$95 fixed fee after day 4",
        status: LeaseStatus.ACTIVE,
        tenants: {
          create: [{ tenantId: tenants[1].id }]
        }
      }
    }),
    db.lease.create({
      data: {
        unitId: targetUnits.oaklandOccupied.id,
        startDate: subMonths(new Date(), 10),
        endDate: addMonths(new Date(), 2),
        monthlyRent: targetUnits.oaklandOccupied.monthlyRent,
        dueDay: 1,
        securityDeposit: targetUnits.oaklandOccupied.depositAmount,
        recurringCharges: "Trash 35",
        status: LeaseStatus.ACTIVE,
        tenants: {
          create: [{ tenantId: tenants[2].id }]
        }
      }
    }),
    db.lease.create({
      data: {
        unitId: targetUnits.cedarOccupied.id,
        startDate: subMonths(new Date(), 3),
        endDate: addMonths(new Date(), 9),
        monthlyRent: targetUnits.cedarOccupied.monthlyRent,
        dueDay: 1,
        securityDeposit: targetUnits.cedarOccupied.depositAmount,
        recurringCharges: "Internet 60",
        status: LeaseStatus.ACTIVE,
        tenants: {
          create: [{ tenantId: tenants[3].id }]
        }
      }
    }),
    db.lease.create({
      data: {
        unitId: targetUnits.turnover.id,
        startDate: subMonths(new Date(), 16),
        endDate: subDays(new Date(), 8),
        monthlyRent: targetUnits.turnover.monthlyRent,
        dueDay: 1,
        securityDeposit: targetUnits.turnover.depositAmount,
        recurringCharges: "Parking 125",
        status: LeaseStatus.EXPIRED,
        notes: "Former tenant moved out; awaiting full turn invoice."
      }
    })
  ]);

  const paymentRows = [
    { unitId: targetUnits.harborOccupied.id, leaseId: leases[0].id, description: "April rent", amount: 4250, dueDate: subDays(new Date(), 17), paidDate: subDays(new Date(), 16), status: PaymentStatus.PAID, balanceDue: 0, lateFeeAmount: 0, categoryTag: "Rent" },
    { unitId: targetUnits.harborNotice.id, leaseId: leases[1].id, description: "April rent", amount: 3395, dueDate: subDays(new Date(), 17), paidDate: null, status: PaymentStatus.LATE, balanceDue: 3490, lateFeeAmount: 95, categoryTag: "Rent" },
    { unitId: targetUnits.oaklandOccupied.id, leaseId: leases[2].id, description: "April rent", amount: 3895, dueDate: subDays(new Date(), 17), paidDate: subDays(new Date(), 15), status: PaymentStatus.PAID, balanceDue: 0, lateFeeAmount: 0, categoryTag: "Rent" },
    { unitId: targetUnits.cedarOccupied.id, leaseId: leases[3].id, description: "April rent", amount: 2795, dueDate: subDays(new Date(), 17), paidDate: subDays(new Date(), 14), status: PaymentStatus.PAID, balanceDue: 0, lateFeeAmount: 0, categoryTag: "Rent" },
    { unitId: targetUnits.turnover.id, leaseId: leases[4].id, description: "Move-out balance", amount: 680, dueDate: subDays(new Date(), 7), paidDate: null, status: PaymentStatus.PENDING, balanceDue: 680, lateFeeAmount: 0, categoryTag: "Turnover" }
  ];

  for (const row of paymentRows) {
    await db.payment.create({ data: row });
  }

  const expenseRows = [
    { propertyId: createdProperties[0].id, unitId: targetUnits.harborOccupied.id, title: "Lobby paint touch-up", description: "Common area patch and paint before investor walkthrough.", amount: 740, incurredAt: subDays(new Date(), 6), category: ExpenseCategory.REPAIR, tags: "paint,common area", vendor: "Bluebird Finishes" },
    { propertyId: createdProperties[1].id, unitId: targetUnits.turnover.id, title: "Turnover deep clean", description: "Pre-listing clean and odor treatment.", amount: 280, incurredAt: subDays(new Date(), 3), category: ExpenseCategory.CLEANING, tags: "turnover,cleaning", vendor: "Spark Crew" },
    { propertyId: createdProperties[1].id, unitId: targetUnits.oaklandOccupied.id, title: "Irrigation repair", description: "Rear planter drip line replacement.", amount: 520, incurredAt: subDays(new Date(), 12), category: ExpenseCategory.MAINTENANCE, tags: "landscape,outdoor", vendor: "West Bay Grounds" },
    { propertyId: createdProperties[2].id, unitId: targetUnits.cedarOccupied.id, title: "Water utility", description: "Monthly building water allocation.", amount: 415, incurredAt: subDays(new Date(), 10), category: ExpenseCategory.UTILITIES, tags: "utility,water", vendor: "EBMUD" }
  ];

  for (const row of expenseRows) {
    await db.expense.create({ data: row });
  }

  const maintenanceItems = await Promise.all([
    db.maintenanceRequest.create({
      data: {
        propertyId: createdProperties[1].id,
        unitId: targetUnits.turnover.id,
        title: "Door jamb repair",
        description: "Move-out inspection found cracked frame and hinge pull-out.",
        status: MaintenanceStatus.IN_PROGRESS,
        priority: MaintenancePriority.HIGH,
        estimatedCost: 650,
        assignedTo: "Bay Area Handyman Co.",
        timeline: "Created from turnover inspection; materials ordered; carpenter scheduled Friday."
      }
    }),
    db.maintenanceRequest.create({
      data: {
        propertyId: createdProperties[0].id,
        unitId: targetUnits.harborNotice.id,
        title: "Dishwasher leak review",
        description: "Tenant reported intermittent pooling under lower rack.",
        status: MaintenanceStatus.OPEN,
        priority: MaintenancePriority.MEDIUM,
        estimatedCost: 320,
        timeline: "Initial intake complete; awaiting vendor triage window."
      }
    }),
    db.maintenanceRequest.create({
      data: {
        propertyId: createdProperties[2].id,
        unitId: targetUnits.cedarOccupied.id,
        title: "Window balance replacement",
        description: "Bedroom sash drops unexpectedly and does not remain open.",
        status: MaintenanceStatus.RESOLVED,
        priority: MaintenancePriority.LOW,
        estimatedCost: 210,
        actualCost: 185,
        timeline: "Repaired by campus vendor; tenant confirmed resolution."
      }
    })
  ]);

  const inspection = await db.inspection.create({
    data: {
      unitId: targetUnits.turnover.id,
      leaseId: leases[4].id,
      inspectionDate: subDays(new Date(), 5),
      type: "Move-out",
      notes: "Flooring gouges, wall patching, and entry door frame damage observed.",
      files: {
        create: [
          { kind: FileKind.MOVE_OUT_IMAGE, label: "Move-out photo 1", path: "/demo/damage-floor.svg", mimeType: "image/svg+xml" },
          { kind: FileKind.MOVE_OUT_IMAGE, label: "Move-out photo 2", path: "/demo/damage-wall.svg", mimeType: "image/svg+xml" }
        ]
      }
    }
  });

  await db.damageAssessment.create({
    data: {
      inspectionId: inspection.id,
      createdById: manager.id,
      summary: "High-severity turnover assessment with likely flooring damage, wall damage, and door/window damage impacts.",
      damageCategories: "flooring damage, wall damage, door/window damage",
      severity: AssessmentSeverity.HIGH,
      confidenceScore: 0.88,
      estimatedLow: 1850,
      estimatedHigh: 4200,
      wearAndTear: false,
      explanation:
        "Observed issues exceed routine wear thresholds and likely require localized framing repair, patch/paint, and plank replacement in a visible traffic zone. Estimate is directional and should be validated by contractor bids.",
      recommendedNext:
        "Obtain two contractor estimates, preserve photo documentation, and reconcile against security deposit schedule before issuing the final accounting.",
      files: {
        create: [
          { kind: FileKind.DAMAGE_IMAGE, label: "Assessment image 1", path: "/demo/damage-floor.svg", mimeType: "image/svg+xml" },
          { kind: FileKind.DAMAGE_IMAGE, label: "Assessment image 2", path: "/demo/damage-wall.svg", mimeType: "image/svg+xml" }
        ]
      }
    }
  });

  await Promise.all([
    db.notification.create({
      data: {
        organizationId: organization.id,
        userId: admin.id,
        type: "RENT_OVERDUE",
        title: "1 rent payment is overdue",
        body: "Unit 5C at Harbor Point has an overdue balance of $3,490 including fees."
      }
    }),
    db.notification.create({
      data: {
        organizationId: organization.id,
        userId: manager.id,
        type: "LEASE_EXPIRING",
        title: "Lease expiring in 24 days",
        body: "Skyline Loft lease ends soon. Renewal decision is still pending."
      }
    }),
    db.notification.create({
      data: {
        organizationId: organization.id,
        type: "MAINTENANCE_OPEN",
        title: "Maintenance item still open",
        body: `${maintenanceItems[1].title} has not been scheduled with a vendor yet.`
      }
    }),
    db.notification.create({
      data: {
        organizationId: organization.id,
        type: "DAMAGE_ASSESSMENT",
        title: "New AI assessment available",
        body: "Turnover estimate for Maple Terrace unit 15 is ready for review."
      }
    })
  ]);

  await db.passwordResetToken.create({
    data: {
      userId: admin.id,
      token: "demo-reset-token",
      expiresAt: addDays(new Date(), 2)
    }
  });

  console.log("Seed complete.");
  console.log("Demo admin: demo@northstar.local / DemoPass123!");
  console.log("Demo manager: manager@northstar.local / ManagerPass123!");
  console.log("Demo tenant: tenant@northstar.local / TenantPass123!");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
