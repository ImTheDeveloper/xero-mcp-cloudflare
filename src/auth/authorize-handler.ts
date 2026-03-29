import { buildXeroAuthorizeUrl, createInitialMcpOAuthState, parseScopeOverride } from "./oauth";
import { createPendingAuthId, putPendingOAuthRequest } from "./pending";

interface OAuthProviderBinding {
	parseAuthRequest(request: Request): Promise<unknown>;
}

interface AuthorizeEnv {
	OAUTH_PROVIDER: OAuthProviderBinding;
	AUTH_STORE: DurableObjectNamespace;
	XERO_CLIENT_ID?: string;
	WORKER_BASE_URL?: string;
	XERO_OAUTH_SCOPES?: string;
}

export async function handleAuthorizeRequest(request: Request, env: Env): Promise<Response> {
	const authEnv = env as unknown as AuthorizeEnv;
	if (!authEnv.OAUTH_PROVIDER) {
		return new Response("OAuth provider binding is unavailable.", { status: 500 });
	}

	if (!authEnv.AUTH_STORE) {
		return new Response("Auth store binding is unavailable.", { status: 500 });
	}

	if (!authEnv.XERO_CLIENT_ID) {
		return new Response("XERO_CLIENT_ID is missing from Worker secrets.", { status: 500 });
	}

	if (!authEnv.WORKER_BASE_URL) {
		return new Response("WORKER_BASE_URL is not configured in Worker environment.", { status: 500 });
	}

	if (request.method !== "GET") {
		return new Response("Method not allowed", { status: 405 });
	}

	const oauthRequest = await authEnv.OAUTH_PROVIDER.parseAuthRequest(request);
	const pendingAuthId = createPendingAuthId();
	await putPendingOAuthRequest(authEnv, pendingAuthId, {
		oauthRequest,
		createdAt: Date.now(),
	});

	const xeroState = createInitialMcpOAuthState(pendingAuthId);
	const authorizeUrl = buildXeroAuthorizeUrl({
		clientId: authEnv.XERO_CLIENT_ID,
		redirectUri: `${authEnv.WORKER_BASE_URL}/callback`,
		state: xeroState,
		scopes: parseScopeOverride(authEnv.XERO_OAUTH_SCOPES),
	});

	return Response.redirect(authorizeUrl, 302);
}
