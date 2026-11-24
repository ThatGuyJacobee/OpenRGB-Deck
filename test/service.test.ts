import { afterEach, describe, expect, it, vi } from "vitest";

import { loadConnectionSettings, openRgb, watchConnectionSettings } from "../src/service";

/**
 * A global settings event from Stream Deck.
 */
interface GlobalSettingsEvent {
	/** The plugin's global settings. */
	settings: Record<string, unknown>;
}

const mocks = vi.hoisted(() => ({
	getGlobalSettings: vi.fn(),
	listeners: [] as Array<(event: GlobalSettingsEvent) => void>,
	warn: vi.fn(),
}));

vi.mock("@elgato/streamdeck", () => ({
	default: {
		logger: {
			debug: vi.fn(),
			error: vi.fn(),
			info: vi.fn(),
			warn: mocks.warn,
		},
		settings: {
			getGlobalSettings: mocks.getGlobalSettings,
			onDidReceiveGlobalSettings: (listener: (event: GlobalSettingsEvent) => void) => {
				mocks.listeners.push(listener);

				return { dispose: vi.fn() };
			},
		},
	},
}));

afterEach(() => {
	vi.restoreAllMocks();
	mocks.getGlobalSettings.mockReset();
	mocks.listeners.length = 0;
	mocks.warn.mockClear();
});

describe("connection settings", () => {
	it("applies a valid setting change", () => {
		const setEndpoint = vi.spyOn(openRgb, "setEndpoint").mockReturnValue(true);

		watchConnectionSettings();
		mocks.listeners.at(-1)?.({ settings: { host: "192.168.1.50", port: 6743 } });

		expect(setEndpoint).toHaveBeenCalledWith("192.168.1.50", 6743);
	});

	it("ignores invalid settings", () => {
		const setEndpoint = vi.spyOn(openRgb, "setEndpoint").mockReturnValue(true);

		watchConnectionSettings();
		mocks.listeners.at(-1)?.({ settings: { host: "https://openrgb.example", port: 6742 } });

		expect(setEndpoint).not.toHaveBeenCalled();
		expect(mocks.warn).toHaveBeenCalled();
	});

	it("loads the saved settings on startup", async () => {
		const setEndpoint = vi.spyOn(openRgb, "setEndpoint").mockReturnValue(true);

		mocks.getGlobalSettings.mockResolvedValue({ host: "10.0.0.5", port: 6742 });

		await loadConnectionSettings();

		expect(setEndpoint).toHaveBeenCalledWith("10.0.0.5", 6742);
	});

	it("ignores invalid saved settings on startup", async () => {
		const setEndpoint = vi.spyOn(openRgb, "setEndpoint").mockReturnValue(true);

		mocks.getGlobalSettings.mockResolvedValue({ host: "https://openrgb.example", port: 6742 });

		await loadConnectionSettings();

		expect(setEndpoint).not.toHaveBeenCalled();
		expect(mocks.warn).toHaveBeenCalled();
	});
});
