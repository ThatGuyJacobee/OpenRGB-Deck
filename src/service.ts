import streamDeck from "@elgato/streamdeck";

import { parseConnectionSettings } from "./connection-settings";
import { errorMessage } from "./errors";
import { OpenRgbClient, type OpenRgbLogger } from "./openrgb";

/**
 * Logger that forwards OpenRGB diagnostics to the Stream Deck log.
 */
const logger: OpenRgbLogger = {
	debug: (message, ...args) => streamDeck.logger.debug(message, ...args),
	info: (message, ...args) => streamDeck.logger.info(message, ...args),
	warn: (message, ...args) => streamDeck.logger.warn(message, ...args),
	error: (message, ...args) => streamDeck.logger.error(message, ...args),
};

/**
 * Connection to OpenRGB shared by every action.
 */
export const openRgb = new OpenRgbClient({ logger });

// The client emits transport errors; without a listener Node would treat them as unhandled.
openRgb.on("error", (error) => streamDeck.logger.error(`OpenRGB error (${error.code}): ${error.message}`));

/**
 * Starts the shared connection, retrying in the background until it succeeds.
 */
export function startOpenRgb(): void {
	openRgb.start();
}

/**
 * Applies the connection settings saved in Stream Deck's global settings.
 */
export async function loadConnectionSettings(): Promise<void> {
	try {
		const settings = await streamDeck.settings.getGlobalSettings();
		const result = parseConnectionSettings(settings);

		if (!result.ok) {
			streamDeck.logger.warn(`Ignoring the saved OpenRGB connection settings: ${result.error}`);
			return;
		}

		openRgb.setEndpoint(result.settings.host, result.settings.port);
	} catch (error) {
		streamDeck.logger.warn(`Could not read the saved OpenRGB connection settings: ${errorMessage(error)}`);
	}
}

/**
 * Follows connection settings changed in a property inspector.
 */
export function watchConnectionSettings(): void {
	streamDeck.settings.onDidReceiveGlobalSettings((ev) => {
		const result = parseConnectionSettings(ev.settings);

		if (!result.ok) {
			streamDeck.logger.warn(`Ignoring the OpenRGB connection settings: ${result.error}`);
			return;
		}

		const { host, port } = result.settings;

		if (openRgb.setEndpoint(host, port)) {
			streamDeck.logger.info(`Switching the OpenRGB connection to ${host}:${port}.`);
		}
	});
}
