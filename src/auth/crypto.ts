interface EncryptedEnvelopeV1 {
	v: 1;
	alg: "AES-GCM";
	iv: string;
	ciphertext: string;
}

function toBase64(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
	const binary = atob(value);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i += 1) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

async function importKey(rawKey: string): Promise<CryptoKey> {
	const keyBytes = new TextEncoder().encode(rawKey);
	const hash = await crypto.subtle.digest("SHA-256", keyBytes);
	return crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptToken(value: string, secret: string): Promise<string> {
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const key = await importKey(secret);
	const plaintext = new TextEncoder().encode(value);

	const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
	const payload: EncryptedEnvelopeV1 = {
		v: 1,
		alg: "AES-GCM",
		iv: toBase64(iv),
		ciphertext: toBase64(new Uint8Array(encrypted)),
	};

	return JSON.stringify(payload);
}

export async function decryptToken(payload: string, secret: string): Promise<string> {
	const parsed = JSON.parse(payload) as Partial<EncryptedEnvelopeV1>;
	if (parsed.v !== 1 || parsed.alg !== "AES-GCM" || !parsed.iv || !parsed.ciphertext) {
		throw new Error("Invalid encrypted payload format");
	}

	const key = await importKey(secret);
	const decrypted = await crypto.subtle.decrypt(
		{ name: "AES-GCM", iv: fromBase64(parsed.iv) },
		key,
		fromBase64(parsed.ciphertext),
	);

	return new TextDecoder().decode(decrypted);
}
