import { decryptClientSecret, type AdminClientRow } from "@/server/admin/client-registry";

export type RemoteLicense = {
  id: string;
  organizationId: string;
  type: "trial" | "starter" | "business" | "enterprise";
  status: "active" | "expired" | "suspended";
  maxOfficialNumbers: number;
  maxWebNumbers: number;
  maxDepartments: number;
  maxAdmins: number;
  maxAgents: number;
  addonAgents: number;
  hideOwner: boolean;
  expiresAt: string | null;
  trialEndsAt: string | null;
  notes: string | null;
} | null;

export type RemoteUsage = {
  maxOfficialNumbers: number;
  maxWebNumbers: number;
  maxDepartments: number;
  maxAdmins: number;
  maxAgents: number;
};

export class RemoteLicenseError extends Error {}

async function callInternalApi<T>(
  client: AdminClientRow,
  path: string,
  init?: RequestInit
): Promise<T> {
  const secret = decryptClientSecret(client);
  const res = await fetch(`${client.baseUrl}${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      "x-license-control-secret": secret,
      ...(init?.body ? { "content-type": "application/json" } : {}),
    },
    signal: AbortSignal.timeout(10_000),
  }).catch((cause) => {
    throw new RemoteLicenseError(
      cause instanceof Error ? cause.message : "Falha ao contatar a instância"
    );
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new RemoteLicenseError(body?.error?.message ?? `A instância respondeu ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchRemoteLicense(
  client: AdminClientRow
): Promise<{ license: RemoteLicense; usage: RemoteUsage }> {
  return callInternalApi(client, "/api/internal/license");
}

export async function pushRemoteLicense(
  client: AdminClientRow,
  input: {
    type: "trial" | "starter" | "business" | "enterprise";
    status: "active" | "expired" | "suspended";
    maxOfficialNumbers: number;
    maxWebNumbers: number;
    maxDepartments: number;
    maxAdmins: number;
    maxAgents: number;
    addonAgents: number;
    hideOwner: boolean;
    expiresAt: string | null;
    trialEndsAt: string | null;
    notes?: string | null;
  }
): Promise<{ license: RemoteLicense }> {
  return callInternalApi(client, "/api/internal/license", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}
