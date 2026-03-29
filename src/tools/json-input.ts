export function parseJsonInput(value: string): unknown {
	try {
		return JSON.parse(value);
	} catch (cause) {
		throw new Error(`Invalid JSON payload: ${(cause as Error).message}`);
	}
}

export function wrapListBody(collectionKey: string, value: unknown): unknown {
	if (Array.isArray(value)) {
		return { [collectionKey]: value };
	}

	if (typeof value === "object" && value !== null) {
		return value;
	}

	throw new Error("Payload must be a JSON object or array.");
}
