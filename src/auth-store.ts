import type { PrincipalAuthRecord } from "./auth/store";
import type { PendingOAuthRequestRecord } from "./auth/pending";

interface PatchRecordBody {
	patch: Partial<PrincipalAuthRecord>;
}

interface CreatePendingRecordBody {
	record: PendingOAuthRequestRecord;
}

function pickPatchedValue<T extends keyof PrincipalAuthRecord>(
	patch: Partial<PrincipalAuthRecord>,
	current: PrincipalAuthRecord | undefined,
	key: T,
	fallback: PrincipalAuthRecord[T],
): PrincipalAuthRecord[T] {
	if (Object.prototype.hasOwnProperty.call(patch, key)) {
		return patch[key] as PrincipalAuthRecord[T];
	}

	if (current) {
		return current[key];
	}

	return fallback;
}

export class AuthStore {
	constructor(private readonly state: DurableObjectState) {}

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === "/record" && request.method === "GET") {
			const record = await this.state.storage.get<PrincipalAuthRecord>("record");
			return Response.json(record ?? null);
		}

		if (url.pathname === "/record" && request.method === "POST") {
			const body = (await request.json()) as PatchRecordBody;
			const current = await this.state.storage.get<PrincipalAuthRecord>("record");
			const next: PrincipalAuthRecord = {
				principalId: pickPatchedValue(body.patch, current, "principalId", ""),
				connections: pickPatchedValue(body.patch, current, "connections", []),
				activeTenantId: pickPatchedValue(body.patch, current, "activeTenantId", null),
				encryptedAccessToken: pickPatchedValue(
					body.patch,
					current,
					"encryptedAccessToken",
					null,
				),
				encryptedRefreshToken: pickPatchedValue(
					body.patch,
					current,
					"encryptedRefreshToken",
					null,
				),
				tokenExpiresAt: pickPatchedValue(body.patch, current, "tokenExpiresAt", null),
				oauthState: pickPatchedValue(body.patch, current, "oauthState", null),
				oauthStateCreatedAt: pickPatchedValue(body.patch, current, "oauthStateCreatedAt", null),
				updatedAt: Date.now(),
			};

			if (!next.principalId) {
				return new Response("principalId is required", { status: 400 });
			}

			await this.state.storage.put("record", next);
			return Response.json(next);
		}

		if (url.pathname === "/pending" && request.method === "POST") {
			const body = (await request.json()) as CreatePendingRecordBody;
			if (!body.record || !body.record.createdAt) {
				return new Response("record is required", { status: 400 });
			}

			await this.state.storage.put("pending", body.record);
			return new Response(null, { status: 204 });
		}

		if (url.pathname === "/consume" && request.method === "POST") {
			const current = await this.state.storage.get<PendingOAuthRequestRecord>("pending");
			if (current) {
				await this.state.storage.delete("pending");
			}
			return Response.json(current ?? null);
		}

		return new Response("Not found", { status: 404 });
	}
}
