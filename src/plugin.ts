import streamDeck from "@elgato/streamdeck";

// Logs every message exchanged with Stream Deck; useful while the plugin is still a skeleton.
streamDeck.logger.setLevel("debug");

await streamDeck.connect();
