import { exchangeAuthorizationCode, parseOAuthState } from "./oauth";
import { consumePendingOAuthRequest } from "./pending";
import { encryptToken } from "./crypto";
import { patchPrincipalAuthRecord, getPrincipalAuthRecord } from "./store";
import { fetchXeroConnections } from "../xero/api";
import type { XeroConnection, XeroTokenResponse } from "../types";

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const PENDING_AUTH_TTL_MS = 10 * 60 * 1000;

interface OAuthProviderBinding {
	completeAuthorization(options: {
		request: unknown;
		userId: string;
		metadata?: { label?: string };
		scope?: string[];
		props?: Record<string, unknown>;
	}): Promise<{ redirectTo: string }>;
}

interface CallbackEnv {
	AUTH_STORE: DurableObjectNamespace;
	OAUTH_PROVIDER: OAuthProviderBinding;
	XERO_CLIENT_ID?: string;
	XERO_CLIENT_SECRET?: string;
	TOKEN_ENCRYPTION_KEY?: string;
	WORKER_BASE_URL?: string;
}

function html(body: string): Response {
	return new Response(body, {
		status: 200,
		headers: { "content-type": "text/html; charset=utf-8" },
	});
}

function fromBase64Url(value: string): string {
	const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
	return atob(padded);
}

function decodeJwtPayload(token: string): Record<string, unknown> {
	const parts = token.split(".");
	if (parts.length < 2) {
		throw new Error("Malformed JWT");
	}

	const decoded = fromBase64Url(parts[1]);
	return JSON.parse(decoded) as Record<string, unknown>;
}

function getPrincipalIdFromIdToken(tokens: XeroTokenResponse): string {
	if (!tokens.id_token) {
		throw new Error("Xero token response did not include id_token; openid scope is required.");
	}

	const payload = decodeJwtPayload(tokens.id_token);
	const subject = payload.sub;
	if (typeof subject === "string" && subject.length > 0) {
		return subject;
	}

	const xeroUserId = payload.xero_userid;
	if (typeof xeroUserId === "string" && xeroUserId.length > 0) {
		return xeroUserId;
	}

	const email = payload.email;
	if (typeof email === "string" && email.includes("@")) {
		return email.toLowerCase();
	}

	throw new Error("Unable to extract principal identity from Xero id_token.");
}

function resolveActiveTenantId(connections: XeroConnection[], preferredTenantId: string | null): string | null {
	if (!preferredTenantId) {
		return connections[0]?.tenantId ?? null;
	}

	return (
		connections.find((connection) => connection.tenantId === preferredTenantId)?.tenantId ??
		(connections[0]?.tenantId ?? null)
	);
}

