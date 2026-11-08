import streamDeck, { action, type KeyDownEvent, SingletonAction, type WillAppearEvent } from "@elgato/streamdeck";

/**
 * Settings for {@link SetColour}.
 */
export type SetColourSettings = {
	/** Unique IDs of the OpenRGB controllers to recolour. */
	deviceIds?: number[];

	/** Colour as a six-digit hex string, without the leading hash. */
	colour?: string;
};

/**
 * Sets every LED of the selected OpenRGB devices to a fixed colour.
 */
@action({ UUID: "com.thatguyjacobee.openrgbdeck.set-colour" })
export class SetColour extends SingletonAction<SetColourSettings> {
	/**
	 * Placeholder until the OpenRGB client lands.
	 * @param ev The key-down event.
	 */
	public override onKeyDown(ev: KeyDownEvent<SetColourSettings>): void {
		const { colour, deviceIds } = ev.payload.settings;

		streamDeck.logger.info(`Set colour pressed: #${colour ?? "(none)"} on ${deviceIds?.length ?? 0} device(s)`);
	}

	/**
	 * Placeholder title until the OpenRGB client lands.
	 * @param ev The action appearance event.
	 */
	public override async onWillAppear(ev: WillAppearEvent<SetColourSettings>): Promise<void> {
		if (!ev.action.isKey()) return;

		await ev.action.setTitle(ev.payload.settings.colour ? `#${ev.payload.settings.colour}` : "Set colour");
	}
}
