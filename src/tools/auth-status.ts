import type { SessionState } from "../types";

export function buildAuthStatusMessage(state: SessionState): string {
	if (!state.encryptedAccessToken || !state.encryptedRefreshToken || !state.tokenExpiresAt) {
		return "Not authenticated yet. Reconnect the MCP connector, then run add_xero_organisation if you need to grant more organizations later.";
	}

	const tenantCount = state.connections.length;
	const tenantHint =
		tenantCount === 0
			? "No authorized organizations found yet."
			: `${tenantCount} organization${tenantCount === 1 ? "" : "s"} authorized.`;

	const activeTenantHint = state.activeTenantId
		? `Active tenant ID: ${state.activeTenantId}`
		: "No active tenant selected. Run switch_tenant.";

	return [`Authenticated with Xero.`, tenantHint, activeTenantHint].join("\n");
}
