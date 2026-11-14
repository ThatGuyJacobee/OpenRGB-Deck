import streamDeck from "@elgato/streamdeck";

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
