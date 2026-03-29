import { buildXeroAuthorizeUrl, createOAuthState } from "../auth/oauth";
import type { SessionState } from "../types";

export function buildAddOrganisationResponse(url: string): string {
	return [
		`Open this link to authorize additional Xero organizations: ${url}`,
		"After completing authorization in the browser, return here and run list_tenants.",
	].join("\n\n");
}

export function prepareAddOrganisationAuthorization(options: {
	principalId: string;
	clientId: string;
	workerBaseUrl: string;
	state: SessionState;
	scopes?: string[];
}): { nextState: SessionState; authorizeUrl: string } {
	const oauthState = createOAuthState(options.principalId);
	const redirectUri = `${options.workerBaseUrl}/callback`;
	const authorizeUrl = buildXeroAuthorizeUrl({
		clientId: options.clientId,
		redirectUri,
		state: oauthState,
		scopes: options.scopes,
	});

	return {
		nextState: {
			...options.state,
			oauthState,
			oauthStateCreatedAt: Date.now(),
		},
		authorizeUrl,
	};
}
