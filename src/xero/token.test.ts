import { afterEach, describe, expect, it, vi } from "vitest";
import { encryptToken } from "../auth/crypto";
import { DEFAULT_SESSION_STATE } from "../types";
import { ensureValidAccessToken } from "./token";

describe("ensureValidAccessToken", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("returns existing token when still valid", async () => {
		const encryptionKey = "secret";
		const state = {
			...DEFAULT_SESSION_STATE,
			encryptedAccessToken: await encryptToken("access-token", encryptionKey),
			encryptedRefreshToken: await encryptToken("refresh-token", encryptionKey),
			tokenExpiresAt: Date.now() + 15 * 60 * 1000,
		};

		const fetchSpy = vi.spyOn(globalThis, "fetch");
		const result = await ensureValidAccessToken(state, {
			TOKEN_ENCRYPTION_KEY: encryptionKey,
			XERO_CLIENT_ID: "id",
			XERO_CLIENT_SECRET: "secret",
		});

		expect(result.accessToken).toBe("access-token");
		expect(result.nextState).toBe(state);
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("refreshes token when expired", async () => {
		const encryptionKey = "secret";
		const state = {
			...DEFAULT_SESSION_STATE,
			encryptedAccessToken: await encryptToken("old-access", encryptionKey),
			encryptedRefreshToken: await encryptToken("old-refresh", encryptionKey),
			tokenExpiresAt: Date.now() - 1,
		};

		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(
				JSON.stringify({
					access_token: "new-access",
					refresh_token: "new-refresh",
					expires_in: 1800,
					token_type: "Bearer",
				}),
				{ status: 200, headers: { "content-type": "application/json" } },
			),
		);

		const result = await ensureValidAccessToken(state, {
			TOKEN_ENCRYPTION_KEY: encryptionKey,
			XERO_CLIENT_ID: "id",
			XERO_CLIENT_SECRET: "secret",
		});

		expect(result.accessToken).toBe("new-access");
		expect(result.nextState).not.toBe(state);
		expect(result.nextState.encryptedRefreshToken).not.toBe(state.encryptedRefreshToken);
	});
});
