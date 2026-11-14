import streamDeck, {
	action,
	type DidReceiveSettingsEvent,
	type KeyAction,
	type KeyDownEvent,
	type SendToPluginEvent,
	SingletonAction,
	type WillAppearEvent,
} from "@elgato/streamdeck";

import { errorMessage } from "../errors";
import { openRgb } from "../service";
import { sendInspectorStatus } from "./inspector-status";
import { colourHex, DEFAULT_RGB, parseColour, swatchSvg } from "./set-colour-view";

/**
 * Settings for {@link SetColour}.
 */
export type SetColourSettings = {
	/** Colour as a six-digit hex string, with or without the leading hash. */
	colour?: string;
};

/**
 * Requests the property inspector can send to the plugin.
 */
type InspectorRequest = {
	/** Request identifier. */
	event?: string;
};

/**
 * Sets every LED of every OpenRGB controller to a fixed colour.
 */
@action({ UUID: "com.thatguyjacobee.openrgbdeck.set-colour" })
export class SetColour extends SingletonAction<SetColourSettings> {
	/** Actions with a colour update in flight, keyed by action id. */
	readonly #loading = new Set<string>();

	/**
	 * Updates the swatch when the selected colour changes in the inspector.
	 * @param ev The settings event.
	 */
	public override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<SetColourSettings>): Promise<void> {
		if (!ev.action.isKey()) {
			return;
		}

		await this.#updateKey(ev.action, ev.payload.settings);
	}

	/**
	 * Applies the configured colour to every controller.
	 * @param ev The key-down event.
	 */
	public override async onKeyDown(ev: KeyDownEvent<SetColourSettings>): Promise<void> {
		const stored = ev.payload.settings.colour;
		const colour = stored === undefined ? DEFAULT_RGB : parseColour(stored);

		if (colour === null) {
			await ev.action.showAlert();

			return;
		}

		const controllers = openRgb.controllers;

		if (!openRgb.connected || controllers.length === 0) {
			await ev.action.showAlert();

			return;
		}

		if (this.#loading.has(ev.action.id)) {
			return;
		}

		this.#loading.add(ev.action.id);

		try {
			const results = await Promise.allSettled(
				controllers.map((controller) => openRgb.setControllerColour(controller.id, colour)),
			);
			const failures = results.flatMap((result, index) => {
				const controller = controllers[index];

				return result.status === "rejected" && controller !== undefined
					? [{ controller, reason: result.reason as unknown }]
					: [];
			});

			for (const failure of failures) {
				streamDeck.logger.error(
					`Could not set ${colourHex(colour)} on "${failure.controller.displayName || failure.controller.name}": ` +
						errorMessage(failure.reason),
				);
			}

			if (failures.length > 0) {
				await ev.action.showAlert();
			}
		} finally {
			this.#loading.delete(ev.action.id);
		}
	}

	/**
	 * Answers the property inspector's status request.
	 * @param ev The message from the property inspector.
	 */
	public override async onSendToPlugin(ev: SendToPluginEvent<InspectorRequest, SetColourSettings>): Promise<void> {
		if (typeof ev.payload !== "object" || ev.payload === null) {
			return;
		}

		if (ev.payload.event === "getStatus") {
			await sendInspectorStatus();
		}
	}

	/**
	 * Draws the configured colour on keys that appear.
	 * @param ev The action appearance event.
	 */
	public override async onWillAppear(ev: WillAppearEvent<SetColourSettings>): Promise<void> {
		if (!ev.action.isKey()) {
			return;
		}

		await this.#updateKey(ev.action, ev.payload.settings);
	}

	/**
	 * Sets the swatch and clears the title of one key.
	 * @param key Key to update.
	 * @param settings Settings of that key.
	 */
	async #updateKey(key: KeyAction<SetColourSettings>, settings: SetColourSettings): Promise<void> {
		const colour = parseColour(settings.colour) ?? DEFAULT_RGB;

		await key.setTitle("");
		await key.setImage(swatchSvg(colour));
	}
}
