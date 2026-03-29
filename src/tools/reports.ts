export function formatBalanceSheetResult(payload: unknown): string {
	return JSON.stringify(payload, null, 2);
}
