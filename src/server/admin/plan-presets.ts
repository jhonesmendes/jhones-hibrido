export type LicenseType = "trial" | "starter" | "business" | "enterprise";

export const PLAN_LIMITS: Record<
  LicenseType,
  {
    maxOfficialNumbers: number;
    maxWebNumbers: number;
    maxDepartments: number;
    maxAdmins: number;
    maxAgents: number;
    hideOwner: boolean;
  }
> = {
  trial: { maxOfficialNumbers: 1, maxWebNumbers: 1, maxDepartments: 1, maxAdmins: 1, maxAgents: 3, hideOwner: false },
  starter: { maxOfficialNumbers: 1, maxWebNumbers: 1, maxDepartments: 1, maxAdmins: 1, maxAgents: 3, hideOwner: true },
  business: { maxOfficialNumbers: 3, maxWebNumbers: 3, maxDepartments: 3, maxAdmins: 3, maxAgents: 10, hideOwner: true },
  enterprise: { maxOfficialNumbers: 9999, maxWebNumbers: 9999, maxDepartments: 9999, maxAdmins: 9999, maxAgents: 9999, hideOwner: false },
};

export const PLAN_LABEL: Record<LicenseType, string> = {
  trial: "Trial",
  starter: "Starter",
  business: "Business",
  enterprise: "Enterprise",
};
