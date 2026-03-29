import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent, getMcpAuthContext } from "agents/mcp";
import { z } from "zod";
import { parseScopeOverride } from "./auth/oauth";
import { patchPrincipalAuthRecord, getPrincipalAuthRecord } from "./auth/store";
import { buildAuthStatusMessage } from "./tools/auth-status";
import {
	buildAddOrganisationResponse,
	prepareAddOrganisationAuthorization,
} from "./tools/add-xero-organisation";
import { formatInvoicesResult } from "./tools/invoices";
import { formatBalanceSheetResult } from "./tools/reports";
import { formatTenants, switchTenant } from "./tools/tenants";
import type { SessionState } from "./types";
import { DEFAULT_SESSION_STATE } from "./types";
import { XeroApiError } from "./xero/api";
import { xeroGet } from "./xero/api";
import { ensureValidAccessToken } from "./xero/token";

type TextToolResponse = {
	content: Array<{
		type: "text";
		text: string;
	}>;
};

interface SecretsEnv {
	XERO_CLIENT_ID?: string;
	XERO_CLIENT_SECRET?: string;
	TOKEN_ENCRYPTION_KEY?: string;
	XERO_OAUTH_SCOPES?: string;
	WORKER_BASE_URL?: string;
	AUTH_STORE: DurableObjectNamespace;
}

