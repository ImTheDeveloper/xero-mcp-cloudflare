import { describe, expect, it } from "vitest";
import { switchTenant } from "./tenants";
import { DEFAULT_SESSION_STATE } from "../types";

describe("switchTenant", () => {
	it("sets active tenant when tenant exists", () => {
		const state = {
			...DEFAULT_SESSION_STATE,
			connections: [
				{
					tenantId: "tenant-a",
					tenantName: "Demo Co",
					tenantType: "ORGANISATION",
					connectionId: "connection-a",
					lastSeenAt: new Date().toISOString(),
				},
			],
		};

		const next = switchTenant(state, "tenant-a");
		expect(next.activeTenantId).toBe("tenant-a");
	});

	it("throws when tenant does not exist", () => {
		const state = { ...DEFAULT_SESSION_STATE, connections: [] };
		expect(() => switchTenant(state, "missing")).toThrow("not available");
	});
});
