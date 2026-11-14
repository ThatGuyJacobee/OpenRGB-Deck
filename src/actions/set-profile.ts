import streamDeck, {
	action,
	type DidReceiveSettingsEvent,
	type KeyAction,
	type KeyDownEvent,
	type SendToPluginEvent,
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
 * Requests the property inspector can send to the plugin.
 */
type InspectorRequest = {
	/** Request identifier. */
	event?: string;

	/** Whether the request came from the refresh button. */
	isRefresh?: boolean;
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

		openRgb.on("activeProfile", () => {
			void this.#refreshKeys();
			void this.#sendStatus();
		});

		openRgb.on("profiles", () => {
			void this.#refreshKeys();
			void this.#sendProfiles();
			void this.#sendStatus();
		});

		openRgb.on("stateChanged", () => {
			void this.#refreshKeys();
			void this.#sendStatus();
		});

		openRgb.on("serverName", () => void this.#sendStatus());
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
	 * Answers the property inspector's profile list and status requests.
	 * @param ev The message from the property inspector.
	 */
	public override async onSendToPlugin(ev: SendToPluginEvent<InspectorRequest, SetProfileSettings>): Promise<void> {
		if (typeof ev.payload !== "object" || ev.payload === null) {
			return;
		}

		if (ev.payload.event === "getProfiles") {
			if (ev.payload.isRefresh === true && openRgb.connected) {
				try {
					await openRgb.listProfiles();
				} catch (error) {
					streamDeck.logger.warn(`Could not refresh the OpenRGB profile list: ${toMessage(error)}`);
				}
			}

			await this.#sendProfiles();
			await this.#sendStatus();

			return;
		}

		if (ev.payload.event === "getStatus") {
			await this.#sendStatus();
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

	/**
	 * Sends the profile list to the open property inspector.
	 */
	async #sendProfiles(): Promise<void> {
		try {
			await streamDeck.ui.sendToPropertyInspector({
				event: "getProfiles",
				items: openRgb.profiles.map((profile) => ({ label: profile, value: profile })),
			});
		} catch (error) {
			streamDeck.logger.debug(`Could not send the profile list to the property inspector: ${toMessage(error)}`);
		}
	}

	/**
	 * Sends the connection status to the open property inspector.
	 */
	async #sendStatus(): Promise<void> {
		try {
			await streamDeck.ui.sendToPropertyInspector({
				event: "status",
				state: openRgb.state,
				connected: openRgb.connected,
				serverName: openRgb.serverName,
				activeProfile: openRgb.activeProfile,
			});
		} catch (error) {
			streamDeck.logger.debug(`Could not send the status to the property inspector: ${toMessage(error)}`);
		}
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
