import { OAuthProvider } from "@cloudflare/workers-oauth-provider";
import { XeroMCP } from "./agent";
import { AuthStore } from "./auth-store";
import { handleAuthorizeRequest } from "./auth/authorize-handler";
import { handleOAuthCallback } from "./auth/callback";

const defaultHandler = {
	async fetch(request: Request, env: unknown): Promise<Response> {
		const workerEnv = env as Env;
		const url = new URL(request.url);

		if (url.pathname === "/authorize") {
			return handleAuthorizeRequest(request, workerEnv);
		}

		if (url.pathname === "/callback") {
			return handleOAuthCallback(request, workerEnv);
		}

		if (url.pathname === "/health") {
			return new Response("ok", { status: 200 });
		}

		return new Response("Not found", { status: 404 });
	},
};

export default new OAuthProvider({
	apiRoute: "/mcp",
	apiHandler: XeroMCP.serve("/mcp"),
	defaultHandler,
	authorizeEndpoint: "/authorize",
	tokenEndpoint: "/oauth/token",
	clientRegistrationEndpoint: "/oauth/register",
});

export { XeroMCP, AuthStore };
