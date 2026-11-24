import streamDeck from "@elgato/streamdeck";

import { sendInspectorStatus } from "./actions/inspector-status";
import { ProfileStatus } from "./actions/profile-status";
import { SetColour } from "./actions/set-colour";
import { SetProfile } from "./actions/set-profile";
import { loadConnectionSettings, openRgb, startOpenRgb, watchConnectionSettings } from "./service";

// Keep the log focused on connections and errors in release builds.
streamDeck.logger.setLevel("info");

streamDeck.actions.registerAction(new SetProfile());
streamDeck.actions.registerAction(new ProfileStatus());
streamDeck.actions.registerAction(new SetColour());

await streamDeck.connect();

watchConnectionSettings();
await loadConnectionSettings();

// One listener keeps whichever inspector is visible in sync with the connection.
const refreshInspectorStatus = (): void => {
	void sendInspectorStatus();
};

openRgb.on("activeProfile", refreshInspectorStatus);
openRgb.on("profiles", refreshInspectorStatus);
openRgb.on("serverName", refreshInspectorStatus);
openRgb.on("stateChanged", refreshInspectorStatus);

startOpenRgb();
