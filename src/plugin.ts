import streamDeck from "@elgato/streamdeck";

import { ProfileStatus } from "./actions/profile-status";
import { SetColour } from "./actions/set-colour";
import { SetProfile } from "./actions/set-profile";
import { startOpenRgb } from "./service";

// Keep the log focused on connections and errors in release builds.
streamDeck.logger.setLevel("info");

streamDeck.actions.registerAction(new SetProfile());
streamDeck.actions.registerAction(new ProfileStatus());
streamDeck.actions.registerAction(new SetColour());

await streamDeck.connect();

startOpenRgb();
