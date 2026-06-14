import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  getSql: vi.fn()
}));

let store: any;

vi.mock("../lib/database", () => ({
  getAppStoreBackend: () => "local-json",
  getSql: mocks.getSql
}));

vi.mock("../lib/store", () => ({
  readStore: async () => store,
  updateStore: async (updater: (current: any) => any) => {
    store = await updater(store);
    return store;
  }
}));

describe("screening repository local JSON mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store = {
      screeningApplications: [],
      screeningRequests: [],
      screeningResults: [],
      checkrCandidates: [],
      checkrReports: [],
      plaidVerifications: [],
      screeningWebhookEvents: []
    };
  });

  it("persists screening workflow records without touching Postgres", async () => {
    const repository = await import("../lib/screening/repository");
    const application = await repository.upsertScreeningApplication({
      id: "screening_1",
      sourceApplicationId: "application_1",
      submissionId: "submission_1",
      applicantEmail: "resident@example.com",
      applicantFirstName: "Casey",
      applicantLastName: "Resident",
      propertyId: "property_1",
      landlordUserId: "manager_1",
      organizationId: "org_1",
      monthlyRent: 1800,
      statedMonthlyIncome: 6000,
      status: "SUBMITTED"
    });
    const request = await repository.createScreeningRequest({
      application,
      provider: "CHECKR",
      screeningKind: "background_check"
    });

    await repository.saveCheckrCandidate({
      applicationId: application.id,
      requestId: request.id,
      candidateId: "mock_candidate",
      invitationUrl: "https://example.test/invitation"
    });

    expect(await repository.getScreeningApplication("submission_1")).toMatchObject({
      id: "screening_1",
      consentStatus: "PENDING"
    });
    expect(await repository.listScreeningRequests(application.id)).toHaveLength(1);
    expect(await repository.getCheckrCandidate(application.id)).toMatchObject({
      provider_candidate_id: "mock_candidate",
      invitation_url: "https://example.test/invitation"
    });
    expect(mocks.getSql).not.toHaveBeenCalled();
  });

  it("stores and resolves applicant access tokens locally", async () => {
    const repository = await import("../lib/screening/repository");
    await repository.upsertScreeningApplication({
      id: "screening_1",
      sourceApplicationId: "application_1",
      submissionId: "submission_1",
      applicantEmail: "resident@example.com",
      applicantFirstName: "Casey",
      applicantLastName: "Resident",
      propertyId: "property_1",
      landlordUserId: "manager_1",
      organizationId: "org_1",
      monthlyRent: 1800,
      status: "SUBMITTED"
    });

    const { token } = await repository.rotateApplicantAccess("screening_1");

    expect(await repository.findApplicationByAccessToken(token)).toMatchObject({
      id: "screening_1"
    });
    expect(mocks.getSql).not.toHaveBeenCalled();
  });
});
