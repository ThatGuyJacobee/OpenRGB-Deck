import streamDeck, {
	action,
	type DidReceiveSettingsEvent,
	type KeyAction,
	type KeyDownEvent,
	SingletonAction,
	type WillAppearEvent,
} from "@elgato/streamdeck";

import { openRgb } from "../service";
import { profileKeyView } from "./key-view";

/**
 * Settings for {@link SetProfile}.
 */
export type SetProfileSettings = {
	/** Name of the OpenRGB profile to load. */
	profile?: string;
};

/**
 * Loads a configured OpenRGB profile when the key is pressed, and highlights
 * every key whose profile is currently active.
 */
@action({ UUID: "com.thatguyjacobee.openrgbdeck.set-profile" })
export class SetProfile extends SingletonAction<SetProfileSettings> {
	/** Actions with a profile load in flight, keyed by action id. */
	readonly #loading = new Set<string>();

	/**
	 * Creates the action and follows the shared OpenRGB connection.
	 */
	constructor() {
		super();

		openRgb.on("activeProfile", () => void this.#refreshKeys());
		openRgb.on("stateChanged", () => void this.#refreshKeys());
	}

	/**
	 * Updates the key when the selected profile changes in the inspector.
	 * @param ev The settings event.
	 */
	public override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<SetProfileSettings>): Promise<void> {
		if (!ev.action.isKey()) {
			return;
		}

		await this.#updateKey(ev.action, ev.payload.settings);
	}

	/**
	 * Loads the configured profile.
	 * @param ev The key-down event.
	 */
	public override async onKeyDown(ev: KeyDownEvent<SetProfileSettings>): Promise<void> {
		const profile = ev.payload.settings.profile?.trim();

		if (profile === undefined || profile.length === 0) {
			await ev.action.showAlert();

			return;
		}

		if (this.#loading.has(ev.action.id)) {
			return;
		}

		this.#loading.add(ev.action.id);

		try {
			await openRgb.loadProfile(profile);
			await ev.action.showOk();
		} catch (error) {
			streamDeck.logger.error(`Could not load the OpenRGB profile "${profile}": ${toMessage(error)}`);
			await ev.action.showAlert();
		} finally {
			this.#loading.delete(ev.action.id);
		}
	}

	/**
	 * Shows the configured profile on a key that appears.
	 * @param ev The action appearance event.
	 */
	public override async onWillAppear(ev: WillAppearEvent<SetProfileSettings>): Promise<void> {
		if (!ev.action.isKey()) {
			return;
		}

		await this.#updateKey(ev.action, ev.payload.settings);
	}

	/**
	 * Re-renders every visible Set Profile key.
	 */
	async #refreshKeys(): Promise<void> {
		for (const key of this.actions) {
			if (!key.isKey()) {
				continue;
			}

			try {
				await this.#updateKey(key, await key.getSettings());
			} catch (error) {
				streamDeck.logger.debug(`Could not update a Set Profile key: ${toMessage(error)}`);
			}
		}
	}

	/**
	 * Sets the title and active state of one key.
	 * @param key Key to update.
	 * @param settings Settings of that key.
	 */
	async #updateKey(key: KeyAction<SetProfileSettings>, settings: SetProfileSettings): Promise<void> {
		const view = profileKeyView(settings.profile, openRgb.activeProfile, openRgb.connected);

		await key.setTitle(view.title);
		await key.setState(view.state);
	}
}

/**
 * Reads a message from an unknown thrown value.
 * @param error Thrown value.
 * @returns A human-readable description.
 */
function toMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
