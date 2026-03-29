import { describe, expect, it } from "vitest";
import { parseJsonInput, wrapListBody } from "./json-input";

describe("json input helpers", () => {
	it("parses valid JSON", () => {
		expect(parseJsonInput('{"a":1}')).toEqual({ a: 1 });
	});

	it("throws for invalid JSON", () => {
		expect(() => parseJsonInput("{bad-json}"))
			.toThrow("Invalid JSON payload");
	});

	it("wraps arrays with collection key", () => {
		expect(wrapListBody("Contacts", [{ Name: "Demo" }])).toEqual({
			Contacts: [{ Name: "Demo" }],
		});
	});

	it("returns object body as-is", () => {
		expect(wrapListBody("Contacts", { Contacts: [] })).toEqual({ Contacts: [] });
	});
});