const SESSION_INACTIVITY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export class XeroMCP extends McpAgent<Cloudflare.Env, SessionState> {
	server = new McpServer({
		name: "xero-mcp",
		version: "2.2.0",
	});
	initialState = DEFAULT_SESSION_STATE;

	async init() {
		const env = this.env as SecretsEnv;

		this.server.tool("hello", async () => ({
			content: [
				{
					type: "text",
					text: "Xero MCP is online in read-only mode.",
				},
			],
		}));

		this.server.tool("add_xero_organisation", async () => {
			await this.enforceSessionTtl();
			const principalId = this.getPrincipalId();
			await this.ensurePrincipalSession(principalId);
			await this.syncSessionFromAuthStore(principalId);
			await this.touchSessionActivity();

			if (!env.XERO_CLIENT_ID) {
				return {
					content: [{ type: "text", text: "XERO_CLIENT_ID is missing from Worker secrets." }],
				};
			}

			const workerBaseUrl = this.getWorkerBaseUrl();
			const { nextState, authorizeUrl } = prepareAddOrganisationAuthorization({
				principalId,
				clientId: env.XERO_CLIENT_ID,
				workerBaseUrl,
				state: this.state,
				scopes: parseScopeOverride(env.XERO_OAUTH_SCOPES),
			});

			this.setState({
				...nextState,
				principalId,
			});

			await patchPrincipalAuthRecord(env, principalId, {
				principalId,
				oauthState: nextState.oauthState,
				oauthStateCreatedAt: nextState.oauthStateCreatedAt,
			});

			return {
				content: [{ type: "text", text: buildAddOrganisationResponse(authorizeUrl) }],
			};
		});

		this.server.tool("auth_status", async () => {
			await this.enforceSessionTtl();
			const principalId = this.getPrincipalId();
			await this.ensurePrincipalSession(principalId);
			await this.syncSessionFromAuthStore(principalId);
			await this.touchSessionActivity();
			return {
				content: [{ type: "text", text: buildAuthStatusMessage(this.state) }],
			};
		});

		this.server.tool("list_tenants", async () => {
			await this.enforceSessionTtl();
			const principalId = this.getPrincipalId();
			await this.ensurePrincipalSession(principalId);
			await this.syncSessionFromAuthStore(principalId);
			await this.touchSessionActivity();
			return {
				content: [{ type: "text", text: formatTenants(this.state.connections, this.state.activeTenantId) }],
			};
		});

		this.server.tool("switch_tenant", { tenantId: z.string().min(1) }, async ({ tenantId }) => {
			await this.enforceSessionTtl();
			const principalId = this.getPrincipalId();
			await this.ensurePrincipalSession(principalId);
			await this.syncSessionFromAuthStore(principalId);
			await this.touchSessionActivity();

			try {
				const nextState = switchTenant(this.state, tenantId);
				this.setState(nextState);
				await patchPrincipalAuthRecord(env, principalId, {
					principalId,
					activeTenantId: nextState.activeTenantId,
				});
				return {
					content: [{ type: "text", text: `Active tenant switched to ${tenantId}.` }],
				};
			} catch (cause) {
				return {
					content: [{ type: "text", text: `Failed to switch tenant: ${(cause as Error).message}` }],
				};
			}
		});

		this.server.tool(
			"list_invoices",
			{
				page: z.number().int().positive().optional(),
			},
			async ({ page }) => {
				try {
					const accessToken = await this.ensureAccessTokenForRequest();
					const tenantId = this.requireActiveTenant();
					const pageNumber = page ?? 1;
					const payload = await xeroGet(`Invoices?page=${pageNumber}`, accessToken, tenantId);
					return {
						content: [{ type: "text", text: formatInvoicesResult(payload) }],
					};
				} catch (cause) {
					return {
						content: [{ type: "text", text: `Failed to list invoices: ${(cause as Error).message}` }],
					};
				}
			},
		);

		this.server.tool(
			"get_balance_sheet",
			{
				date: z.string().optional(),
			},
			async ({ date }) => {
				try {
					const accessToken = await this.ensureAccessTokenForRequest();
					const tenantId = this.requireActiveTenant();
					const path = date
						? `Reports/BalanceSheet?date=${encodeURIComponent(date)}`
						: "Reports/BalanceSheet";
					const payload = await xeroGet(path, accessToken, tenantId);
					return {
						content: [{ type: "text", text: formatBalanceSheetResult(payload) }],
					};
				} catch (cause) {
					return {
						content: [{ type: "text", text: `Failed to get balance sheet: ${(cause as Error).message}` }],
					};
				}
			},
		);

		this.server.tool(
			"get_profit_and_loss",
			{
				fromDate: z.string().optional(),
				toDate: z.string().optional(),
			},
			async ({ fromDate, toDate }) =>
				this.readOnlyToolCall(
					this.buildPathWithQuery("Reports/ProfitAndLoss", { fromDate, toDate }),
					"Failed to get profit and loss report",
				),
		);

		this.server.tool(
			"get_trial_balance",
			{ date: z.string().optional() },
			async ({ date }) =>
				this.readOnlyToolCall(
					this.buildPathWithQuery("Reports/TrialBalance", { date }),
					"Failed to get trial balance report",
				),
		);

		this.server.tool(
			"get_executive_summary",
			{ date: z.string().optional() },
			async ({ date }) =>
				this.readOnlyToolCall(
					this.buildPathWithQuery("Reports/ExecutiveSummary", { date }),
					"Failed to get executive summary report",
				),
		);

		this.server.tool(
			"get_aged_receivables",
			{ contactId: z.string().uuid(), date: z.string().optional() },
			async ({ contactId, date }) =>
				this.readOnlyToolCall(
					this.buildPathWithQuery("Reports/AgedReceivablesByContact", { contactId, date }),
					"Failed to get aged receivables report",
				),
		);

		this.server.tool(
			"get_aged_payables",
			{ contactId: z.string().uuid(), date: z.string().optional() },
			async ({ contactId, date }) =>
				this.readOnlyToolCall(
					this.buildPathWithQuery("Reports/AgedPayablesByContact", { contactId, date }),
					"Failed to get aged payables report",
				),
		);

		this.server.tool(
			"get_budget_summary",
			{
				date: z.string().optional(),
				periods: z.number().int().positive().optional(),
				timeframe: z.string().optional(),
			},
			async ({ date, periods, timeframe }) =>
				this.readOnlyToolCall(
					this.buildPathWithQuery("Reports/BudgetSummary", { date, periods, timeframe }),
					"Failed to get budget summary report",
				),
		);

		this.server.tool("list_budgets", async () =>
			this.readOnlyToolCall("Budgets", "Failed to list budgets"),
		);

		this.server.tool("list_repeating_invoices", async () =>
			this.readOnlyToolCall("RepeatingInvoices", "Failed to list repeating invoices"),
		);

		this.server.tool(
			"list_credit_notes",
			{ page: z.number().int().positive().optional() },
			async ({ page }) => this.readOnlyToolCall(`CreditNotes?page=${page ?? 1}`, "Failed to list credit notes"),
		);

		this.server.tool("get_credit_note", { creditNoteId: z.string().uuid() }, async ({ creditNoteId }) =>
			this.readOnlyToolCall(`CreditNotes/${creditNoteId}`, "Failed to get credit note"),
		);

		this.server.tool(
			"list_purchase_orders",
			{
				page: z.number().int().positive().optional(),
				status: z.string().optional(),
				dateFrom: z.string().optional(),
				dateTo: z.string().optional(),
			},
			async ({ page, status, dateFrom, dateTo }) =>
				this.readOnlyToolCall(
					this.buildPathWithQuery("PurchaseOrders", {
						page: page ?? 1,
						status,
						dateFrom,
						dateTo,
					}),
					"Failed to list purchase orders",
				),
		);

		this.server.tool(
			"get_purchase_order",
			{ purchaseOrderId: z.string().uuid() },
			async ({ purchaseOrderId }) =>
				this.readOnlyToolCall(`PurchaseOrders/${purchaseOrderId}`, "Failed to get purchase order"),
		);

		this.server.tool(
			"list_manual_journals",
			{ page: z.number().int().positive().optional() },
			async ({ page }) =>
				this.readOnlyToolCall(`ManualJournals?page=${page ?? 1}`, "Failed to list manual journals"),
		);

		this.server.tool("list_tracking_categories", async () =>
			this.readOnlyToolCall("TrackingCategories", "Failed to list tracking categories"),
		);

		this.server.tool("list_tax_rates", async () =>
			this.readOnlyToolCall("TaxRates", "Failed to list tax rates"),
		);

		this.server.tool("list_items", async () => this.readOnlyToolCall("Items", "Failed to list items"));

		this.server.tool(
			"list_receipts",
			{ page: z.number().int().positive().optional() },
			async ({ page }) => this.readOnlyToolCall(`Receipts?page=${page ?? 1}`, "Failed to list receipts"),
		);

		this.server.tool(
			"list_expense_claims",
			{ page: z.number().int().positive().optional() },
			async ({ page }) =>
				this.readOnlyToolCall(`ExpenseClaims?page=${page ?? 1}`, "Failed to list expense claims"),
		);


		this.server.tool(
			"list_contacts",
			{ page: z.number().int().positive().optional() },
			async ({ page }) => this.readOnlyToolCall(`Contacts?page=${page ?? 1}`, "Failed to list contacts"),
		);

		this.server.tool(
			"list_bank_transactions",
			{ page: z.number().int().positive().optional() },
			async ({ page }) =>
				this.readOnlyToolCall(`BankTransactions?page=${page ?? 1}`, "Failed to list bank transactions"),
		);

		this.server.tool(
			"list_quotes",
			{ page: z.number().int().positive().optional() },
			async ({ page }) => this.readOnlyToolCall(`Quotes?page=${page ?? 1}`, "Failed to list quotes"),
		);

		this.server.tool(
			"list_payments",
			{ page: z.number().int().positive().optional() },
			async ({ page }) => this.readOnlyToolCall(`Payments?page=${page ?? 1}`, "Failed to list payments"),
		);

		this.server.tool(
			"list_journals",
			{ offset: z.number().int().nonnegative().optional() },
			async ({ offset }) =>
				this.readOnlyToolCall(`Journals?offset=${offset ?? 0}`, "Failed to list journals"),
		);

		this.server.tool("list_organisations", async () =>
			this.readOnlyToolCall("Organisation", "Failed to list organisations"),
		);

		this.server.tool("list_accounts", async () =>
			this.readOnlyToolCall("Accounts", "Failed to list accounts"),
		);

		this.server.tool("get_invoice", { invoiceId: z.string().uuid() }, async ({ invoiceId }) =>
			this.readOnlyToolCall(`Invoices/${invoiceId}`, "Failed to get invoice"),
		);

		this.server.tool(
			"get_bank_transaction",
			{ bankTransactionId: z.string().uuid() },
			async ({ bankTransactionId }) =>
				this.readOnlyToolCall(`BankTransactions/${bankTransactionId}`, "Failed to get bank transaction"),
		);
	}

	private getWorkerBaseUrl(): string {
		const env = this.env as SecretsEnv;

		if (!env.WORKER_BASE_URL) {
			throw new Error("WORKER_BASE_URL is not configured in Worker environment.");
		}

		return env.WORKER_BASE_URL;
	}

	private async ensureAccessTokenForRequest(): Promise<string> {
		await this.enforceSessionTtl();
		const principalId = this.getPrincipalId();
		await this.ensurePrincipalSession(principalId);
		await this.syncSessionFromAuthStore(principalId);
		await this.touchSessionActivity();

		const env = this.env as SecretsEnv;
		const { accessToken, nextState } = await ensureValidAccessToken(this.state, env);
		if (nextState !== this.state) {
			this.setState(nextState);
			await patchPrincipalAuthRecord(env, principalId, {
				principalId,
				encryptedAccessToken: nextState.encryptedAccessToken,
				encryptedRefreshToken: nextState.encryptedRefreshToken,
				tokenExpiresAt: nextState.tokenExpiresAt,
			});
		}
		return accessToken;
	}

	private requireActiveTenant(): string {
		if (!this.state.activeTenantId) {
			throw new Error("No active tenant selected. Run list_tenants then switch_tenant.");
		}

		return this.state.activeTenantId;
	}

	private async readOnlyToolCall(path: string, errorPrefix: string): Promise<TextToolResponse> {
		try {
			const accessToken = await this.ensureAccessTokenForRequest();
			const tenantId = this.requireActiveTenant();
			const payload = await xeroGet(path, accessToken, tenantId);
			return this.textResponse(JSON.stringify(payload, null, 2));
		} catch (cause) {
			if (
				cause instanceof XeroApiError &&
				cause.status === 401 &&
				(path.startsWith("Receipts") || path.startsWith("ExpenseClaims"))
			) {
				return this.textResponse(
					`${errorPrefix}: Xero returned 401 for this endpoint. Receipts/Expense Claims access appears unavailable under the current app's granular OAuth model or requires additional Xero product entitlements. This is treated as a platform constraint for the POC. Raw error: ${cause.body}`,
				);
			}

			if (cause instanceof XeroApiError && cause.status === 401 && path.startsWith("Journals")) {
				return this.textResponse(
					`${errorPrefix}: Xero returned 401 for Journals. This endpoint may require additional Xero API approval/tier entitlements beyond OAuth scopes. Verify app access for the Journals API in Xero developer settings. Raw error: ${cause.body}`,
				);
			}

			if (cause instanceof XeroApiError && cause.status === 429) {
				const retryAfter = cause.rateLimit.retryAfterSeconds;
				const dayRemaining = cause.rateLimit.dayRemaining;
				const minuteRemaining = cause.rateLimit.minuteRemaining;
				return this.textResponse(
					`${errorPrefix}: Xero rate limit reached (429).${retryAfter ? ` Retry after ${retryAfter}s.` : ""} Remaining today: ${dayRemaining ?? "unknown"}, remaining this minute: ${minuteRemaining ?? "unknown"}.`,
				);
			}

			if (cause instanceof XeroApiError && cause.status === 401) {
				return this.textResponse(
					`${errorPrefix}: Xero returned 401 (insufficient scope or expired authorization). Run add_xero_organisation, approve requested scopes, then retry auth_status. Raw error: ${cause.body}`,
				);
			}
			return this.textResponse(`${errorPrefix}: ${(cause as Error).message}`);
		}
	}

	private buildPathWithQuery(
		path: string,
		query: Record<string, string | number | undefined>,
	): string {
		const params = new URLSearchParams();
		for (const [key, value] of Object.entries(query)) {
			if (value !== undefined) {
				params.set(key, String(value));
			}
		}

		const queryString = params.toString();
		if (!queryString) {
			return path;
		}

		return `${path}?${queryString}`;
	}

	private textResponse(text: string): TextToolResponse {
		return {
			content: [{ type: "text", text }],
		};
	}

	private getPrincipalId(): string {
		const auth = getMcpAuthContext() as { props?: Record<string, unknown> } | undefined;
		const authProps = auth?.props;
		const agentProps = (this.props ?? {}) as Record<string, unknown>;
		const fromAuthProps =
			typeof authProps?.sub === "string"
				? authProps.sub
				: typeof authProps?.userId === "string"
					? authProps.userId
					: null;
		const fromAgentProps =
			typeof agentProps.sub === "string"
				? agentProps.sub
				: typeof agentProps.userId === "string"
					? agentProps.userId
					: null;

		return fromAuthProps ?? fromAgentProps ?? this.state.principalId ?? `session:${this.ctx.id.toString()}`;
	}

	private async ensurePrincipalSession(principalId: string): Promise<void> {
		if (!this.state.principalId || this.state.principalId === principalId) {
			if (!this.state.principalId) {
				this.setState({
					...this.state,
					principalId,
				});
			}
			return;
		}

		this.setState({
			...DEFAULT_SESSION_STATE,
			principalId,
			lastActivityAt: this.state.lastActivityAt,
		});
	}

	private async syncSessionFromAuthStore(principalId: string): Promise<void> {
		const env = this.env as SecretsEnv;
		const record = await getPrincipalAuthRecord(env, principalId);
		if (!record) {
			return;
		}

		this.setState({
			...this.state,
			principalId,
			connections: record.connections,
			activeTenantId: record.activeTenantId,
			encryptedAccessToken: record.encryptedAccessToken,
			encryptedRefreshToken: record.encryptedRefreshToken,
			tokenExpiresAt: record.tokenExpiresAt,
			oauthState: record.oauthState,
			oauthStateCreatedAt: record.oauthStateCreatedAt,
		});
	}

	async alarm(): Promise<void> {
		await this.enforceSessionTtl();

		if (this.state.lastActivityAt) {
			await this.scheduleSessionAlarm();
		}
	}

	private async enforceSessionTtl(): Promise<void> {
		if (!this.state.lastActivityAt) {
			return;
		}

		if (Date.now() - this.state.lastActivityAt <= SESSION_INACTIVITY_TTL_MS) {
			return;
		}

		this.clearSessionState();
	}

	private clearSessionState(): void {
		this.setState({
			...DEFAULT_SESSION_STATE,
			lastActivityAt: null,
		});
	}

	private async touchSessionActivity(): Promise<void> {
		const now = Date.now();
		this.setState({
			...this.state,
			lastActivityAt: now,
		});
		await this.scheduleSessionAlarm();
	}

	private async scheduleSessionAlarm(): Promise<void> {
		await this.ctx.storage.setAlarm(Date.now() + SESSION_INACTIVITY_TTL_MS);
	}
}
