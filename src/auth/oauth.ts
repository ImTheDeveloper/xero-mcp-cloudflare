import type { OAuthStatePayload, XeroTokenResponse } from "../types";

const XERO_AUTHORIZE_URL = "https://login.xero.com/identity/connect/authorize";
const XERO_TOKEN_URL = "https://identity.xero.com/connect/token";

const DEFAULT_XERO_SCOPES = [
	"openid",
	"profile",
	"email",
	"offline_access",
	"accounting.invoices",
	"accounting.contacts",
	"accounting.settings",
	"accounting.banktransactions",
	"accounting.payments.read",
	"accounting.budgets.read",
	"accounting.manualjournals",
	"accounting.reports.balancesheet.read",
	"accounting.reports.profitandloss.read",
	"accounting.reports.trialbalance.read",
	"accounting.reports.executivesummary.read",
	"accounting.reports.aged.read",
	"accounting.reports.budgetsummary.read",
];

function toBase64Url(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
	const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
	const binary = atob(padded);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i += 1) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

export function createOAuthState(principalId: string): string {
	const payload: OAuthStatePayload = {
		kind: "add_org",
		principalId,
		nonce: crypto.randomUUID(),
	};

	const encoded = new TextEncoder().encode(JSON.stringify(payload));
	return toBase64Url(encoded);
}

export function createInitialMcpOAuthState(pendingAuthId: string): string {
	const payload: OAuthStatePayload = {
		kind: "mcp_init",
		pendingAuthId,
		nonce: crypto.randomUUID(),
	};

	const encoded = new TextEncoder().encode(JSON.stringify(payload));
	return toBase64Url(encoded);
}

export function parseOAuthState(state: string): OAuthStatePayload {
	const decoded = new TextDecoder().decode(fromBase64Url(state));
	const parsed = JSON.parse(decoded) as Partial<OAuthStatePayload>;

	if (!parsed.nonce || !parsed.kind) {
		throw new Error("Malformed OAuth state payload");
	}

	if (parsed.kind === "add_org") {
		if (!parsed.principalId) {
			throw new Error("Malformed OAuth state payload");
		}

		return {
			kind: "add_org",
			principalId: parsed.principalId,
			nonce: parsed.nonce,
		};
	}

	if (parsed.kind === "mcp_init") {
		if (!parsed.pendingAuthId) {
			throw new Error("Malformed OAuth state payload");
		}

		return {
			kind: "mcp_init",
			pendingAuthId: parsed.pendingAuthId,
			nonce: parsed.nonce,
		};
	}

	throw new Error("Malformed OAuth state payload");
}

export function getXeroScopes(): string[] {
	return [...DEFAULT_XERO_SCOPES];
}

export function parseScopeOverride(rawScopes?: string): string[] | undefined {
	if (!rawScopes) {
		return undefined;
	}

	const parsed = rawScopes
		.split(/[\s,]+/)
		.map((scope) => scope.trim())
		.filter(Boolean);

	return parsed.length > 0 ? parsed : undefined;
}

export function buildXeroAuthorizeUrl(options: {
	clientId: string;
	redirectUri: string;
	state: string;
	scopes?: string[];
}): string {
	const params = new URLSearchParams({
		response_type: "code",
		client_id: options.clientId,
		redirect_uri: options.redirectUri,
		scope: (options.scopes ?? getXeroScopes()).join(" "),
		state: options.state,
	});

	return `${XERO_AUTHORIZE_URL}?${params.toString()}`;
}

export async function exchangeAuthorizationCode(params: {
	code: string;
	redirectUri: string;
	clientId: string;
	clientSecret: string;
}): Promise<XeroTokenResponse> {
	const response = await fetch(XERO_TOKEN_URL, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			grant_type: "authorization_code",
			code: params.code,
			redirect_uri: params.redirectUri,
			client_id: params.clientId,
			client_secret: params.clientSecret,
		}),
	});

	if (!response.ok) {
		throw new Error(`Xero token exchange failed (${response.status}): ${await response.text()}`);
	}

	return (await response.json()) as XeroTokenResponse;
}
