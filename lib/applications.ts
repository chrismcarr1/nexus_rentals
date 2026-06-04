import "server-only";

import { formatUnitAddress } from "@/lib/address";
import type {
  AppStore,
  ApplicationApplicant,
  ApplicationDocument,
  ApplicationNote,
  ApplicationQuestion,
  ApplicationSubmission,
  RentalApplication,
  RentalApplicationStatus,
  User
} from "@/lib/store";

export const applicationStatusLabels: Record<RentalApplicationStatus, string> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under Review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
  CONVERTED_TO_LEASE: "Converted to Lease"
};

export function applicationStatusTone(status: RentalApplicationStatus): "default" | "success" | "warning" | "danger" {
  if (status === "APPROVED" || status === "CONVERTED_TO_LEASE" || status === "PUBLISHED") return "success";
  if (status === "SUBMITTED" || status === "UNDER_REVIEW" || status === "DRAFT") return "warning";
  if (status === "REJECTED" || status === "WITHDRAWN") return "danger";
  return "default";
}

export function feeStatusLabel(status: string) {
  if (status === "NOT_REQUIRED") return "No fee";
  if (status === "UNPAID") return "Unpaid";
  if (status === "PAID") return "Paid";
  if (status === "WAIVED") return "Waived";
  return status;
}

export function managerOwnsApplication(store: AppStore, user: User, application: RentalApplication) {
  if (application.managerUserId !== user.id || application.organizationId !== user.organizationId) return false;
  const property = store.properties.find((item) => item.id === application.propertyId);
  return Boolean(property && property.managerId === user.id);
}

export function getApplicationProperty(store: AppStore, application: RentalApplication) {
  return store.properties.find((property) => property.id === application.propertyId) ?? null;
}

export function getApplicationUnit(store: AppStore, application: RentalApplication) {
  return application.unitId ? store.units.find((unit) => unit.id === application.unitId) ?? null : null;
}

export function getApplicationLocationLabel(store: AppStore, application: RentalApplication) {
  const property = getApplicationProperty(store, application);
  const unit = getApplicationUnit(store, application);
  if (!property) return "Property unavailable";
  return unit ? `${property.name} - Unit ${unit.unitNumber}` : property.name;
}

export function getApplicationAddressLabel(store: AppStore, application: RentalApplication) {
  const property = getApplicationProperty(store, application);
  if (!property) return "Address unavailable";
  return formatUnitAddress(property, getApplicationUnit(store, application));
}

export function getApplicationBundle(store: AppStore, applicationId: string) {
  const application = store.rentalApplications.find((item) => item.id === applicationId) ?? null;
  if (!application) return null;
  const questions = store.applicationQuestions
    .filter((question) => question.applicationId === application.id)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const requiredDocuments = store.applicationDocuments
    .filter((document) => document.applicationId === application.id && !document.submissionId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const submissions = store.applicationSubmissions
    .filter((submission) => submission.applicationId === application.id)
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  return { application, questions, requiredDocuments, submissions };
}

export function getSubmissionBundle(store: AppStore, submissionId: string) {
  const submission = store.applicationSubmissions.find((item) => item.id === submissionId) ?? null;
  if (!submission) return null;
  const application = store.rentalApplications.find((item) => item.id === submission.applicationId) ?? null;
  if (!application) return null;
  const applicants = store.applicationApplicants.filter((applicant) => applicant.submissionId === submission.id);
  const documents = store.applicationDocuments.filter((document) => document.submissionId === submission.id);
  const notes = store.applicationNotes
    .filter((note) => note.submissionId === submission.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { application, submission, applicants, documents, notes };
}

export function primaryApplicant(applicants: ApplicationApplicant[]) {
  return applicants.find((applicant) => applicant.type === "PRIMARY") ?? applicants[0] ?? null;
}

export function publicApplicationPath(application: Pick<RentalApplication, "publicSlug">) {
  return `/apply/${application.publicSlug}`;
}

export type ApplicationManagerRow = {
  application: RentalApplication;
  questions: ApplicationQuestion[];
  requiredDocuments: ApplicationDocument[];
  submissions: ApplicationSubmission[];
  latestApplicant: ApplicationApplicant | null;
  latestNote: ApplicationNote | null;
};
