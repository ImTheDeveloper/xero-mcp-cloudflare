import type { SessionState } from "../types";

export interface PrincipalAuthRecord {
	principalId: string;
	connections: SessionState["connections"];
	activeTenantId: SessionState["activeTenantId"];
	encryptedAccessToken: SessionState["encryptedAccessToken"];
	encryptedRefreshToken: SessionState["encryptedRefreshToken"];
	tokenExpiresAt: SessionState["tokenExpiresAt"];
	oauthState: SessionState["oauthState"];
	oauthStateCreatedAt: SessionState["oauthStateCreatedAt"];
	updatedAt: number;
}

interface AuthStoreEnv {
	AUTH_STORE: DurableObjectNamespace;
}

interface PatchRecordBody {
	patch: Partial<PrincipalAuthRecord>;
}

function getAuthStoreStub(env: AuthStoreEnv, principalId: string): DurableObjectStub {
	return env.AUTH_STORE.get(env.AUTH_STORE.idFromName(principalId));
}

export async function getPrincipalAuthRecord(
	env: AuthStoreEnv,
	principalId: string,
): Promise<PrincipalAuthRecord | null> {
	const stub = getAuthStoreStub(env, principalId);
	const response = await stub.fetch("https://auth-store/record", { method: "GET" });

	if (!response.ok) {
		throw new Error(`Failed to load auth record (${response.status})`);
	}

	return (await response.json()) as PrincipalAuthRecord | null;
}

export async function patchPrincipalAuthRecord(
	env: AuthStoreEnv,
	principalId: string,
	patch: Partial<PrincipalAuthRecord>,
): Promise<PrincipalAuthRecord> {
	const stub = getAuthStoreStub(env, principalId);
	const response = await stub.fetch("https://auth-store/record", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ patch } satisfies PatchRecordBody),
	});

	if (!response.ok) {
		throw new Error(`Failed to update auth record (${response.status})`);
	}

	return (await response.json()) as PrincipalAuthRecord;
}
