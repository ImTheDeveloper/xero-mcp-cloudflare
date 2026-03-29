import { describe, expect, it } from "vitest";
import {
	buildXeroAuthorizeUrl,
	createInitialMcpOAuthState,
	createOAuthState,
	parseOAuthState,
	parseScopeOverride,
} from "./oauth";

describe("oauth helpers", () => {
	it("encodes and decodes add-org state payload", () => {
		const state = createOAuthState("user-123");
		const parsed = parseOAuthState(state);

		expect(parsed.kind).toBe("add_org");
		if (parsed.kind !== "add_org") {
			throw new Error("unexpected state kind");
		}
		expect(parsed.principalId).toBe("user-123");
		expect(parsed.nonce.length).toBeGreaterThan(10);
	});

	it("encodes and decodes initial mcp state payload", () => {
		const state = createInitialMcpOAuthState("pending-abc");
		const parsed = parseOAuthState(state);

		expect(parsed.kind).toBe("mcp_init");
		if (parsed.kind !== "mcp_init") {
			throw new Error("unexpected state kind");
		}
		expect(parsed.pendingAuthId).toBe("pending-abc");
		expect(parsed.nonce.length).toBeGreaterThan(10);
	});

	it("builds authorize URL with required params", () => {
		const url = new URL(
			buildXeroAuthorizeUrl({
				clientId: "client-id",
				redirectUri: "https://example.com/callback",
				state: "state-token",
			}),
		);

		expect(url.hostname).toBe("login.xero.com");
		expect(url.searchParams.get("client_id")).toBe("client-id");
		expect(url.searchParams.get("redirect_uri")).toBe("https://example.com/callback");
		expect(url.searchParams.get("state")).toBe("state-token");
	});

	it("parses scope override from comma or space separated values", () => {
		expect(parseScopeOverride("scope.a,scope.b scope.c")).toEqual([
			"scope.a",
			"scope.b",
			"scope.c",
		]);
		expect(parseScopeOverride(undefined)).toBeUndefined();
	});
});
