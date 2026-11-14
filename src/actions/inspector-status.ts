import streamDeck from "@elgato/streamdeck";

import { errorMessage } from "../errors";
import { openRgb } from "../service";

/**
 * Sends the shared connection status to the open property inspector.
 */
export async function sendInspectorStatus(): Promise<void> {
	try {
		await streamDeck.ui.sendToPropertyInspector({
			activeProfile: openRgb.activeProfile,
			connected: openRgb.connected,
			event: "status",
			serverName: openRgb.serverName,
			state: openRgb.state,
		});
	} catch (error) {
		streamDeck.logger.debug(`Could not send the status to the property inspector: ${errorMessage(error)}`);
	}
}
