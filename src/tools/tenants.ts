import type { SessionState, XeroConnection } from "../types";

export function formatTenants(connections: XeroConnection[], activeTenantId: string | null): string {
	if (connections.length === 0) {
		return "No authorized Xero organizations found. Run add_xero_organisation to grant access.";
	}

	return connections
		.map((connection) => {
			const active = connection.tenantId === activeTenantId ? " (active)" : "";
			return `- ${connection.tenantName} [${connection.tenantId}]${active}`;
		})
		.join("\n");
}

export function switchTenant(state: SessionState, tenantId: string): SessionState {
	const connection = state.connections.find((item) => item.tenantId === tenantId);
	if (!connection) {
		throw new Error(`Tenant ${tenantId} is not available for this session`);
	}

	return {
		...state,
		activeTenantId: connection.tenantId,
	};
}
