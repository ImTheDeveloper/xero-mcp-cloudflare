import type { XeroConnection } from "../types";

interface XeroConnectionResponse {
	id: string;
	tenantId: string;
	tenantName: string;
	tenantType: string;
	updatedDateUtc?: string;
}

export interface XeroRateLimitInfo {
	dayRemaining: string | null;
	minuteRemaining: string | null;
	retryAfterSeconds: string | null;
}

function getRateLimitInfo(headers: Headers): XeroRateLimitInfo {
	return {
		dayRemaining: headers.get("x-rate-limit-remaining"),
		minuteRemaining: headers.get("x-minlimit-remaining"),
		retryAfterSeconds: headers.get("retry-after"),
	};
}

function logXeroResponse(path: string, status: number, rateLimit: XeroRateLimitInfo) {
	console.log(
		JSON.stringify({
			event: "xero_api_response",
			path,
			status,
			rate_limit_day_remaining: rateLimit.dayRemaining,
			rate_limit_minute_remaining: rateLimit.minuteRemaining,
			retry_after_seconds: rateLimit.retryAfterSeconds,
		}),
	);
}

export class XeroApiError extends Error {
	status: number;
	body: string;
	headers: Headers;
	rateLimit: XeroRateLimitInfo;

	constructor(status: number, body: string, headers: Headers) {
		super(`Xero API request failed (${status}): ${body}`);
		this.name = "XeroApiError";
		this.status = status;
		this.body = body;
		this.headers = headers;
		this.rateLimit = getRateLimitInfo(headers);
	}
}

export async function xeroGet(path: string, accessToken: string, tenantId: string): Promise<unknown> {
	const response = await fetch(`https://api.xero.com/api.xro/2.0/${path}`, {
		headers: {
			Authorization: `Bearer ${accessToken}`,
			"xero-tenant-id": tenantId,
			Accept: "application/json",
		},
	});

	if (!response.ok) {
		logXeroResponse(path, response.status, getRateLimitInfo(response.headers));
		throw new XeroApiError(response.status, await response.text(), response.headers);
	}

	logXeroResponse(path, response.status, getRateLimitInfo(response.headers));

	return response.json();
}

export async function xeroPost(
	path: string,
	accessToken: string,
	tenantId: string,
	body: unknown,
): Promise<unknown> {
	const response = await fetch(`https://api.xero.com/api.xro/2.0/${path}`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${accessToken}`,
			"xero-tenant-id": tenantId,
			Accept: "application/json",
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
	});

	if (!response.ok) {
		logXeroResponse(path, response.status, getRateLimitInfo(response.headers));
		throw new XeroApiError(response.status, await response.text(), response.headers);
	}

	logXeroResponse(path, response.status, getRateLimitInfo(response.headers));

	return response.json();
}

export async function xeroPut(
	path: string,
	accessToken: string,
	tenantId: string,
	body: unknown,
): Promise<unknown> {
	const response = await fetch(`https://api.xero.com/api.xro/2.0/${path}`, {
		method: "PUT",
		headers: {
			Authorization: `Bearer ${accessToken}`,
			"xero-tenant-id": tenantId,
			Accept: "application/json",
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
	});

	if (!response.ok) {
		logXeroResponse(path, response.status, getRateLimitInfo(response.headers));
		throw new XeroApiError(response.status, await response.text(), response.headers);
	}

	logXeroResponse(path, response.status, getRateLimitInfo(response.headers));

	return response.json();
}

export async function fetchXeroConnections(accessToken: string): Promise<XeroConnection[]> {
	const response = await fetch("https://api.xero.com/connections", {
		headers: {
			Authorization: `Bearer ${accessToken}`,
			Accept: "application/json",
		},
	});

	if (!response.ok) {
		throw new Error(`Failed to fetch Xero connections (${response.status}): ${await response.text()}`);
	}

	const data = (await response.json()) as XeroConnectionResponse[];
	return data.map((item) => ({
		tenantId: item.tenantId,
		tenantName: item.tenantName,
		tenantType: item.tenantType,
		connectionId: item.id,
		lastSeenAt: item.updatedDateUtc ?? new Date().toISOString(),
	}));
}
