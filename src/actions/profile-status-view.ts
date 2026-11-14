import type { OpenRgbConnectionState } from "../openrgb";

/**
 * Picks the profile a cycle key should load next.
 * @param profiles Profiles in server order.
 * @param activeProfile Profile the server reports as active.
 * @returns The next profile, wrapping at the end; or null when there are none.
 */
export function nextProfile(profiles: readonly string[], activeProfile: string | null): string | null {
	if (profiles.length === 0) {
		return null;
	}

	const index = activeProfile === null ? -1 : profiles.indexOf(activeProfile);

	return profiles[(index + 1) % profiles.length] ?? null;
}

/**
 * Builds the title for the active-profile key.
 * @param activeProfile Profile the server reports as active.
 * @param profileCount Number of saved profiles.
 * @param connected Whether the client currently has a usable connection.
 * @param state Current connection state.
 * @returns The text to show on the key.
 */
export function profileStatusTitle(
	activeProfile: string | null,
	profileCount: number,
	connected: boolean,
	state: OpenRgbConnectionState,
): string {
	if (state === "failed") {
		return "OpenRGB too old";
	}

	if (!connected) {
		if (state === "connecting" || state === "handshaking" || state === "reconnecting") {
			return "Connecting…";
		}

		return "OpenRGB offline";
	}

	if (profileCount === 0) {
		return "No profiles";
	}

	if (activeProfile === null) {
		return "No profile";
	}

	return `Active:\n${activeProfile}`;
}
