import { decryptToken, encryptToken } from "../auth/crypto";
import type { SessionState, XeroTokenResponse } from "../types";

const REFRESH_BUFFER_MS = 5 * 60 * 1000;

interface TokenEnv {
	XERO_CLIENT_ID?: string;
	XERO_CLIENT_SECRET?: string;
	TOKEN_ENCRYPTION_KEY?: string;
}

export async function ensureValidAccessToken(
	state: SessionState,
	env: TokenEnv,
): Promise<{ accessToken: string; nextState: SessionState }> {
	if (!env.TOKEN_ENCRYPTION_KEY) {
		throw new Error("TOKEN_ENCRYPTION_KEY is not configured");
	}

	if (
		state.encryptedAccessToken &&
		state.tokenExpiresAt &&
		Date.now() < state.tokenExpiresAt - REFRESH_BUFFER_MS
	) {
		return {
			accessToken: await decryptToken(state.encryptedAccessToken, env.TOKEN_ENCRYPTION_KEY),
			nextState: state,
		};
	}

	if (!state.encryptedRefreshToken) {
		throw new Error("No refresh token found. Reconnect the MCP connector or run add_xero_organisation.");
	}

	if (!env.XERO_CLIENT_ID || !env.XERO_CLIENT_SECRET) {
		throw new Error("Missing XERO_CLIENT_ID or XERO_CLIENT_SECRET");
	}

	const refreshToken = await decryptToken(state.encryptedRefreshToken, env.TOKEN_ENCRYPTION_KEY);
	const response = await fetch("https://identity.xero.com/connect/token", {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			grant_type: "refresh_token",
			refresh_token: refreshToken,
			client_id: env.XERO_CLIENT_ID,
			client_secret: env.XERO_CLIENT_SECRET,
		}),
	});

	if (!response.ok) {
		throw new Error(`Xero token refresh failed (${response.status}): ${await response.text()}`);
	}

	const refreshed = (await response.json()) as XeroTokenResponse;
	const nextState: SessionState = {
		...state,
		encryptedAccessToken: await encryptToken(refreshed.access_token, env.TOKEN_ENCRYPTION_KEY),
		encryptedRefreshToken: await encryptToken(refreshed.refresh_token, env.TOKEN_ENCRYPTION_KEY),
		tokenExpiresAt: Date.now() + refreshed.expires_in * 1000,
	};

	return {
		accessToken: refreshed.access_token,
		nextState,
	};
}
