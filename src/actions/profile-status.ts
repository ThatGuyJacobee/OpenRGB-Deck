import streamDeck, { action, type KeyDownEvent, SingletonAction } from "@elgato/streamdeck";

import { errorMessage } from "../errors";
import { openRgb } from "../service";
import { nextProfile, profileStatusTitle } from "./profile-status-view";

/**
 * Shows the active OpenRGB profile and loads the next one when pressed.
 */
@action({ UUID: "com.thatguyjacobee.openrgbdeck.profile" })
export class ProfileStatus extends SingletonAction {
	/** Actions with a profile load in flight, keyed by action id. */
	readonly #loading = new Set<string>();

	/**
	 * Creates the action and follows the shared OpenRGB connection.
	 */
	constructor() {
		super();

		openRgb.on("activeProfile", () => void this.#refreshKeys());
		openRgb.on("profiles", () => void this.#refreshKeys());
		openRgb.on("stateChanged", () => void this.#refreshKeys());
	}

	/**
	 * Loads the next profile in the server list.
	 * @param ev The key-down event.
	 */
	public override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		const profile = nextProfile(openRgb.profiles, openRgb.activeProfile);

		if (!openRgb.connected || profile === null) {
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
			streamDeck.logger.error(`Could not load the next OpenRGB profile "${profile}": ${errorMessage(error)}`);
			await ev.action.showAlert();
		} finally {
			this.#loading.delete(ev.action.id);
		}
	}

	/**
	 * Shows the current profile on keys that appear.
	 */
	public override async onWillAppear(): Promise<void> {
		await this.#refreshKeys();
	}

	/**
	 * Re-renders every visible status key.
	 */
	async #refreshKeys(): Promise<void> {
		const title = this.#title();

		for (const key of this.actions) {
			if (!key.isKey()) {
				continue;
			}

			try {
				await key.setTitle(title);
			} catch (error) {
				streamDeck.logger.debug(`Could not update a Profile Status key: ${errorMessage(error)}`);
			}
		}
	}

	/**
	 * Builds the title from the shared connection state.
	 * @returns The text to show on the key.
	 */
	#title(): string {
		return profileStatusTitle(openRgb.activeProfile, openRgb.profiles.length, openRgb.connected, openRgb.state);
	}
}
