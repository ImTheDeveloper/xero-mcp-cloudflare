export function formatInvoicesResult(payload: unknown): string {
	return JSON.stringify(payload, null, 2);
}
