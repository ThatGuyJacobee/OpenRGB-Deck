/**
 * State of the active-profile key image.
 */
export type ProfileKeyState = 0 | 1;

/**
 * What a Set Profile key should display.
 */
export interface ProfileKeyView {
	/** Title shown on the key. */
	title: string;

	/** Keypad state; 1 when the configured profile is the active one. */
	state: ProfileKeyState;
}

/**
 * Builds the key view for a configured profile.
 * @param profile Profile stored in the action settings.
 * @param activeProfile Profile the server reports as active.
 * @param connected Whether the client currently has a usable connection.
 * @returns The title and state the key should show.
 */
export function profileKeyView(
	profile: string | undefined,
	activeProfile: string | null,
	connected: boolean,
): ProfileKeyView {
	const name = profile?.trim() ?? "";

	return {
		title: name.length > 0 ? name : "Set profile",
		state: connected && name.length > 0 && name === activeProfile ? 1 : 0,
	};
}
