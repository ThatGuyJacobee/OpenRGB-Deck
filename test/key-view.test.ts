import { describe, expect, it } from "vitest";

import { profileKeyView } from "../src/actions/key-view";

describe("profileKeyView", () => {
	it("prompts for a profile when none is configured", () => {
		expect(profileKeyView(undefined, "Gaming", true)).toEqual({ title: "Set profile", state: 0 });
	});

	it("prompts for a profile when the setting is blank", () => {
		expect(profileKeyView("   ", "Gaming", true)).toEqual({ title: "Set profile", state: 0 });
	});

	it("shows the configured profile", () => {
		expect(profileKeyView("Gaming", null, true)).toEqual({ title: "Gaming", state: 0 });
	});

	it("trims the configured profile", () => {
		expect(profileKeyView("  RGB-Zoned  ", "RGB-Zoned", true)).toEqual({ title: "RGB-Zoned", state: 1 });
	});

	it("marks the key active when the configured profile is active", () => {
		expect(profileKeyView("RGB-Zoned", "RGB-Zoned", true)).toEqual({ title: "RGB-Zoned", state: 1 });
	});

	it("keeps the key inactive when another profile is active", () => {
		expect(profileKeyView("RGB-Zoned", "Gaming", true)).toEqual({ title: "RGB-Zoned", state: 0 });
	});

	it("keeps the key inactive while disconnected", () => {
		expect(profileKeyView("RGB-Zoned", "RGB-Zoned", false)).toEqual({ title: "RGB-Zoned", state: 0 });
	});

	it("keeps profile names with spaces intact", () => {
		expect(profileKeyView("Warm white", "Warm white", true)).toEqual({ title: "Warm white", state: 1 });
	});
});