export async function handleOAuthCallback(request: Request, env: Env): Promise<Response> {
	const callbackEnv = env as unknown as CallbackEnv;
	const url = new URL(request.url);
	const state = url.searchParams.get("state");
	const code = url.searchParams.get("code");
	const error = url.searchParams.get("error");

	if (error) {
		return html(`<h1>Xero authorization failed</h1><p>${error}</p><p>You can close this tab.</p>`);
	}

	if (!state || !code) {
		return new Response("Missing required query params: state and code", { status: 400 });
	}

	if (
		!callbackEnv.XERO_CLIENT_ID ||
		!callbackEnv.XERO_CLIENT_SECRET ||
		!callbackEnv.TOKEN_ENCRYPTION_KEY ||
		!callbackEnv.WORKER_BASE_URL
	) {
		return new Response("Missing required OAuth secrets in Worker environment.", { status: 500 });
	}

	let oauthState: ReturnType<typeof parseOAuthState>;
	try {
		oauthState = parseOAuthState(state);
	} catch {
		return new Response("Invalid OAuth state", { status: 400 });
	}

	try {
		const redirectUri = `${callbackEnv.WORKER_BASE_URL}/callback`;
		const tokens = await exchangeAuthorizationCode({
			code,
			redirectUri,
			clientId: callbackEnv.XERO_CLIENT_ID,
			clientSecret: callbackEnv.XERO_CLIENT_SECRET,
		});
		const principalId = getPrincipalIdFromIdToken(tokens);
		const connections = await fetchXeroConnections(tokens.access_token);
		const current = await getPrincipalAuthRecord(callbackEnv, principalId);
		const activeTenantId = resolveActiveTenantId(connections, current?.activeTenantId ?? null);

		const encryptedAccessToken = await encryptToken(tokens.access_token, callbackEnv.TOKEN_ENCRYPTION_KEY);
		const encryptedRefreshToken = await encryptToken(
			tokens.refresh_token,
			callbackEnv.TOKEN_ENCRYPTION_KEY,
		);

		if (oauthState.kind === "mcp_init") {
			if (!callbackEnv.OAUTH_PROVIDER) {
				return new Response("OAuth provider bindings are unavailable.", { status: 500 });
			}

			const pendingAuth = await consumePendingOAuthRequest(callbackEnv, oauthState.pendingAuthId);
			if (!pendingAuth) {
				return new Response("Authorization session expired. Please reconnect from your MCP client.", {
					status: 400,
				});
			}

			if (Date.now() - pendingAuth.createdAt > PENDING_AUTH_TTL_MS) {
				return new Response("Authorization session expired. Please reconnect from your MCP client.", {
					status: 400,
				});
			}

			await patchPrincipalAuthRecord(callbackEnv, principalId, {
				principalId,
				connections,
				activeTenantId,
				encryptedAccessToken,
				encryptedRefreshToken,
				tokenExpiresAt: Date.now() + tokens.expires_in * 1000,
				oauthState: null,
				oauthStateCreatedAt: null,
			});

			const requestedScope = Array.isArray((pendingAuth.oauthRequest as { scope?: unknown }).scope)
				? ((pendingAuth.oauthRequest as { scope?: string[] }).scope ?? [])
				: undefined;

			const { redirectTo } = await callbackEnv.OAUTH_PROVIDER.completeAuthorization({
				request: pendingAuth.oauthRequest,
				userId: principalId,
				metadata: { label: "Xero MCP" },
				scope: requestedScope,
				props: {
					sub: principalId,
					userId: principalId,
				},
			});

			return Response.redirect(redirectTo, 302);
		}

		let stateOwnerRecord = current;
		let stateOwnerPrincipalId = principalId;

		if (!stateOwnerRecord?.oauthState || stateOwnerRecord.oauthState !== state) {
			const fallbackRecord = await getPrincipalAuthRecord(callbackEnv, oauthState.principalId);
			if (fallbackRecord?.oauthState === state) {
				stateOwnerRecord = fallbackRecord;
				stateOwnerPrincipalId = oauthState.principalId;
			}
		}

		if (!stateOwnerRecord?.oauthState || stateOwnerRecord.oauthState !== state) {
			return new Response("OAuth state mismatch. Please run add_xero_organisation again.", {
				status: 400,
			});
		}

		if (
			!stateOwnerRecord.oauthStateCreatedAt ||
			Date.now() - stateOwnerRecord.oauthStateCreatedAt > OAUTH_STATE_TTL_MS
		) {
			await patchPrincipalAuthRecord(callbackEnv, principalId, {
				principalId,
				oauthState: null,
				oauthStateCreatedAt: null,
			});
			if (stateOwnerPrincipalId !== principalId) {
				await patchPrincipalAuthRecord(callbackEnv, stateOwnerPrincipalId, {
					principalId: stateOwnerPrincipalId,
					oauthState: null,
					oauthStateCreatedAt: null,
				});
			}
			return new Response("OAuth session expired. Please run add_xero_organisation again.", {
				status: 400,
			});
		}

		await patchPrincipalAuthRecord(callbackEnv, principalId, {
			principalId,
			connections,
			activeTenantId,
			encryptedAccessToken,
			encryptedRefreshToken,
			tokenExpiresAt: Date.now() + tokens.expires_in * 1000,
			oauthState: null,
			oauthStateCreatedAt: null,
		});

		if (stateOwnerPrincipalId !== principalId) {
			await patchPrincipalAuthRecord(callbackEnv, stateOwnerPrincipalId, {
				principalId: stateOwnerPrincipalId,
				oauthState: null,
				oauthStateCreatedAt: null,
			});
		}

		return html(
			"<h1>Xero updated</h1><p>Authorization complete. Return to your MCP client and run list_tenants.</p><p>You can close this tab.</p>",
		);
	} catch (cause) {
		console.error("OAuth callback handling failed", cause);
		return new Response("Failed to complete OAuth callback", { status: 500 });
	}
}
