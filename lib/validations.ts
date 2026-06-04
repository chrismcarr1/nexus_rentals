import { z } from "zod";

const optionalMoney = z.preprocess(
  (value) => (value === "" || value == null ? undefined : value),
  z.coerce.number().min(0).optional()
);

export const signupSchema = z
  .object({
    businessName: z.string().min(2),
    role: z.enum(["MANAGER", "TENANT"]),
    firstName: z.string().min(2),
    lastName: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(8),
    confirmPassword: z.string().min(8),
    phone: z.string().optional()
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"]
  });

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

export const requestResetSchema = z.object({
  email: z.string().email()
});

export const resetPasswordSchema = z
  .object({
    token: z.string().min(20),
    password: z.string().min(8),
    confirmPassword: z.string().min(8)
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"]
  });

export const propertySchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  amenities: z.string().optional(),
  notes: z.string().optional(),
  managerId: z.string().optional()
});

export const unitSchema = z.object({
  propertyId: z.string().min(1),
  unitNumber: z.string().min(1),
  nickname: z.string().optional(),
  unitType: z.string().min(2),
  bedrooms: z.coerce.number().min(0),
  bathrooms: z.coerce.number().min(0.5),
  squareFeet: z.coerce.number().optional(),
  monthlyRent: z.coerce.number().min(0),
  depositAmount: z.coerce.number().min(0),
  occupancyStatus: z.enum(["OCCUPIED", "VACANT", "NOTICE", "TURNOVER"]),
  leaseStatus: z.enum(["ACTIVE", "UPCOMING", "EXPIRED", "TERMINATED"]),
  amenities: z.string().optional(),
  notes: z.string().optional()
});

export const tenantSchema = z.object({
  firstName: z.string().min(2),
  lastName: z.string().min(2),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  employer: z.string().optional(),
  emergencyName: z.string().optional(),
  emergencyPhone: z.string().optional(),
  notes: z.string().optional()
});

export const leaseSchema = z.object({
  unitId: z.string().min(1),
  tenantId: z.string().min(1),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  monthlyRent: z.coerce.number().min(0),
  dueDay: z.coerce.number().min(1).max(28),
  securityDeposit: z.coerce.number().min(0),
  recurringCharges: z.string().optional(),
  lateFeePolicy: z.string().optional(),
  notes: z.string().optional(),
  documentPath: z.string().optional(),
  status: z.enum(["ACTIVE", "UPCOMING", "EXPIRED", "TERMINATED"])
});

export const newMoveInSchema = z
  .object({
    propertyId: z.string().min(1),
    unitId: z.string().min(1),
    tenantFirstName: z.string().min(2),
    tenantLastName: z.string().min(2),
    tenantEmail: z.string().email(),
    tenantPhone: z.string().optional(),
    employer: z.string().optional(),
    emergencyName: z.string().optional(),
    emergencyPhone: z.string().optional(),
    startDate: z.string().min(1),
    endDate: z.string().min(1),
    moveInDate: z.string().min(1),
    monthlyRent: z.coerce.number().min(1),
    securityDeposit: z.coerce.number().min(0),
    dueDay: z.coerce.number().min(1).max(28),
    firstRentDueDate: z.string().min(1),
    securityDepositDueDate: z.string().min(1),
    createFirstRentCharge: z.boolean(),
    createSecurityDepositCharge: z.boolean(),
    additionalChargeDescription: z.string().optional(),
    additionalChargeAmount: optionalMoney,
    additionalChargeDueDate: z.string().optional(),
    recurringCharges: z.string().optional(),
    lateFeePolicy: z.string().optional(),
    notes: z.string().optional(),
    sendInvite: z.boolean(),
    applicationSubmissionId: z.string().optional()
  })
  .superRefine((value, context) => {
    const start = new Date(value.startDate);
    const end = new Date(value.endDate);
    const moveIn = new Date(value.moveInDate);
    const firstRentDue = new Date(value.firstRentDueDate);
    const depositDue = new Date(value.securityDepositDueDate);
    const additionalDue = value.additionalChargeDueDate ? new Date(value.additionalChargeDueDate) : null;

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
      context.addIssue({ code: "custom", path: ["endDate"], message: "End date must be after the start date." });
    }
    if (Number.isNaN(moveIn.getTime()) || moveIn < start || moveIn > end) {
      context.addIssue({ code: "custom", path: ["moveInDate"], message: "Move-in date must be within the lease term." });
    }
    if (Number.isNaN(firstRentDue.getTime())) {
      context.addIssue({ code: "custom", path: ["firstRentDueDate"], message: "First rent due date is required." });
    }
    if (Number.isNaN(depositDue.getTime())) {
      context.addIssue({ code: "custom", path: ["securityDepositDueDate"], message: "Deposit due date is required." });
    }
    if ((value.additionalChargeAmount ?? 0) > 0 && !value.additionalChargeDescription?.trim()) {
      context.addIssue({ code: "custom", path: ["additionalChargeDescription"], message: "Name the additional charge." });
    }
    if (additionalDue && Number.isNaN(additionalDue.getTime())) {
      context.addIssue({ code: "custom", path: ["additionalChargeDueDate"], message: "Additional charge due date is invalid." });
    }
  });

