import streamDeck, { action, type KeyDownEvent, SingletonAction, type WillAppearEvent } from "@elgato/streamdeck";

/**
 * Settings for {@link SetProfile}.
 */
export type SetProfileSettings = {
	/** Name of the OpenRGB profile to load. */
	profile?: string;
};

/**
 * Loads a configured OpenRGB profile when the key is pressed.
 */
@action({ UUID: "com.thatguyjacobee.openrgbdeck.set-profile" })
export class SetProfile extends SingletonAction<SetProfileSettings> {
	/**
	 * Placeholder until the OpenRGB client lands.
	 * @param ev The key-down event.
	 */
	public override onKeyDown(ev: KeyDownEvent<SetProfileSettings>): void {
		streamDeck.logger.info(`Set profile pressed: ${ev.payload.settings.profile ?? "(none configured)"}`);
	}

	/**
	 * Shows the configured profile on the key.
	 * @param ev The action appearance event.
	 */
	public override async onWillAppear(ev: WillAppearEvent<SetProfileSettings>): Promise<void> {
		if (!ev.action.isKey()) return;

		await ev.action.setTitle(ev.payload.settings.profile ?? "Set profile");
	}
}
