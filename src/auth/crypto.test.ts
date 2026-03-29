import { describe, expect, it } from "vitest";
import { decryptToken, encryptToken } from "./crypto";

describe("token encryption", () => {
	it("encrypts and decrypts token payloads", async () => {
		const secret = "test-secret";
		const plain = "refresh-token-value";

		const encrypted = await encryptToken(plain, secret);
		expect(encrypted).not.toContain(plain);

		const decrypted = await decryptToken(encrypted, secret);
		expect(decrypted).toBe(plain);
	});

	it("fails to decrypt with wrong key", async () => {
		const encrypted = await encryptToken("abc", "key-1");
		await expect(decryptToken(encrypted, "key-2")).rejects.toThrow();
	});
});