export const rentalApplicationSchema = z
  .object({
    title: z.string().min(3),
    propertyId: z.string().min(1),
    unitId: z.string().optional(),
    monthlyRent: z.coerce.number().min(0),
    securityDeposit: z.coerce.number().min(0),
    availableMoveInDate: z.string().min(1),
    applicationFee: z.coerce.number().min(0),
    requiredFields: z.array(z.string()).max(12),
    requiredDocuments: z.array(z.string().min(2)).max(12),
    screeningQuestions: z.array(z.string().min(2)).max(12),
    allowCoApplicants: z.boolean(),
    allowPets: z.boolean(),
    publishNow: z.boolean()
  })
  .superRefine((value, context) => {
    if (Number.isNaN(new Date(value.availableMoveInDate).getTime())) {
      context.addIssue({ code: "custom", path: ["availableMoveInDate"], message: "Available move-in date is invalid." });
    }
  });

export const applicationSubmissionSchema = z.object({
  publicSlug: z.string().min(12),
  firstName: z.string().min(2),
  lastName: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional(),
  dateOfBirth: z.string().optional(),
  currentAddress: z.string().optional(),
  monthlyIncome: optionalMoney,
  employment: z.string().optional(),
  rentalHistory: z.string().optional(),
  references: z.string().optional(),
  pets: z.string().optional(),
  vehicles: z.string().optional(),
  coApplicantFirstName: z.string().optional(),
  coApplicantLastName: z.string().optional(),
  coApplicantEmail: z.string().email().optional().or(z.literal("")),
  coApplicantPhone: z.string().optional(),
  documentNotes: z.string().optional(),
  authorizationAccepted: z.boolean(),
  questionAnswers: z.array(z.object({ questionId: z.string(), prompt: z.string(), answer: z.string() })).max(12)
});

export const paymentSchema = z.object({
  unitId: z.string().min(1),
  leaseId: z.string().optional(),
  description: z.string().min(2),
  amount: z.coerce.number().min(0),
  dueDate: z.string().min(1),
  paidDate: z.string().optional(),
  status: z.enum(["PENDING", "PAID", "PARTIAL", "LATE"]),
  lateFeeAmount: z.coerce.number().optional(),
  balanceDue: z.coerce.number().optional(),
  categoryTag: z.string().optional()
});

export const expenseSchema = z.object({
  propertyId: z.string().min(1),
  unitId: z.string().optional(),
  title: z.string().min(2),
  description: z.string().optional(),
  amount: z.coerce.number().min(0),
  incurredAt: z.string().min(1),
  category: z.enum(["MAINTENANCE", "REPAIR", "UTILITIES", "INSURANCE", "TAX", "CLEANING", "MARKETING", "OTHER"]),
  tags: z.string().optional(),
  vendor: z.string().optional()
});

export const maintenanceSchema = z.object({
  propertyId: z.string().min(1),
  unitId: z.string().optional(),
  title: z.string().min(2),
  description: z.string().min(4),
  category: z.string().optional(),
  location: z.string().optional(),
  issueStartedAt: z.string().optional(),
  entryPermission: z.enum(["PERMISSION_GRANTED", "REQUEST_APPROVAL", "EMERGENCY_ONLY"]).optional(),
  accessNotes: z.string().optional(),
  contactPreference: z.enum(["APP", "PHONE", "EMAIL", "TEXT"]).optional(),
  contactName: z.string().optional(),
  contactPhone: z.string().optional(),
  preferredWindow: z.string().optional(),
  safetyConcern: z.enum(["NO", "YES", "UNSURE"]).optional(),
  petsOnSite: z.enum(["NO", "YES", "UNKNOWN"]).optional(),
  imagePaths: z.array(z.string()).max(3).optional(),
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]),
  estimatedCost: z.coerce.number().optional(),
  actualCost: z.coerce.number().optional(),
  assignedTo: z.string().optional(),
  timeline: z.string().optional()
});

export const settingsSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional()
});

export const damageAssessmentSchema = z.object({
  unitId: z.string().min(1),
  leaseId: z.string().optional(),
  inspectionDate: z.string().min(1),
  notes: z.string().optional(),
  imagePaths: z.array(z.string()).min(1).max(12),
  baselinePaths: z.array(z.string()).max(12).optional()
});
