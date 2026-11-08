import streamDeck, { action, type KeyDownEvent, SingletonAction, type WillAppearEvent } from "@elgato/streamdeck";

/**
 * Shows the active OpenRGB profile and loads the next one when pressed.
 */
@action({ UUID: "com.thatguyjacobee.openrgbdeck.profile" })
export class ProfileStatus extends SingletonAction {
	/**
	 * Placeholder until the OpenRGB client lands.
	 * @param ev The key-down event.
	 */
	public override onKeyDown(ev: KeyDownEvent): void {
		streamDeck.logger.info(`Profile status pressed: ${ev.action.id}`);
	}

	/**
	 * Placeholder title until the OpenRGB client lands.
	 * @param ev The action appearance event.
	 */
	public override async onWillAppear(ev: WillAppearEvent): Promise<void> {
		if (!ev.action.isKey()) return;

		await ev.action.setTitle("OpenRGB");
	}
}
