import streamDeck from "@elgato/streamdeck";

import { ProfileStatus } from "./actions/profile-status";
import { SetColour } from "./actions/set-colour";
import { SetProfile } from "./actions/set-profile";

// Logs every message exchanged with Stream Deck; useful while the plugin is still a skeleton.
streamDeck.logger.setLevel("debug");

streamDeck.actions.registerAction(new SetProfile());
streamDeck.actions.registerAction(new ProfileStatus());
streamDeck.actions.registerAction(new SetColour());

await streamDeck.connect();
