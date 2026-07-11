import { describe, expect, it } from "vitest";
import { buildLoginCardResource, buildTenantSwitcherResource, escapeHtml } from "./resources";
import type { XeroConnection } from "../../types";

function connection(overrides: Partial<XeroConnection> = {}): XeroConnection {
	return {
		tenantId: "tenant-a",
		tenantName: "Demo Co",
		tenantType: "ORGANISATION",
		connectionId: "connection-a",
		lastSeenAt: "2026-01-01T00:00:00.000Z",
		...overrides,
	};
}

function html(resource: ReturnType<typeof buildTenantSwitcherResource>): string {
	const inner = resource.resource;
	if (!("text" in inner) || typeof inner.text !== "string") {
		throw new Error("expected text resource");
	}
	return inner.text;
}

describe("escapeHtml", () => {
	it("escapes markup-significant characters", () => {
		expect(escapeHtml(`<script>"&'`)).toBe("&lt;script&gt;&quot;&amp;&#39;");
	});
});

describe("buildTenantSwitcherResource", () => {
	it("emits a UI resource content block with the ui:// scheme", () => {
		const resource = buildTenantSwitcherResource([connection()], "tenant-a");
		expect(resource.type).toBe("resource");
		expect(resource.resource.uri).toBe("ui://xero-mcp/tenants");
	});

	it("marks the active tenant and makes only non-active rows switchable", () => {
		const markup = html(
			buildTenantSwitcherResource(
				[
					connection({ tenantId: "tenant-a", tenantName: "Active Co" }),
					connection({ tenantId: "tenant-b", tenantName: "Other Co" }),
				],
				"tenant-a",
			),
		);

		// Active row is disabled and carries the badge; it must not be clickable.
		expect(markup).toContain("Active</span>");
		expect(markup).not.toContain(`data-tenant-id="tenant-a"`);
		// Inactive row is switchable.
		expect(markup).toContain(`data-tenant-id="tenant-b"`);
		// The click handler dispatches the switch_tenant tool action.
		expect(markup).toContain("toolName: 'switch_tenant'");
	});

	it("escapes tenant-supplied strings to prevent HTML injection", () => {
		const markup = html(
			buildTenantSwitcherResource(
				[connection({ tenantId: "t1", tenantName: `<img src=x onerror=alert(1)>` })],
				null,
			),
		);
		expect(markup).not.toContain("<img src=x");
		expect(markup).toContain("&lt;img src=x onerror=alert(1)&gt;");
	});

	it("renders a guidance card when no organizations are connected", () => {
		const markup = html(buildTenantSwitcherResource([], null));
		expect(markup).toContain("No Xero organizations connected");
		expect(markup).not.toContain(`data-tenant-id="`);
	});
});

describe("buildLoginCardResource", () => {
	it("emits a link action for the authorize URL (consent cannot be framed)", () => {
		const resource = buildLoginCardResource({ authorizeUrl: "https://login.xero.com/x?a=1&b=2" });
		expect(resource.resource.uri).toBe("ui://xero-mcp/login");
		const markup = html(resource);
		expect(markup).toContain("type: 'link'");
		// URL is escaped inside the data attribute.
		expect(markup).toContain(`data-url="https://login.xero.com/x?a=1&amp;b=2"`);
		expect(markup).not.toContain(`data-url="https://login.xero.com/x?a=1&b=2"`);
	});
});
