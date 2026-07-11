import { createUIResource, type UIResource } from "@mcp-ui/server";
import type { XeroConnection } from "../../types";

/**
 * MCP-UI resources for a nicer connector experience.
 *
 * These are returned *alongside* the existing plain-text content so that clients
 * which do not implement MCP Apps / MCP-UI (they just ignore the embedded
 * resource) still get a fully functional text response. Clients that do render
 * UI resources (Claude, VS Code Copilot, Goose, Postman, ...) show the widget.
 *
 * The `mcpApps` adapter injects a bridge so the mcp-ui postMessage action
 * protocol (`window.parent.postMessage({ type: 'tool' | 'link', ... })`) is
 * translated to the MCP Apps host API.
 */

const MCP_APPS_ADAPTER = { mcpApps: { enabled: true } } as const;

/**
 * Escape a string for safe interpolation into HTML text or a double-quoted
 * attribute. All Xero-supplied values (tenant names/ids) flow through here
 * before they reach the markup.
 */
export function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

const BASE_STYLE = `
	:root { color-scheme: light dark; }
	* { box-sizing: border-box; }
	body {
		margin: 0;
		font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
		font-size: 14px;
		line-height: 1.4;
		color: #13182b;
		background: transparent;
	}
	.card {
		border: 1px solid #d8dee9;
		border-radius: 12px;
		padding: 16px;
		background: #ffffff;
		max-width: 520px;
	}
	.card h2 { margin: 0 0 4px; font-size: 15px; }
	.card p.sub { margin: 0 0 14px; color: #5b647a; font-size: 13px; }
	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		width: 100%;
		border: 1px solid #d8dee9;
		border-radius: 10px;
		padding: 10px 12px;
		margin-bottom: 8px;
		background: #fbfcfe;
		text-align: left;
		cursor: pointer;
		font: inherit;
		color: inherit;
	}
	.row:last-child { margin-bottom: 0; }
	.row:hover:not([disabled]) { border-color: #1e88e5; background: #f2f8ff; }
	.row[disabled] { cursor: default; opacity: 0.9; }
	.row .name { font-weight: 600; }
	.row .meta { color: #5b647a; font-size: 12px; margin-top: 2px; }
	.row .active {
		font-size: 11px; font-weight: 700; color: #1b8f5a;
		border: 1px solid #1b8f5a; border-radius: 999px; padding: 2px 8px; white-space: nowrap;
	}
	.btn {
		display: inline-block;
		border: none;
		border-radius: 10px;
		padding: 10px 16px;
		background: #1e88e5;
		color: #ffffff;
		font: inherit;
		font-weight: 600;
		cursor: pointer;
	}
	.btn:hover { background: #1669bb; }
	.empty { color: #5b647a; }
	@media (prefers-color-scheme: dark) {
		body { color: #e6e9f2; }
		.card { border-color: #2c3550; background: #161b2e; }
		.card p.sub, .row .meta { color: #9aa3bd; }
		.row { border-color: #2c3550; background: #1c2338; }
		.row:hover:not([disabled]) { border-color: #4f9dee; background: #22304d; }
	}
`;

function htmlDocument(body: string, script: string): string {
	return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${BASE_STYLE}</style></head><body>${body}<script>${script}</script></body></html>`;
}

/**
 * Interactive org picker. Each row posts a `switch_tenant` tool call with its
 * tenantId; the active org is rendered as a non-clickable row.
 */
export function buildTenantSwitcherResource(
	connections: XeroConnection[],
	activeTenantId: string | null,
): UIResource {
	let body: string;

	if (connections.length === 0) {
		body = `<div class="card"><h2>No Xero organizations connected</h2><p class="sub">Run <strong>add_xero_organisation</strong> to grant access, then try again.</p></div>`;
	} else {
		const rows = connections
			.map((connection) => {
				const isActive = connection.tenantId === activeTenantId;
				const name = escapeHtml(connection.tenantName);
				const type = escapeHtml(connection.tenantType);
				const id = escapeHtml(connection.tenantId);
				const activeBadge = isActive ? `<span class="active">Active</span>` : "";
				const attrs = isActive
					? `disabled aria-disabled="true"`
					: `type="button" data-tenant-id="${id}"`;
				return `<button class="row" ${attrs}><span><span class="name">${name}</span><span class="meta">${type} · ${id}</span></span>${activeBadge}</button>`;
			})
			.join("");
		body = `<div class="card"><h2>Switch Xero organization</h2><p class="sub">Select an organization to make it active for finance tools.</p>${rows}</div>`;
	}

	const script = `
		document.addEventListener('click', function (event) {
			var row = event.target.closest('.row[data-tenant-id]');
			if (!row) return;
			window.parent.postMessage({
				type: 'tool',
				payload: { toolName: 'switch_tenant', params: { tenantId: row.getAttribute('data-tenant-id') } }
			}, '*');
		});
	`;

	return createUIResource({
		uri: "ui://xero-mcp/tenants",
		content: { type: "rawHtml", htmlString: htmlDocument(body, script) },
		encoding: "text",
		adapters: MCP_APPS_ADAPTER,
	});
}

/**
 * Login / add-organisation launcher. The Xero consent screen cannot be framed
 * (X-Frame-Options), so the button emits a `link` action which the host opens
 * in a real browser tab rather than trying to render it inline.
 */
export function buildLoginCardResource(options: {
	authorizeUrl: string;
	heading?: string;
	subtitle?: string;
	buttonLabel?: string;
}): UIResource {
	const heading = escapeHtml(options.heading ?? "Connect Xero");
	const subtitle = escapeHtml(
		options.subtitle ??
			"Authorize one or more Xero organizations. This opens Xero in your browser; return here and run list_tenants when done.",
	);
	const buttonLabel = escapeHtml(options.buttonLabel ?? "Authorize with Xero");
	const url = escapeHtml(options.authorizeUrl);

	const body = `<div class="card"><h2>${heading}</h2><p class="sub">${subtitle}</p><button class="btn" type="button" data-url="${url}">${buttonLabel}</button></div>`;

	const script = `
		document.addEventListener('click', function (event) {
			var btn = event.target.closest('.btn[data-url]');
			if (!btn) return;
			window.parent.postMessage({ type: 'link', payload: { url: btn.getAttribute('data-url') } }, '*');
		});
	`;

	return createUIResource({
		uri: "ui://xero-mcp/login",
		content: { type: "rawHtml", htmlString: htmlDocument(body, script) },
		encoding: "text",
		adapters: MCP_APPS_ADAPTER,
	});
}
