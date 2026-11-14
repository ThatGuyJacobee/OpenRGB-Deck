/**
 * Reads a message from an unknown thrown value.
 * @param error Thrown value.
 * @returns A human-readable description.
 */
export function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
