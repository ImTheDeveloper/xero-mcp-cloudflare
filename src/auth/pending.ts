export interface PendingOAuthRequestRecord {
	oauthRequest: unknown;
	createdAt: number;
}

interface PendingAuthEnv {
	AUTH_STORE: DurableObjectNamespace;
}

interface CreatePendingRecordBody {
	record: PendingOAuthRequestRecord;
}

function getPendingAuthStoreStub(env: PendingAuthEnv, pendingAuthId: string): DurableObjectStub {
	return env.AUTH_STORE.get(env.AUTH_STORE.idFromName(`pending:${pendingAuthId}`));
}

export function createPendingAuthId(): string {
	return crypto.randomUUID();
}

export async function putPendingOAuthRequest(
	env: PendingAuthEnv,
	pendingAuthId: string,
	record: PendingOAuthRequestRecord,
): Promise<void> {
	const stub = getPendingAuthStoreStub(env, pendingAuthId);
	const response = await stub.fetch("https://auth-store/pending", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ record } satisfies CreatePendingRecordBody),
	});

	if (!response.ok) {
		throw new Error(`Failed to save pending auth request (${response.status})`);
	}
}

export async function consumePendingOAuthRequest(
	env: PendingAuthEnv,
	pendingAuthId: string,
): Promise<PendingOAuthRequestRecord | null> {
	const stub = getPendingAuthStoreStub(env, pendingAuthId);
	const response = await stub.fetch("https://auth-store/consume", {
		method: "POST",
	});

	if (!response.ok) {
		throw new Error(`Failed to consume pending auth request (${response.status})`);
	}

	return (await response.json()) as PendingOAuthRequestRecord | null;
}
