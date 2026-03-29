import { afterEach, describe, expect, it, vi } from "vitest";
import { xeroGet, xeroPost } from "./api";

describe("xero api helpers", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("throws with response body for failed GET", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("forbidden", { status: 403 }));

		await expect(xeroGet("Invoices", "token", "tenant")).rejects.toThrow(
			"Xero API request failed (403): forbidden",
		);
	});

	it("throws with response body for failed POST", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("bad request", { status: 400 }));

		await expect(xeroPost("Contacts", "token", "tenant", { Contacts: [] })).rejects.toThrow("400");
	});
});
