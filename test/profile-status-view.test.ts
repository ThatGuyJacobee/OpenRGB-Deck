import { describe, expect, it } from "vitest";

import { nextProfile, profileStatusTitle } from "../src/actions/profile-status-view";

describe("nextProfile", () => {
	it("returns null when there are no profiles", () => {
		expect(nextProfile([], null)).toBeNull();
	});

	it("starts at the first profile when none is active", () => {
		expect(nextProfile(["Alpha", "Bravo", "Charlie"], null)).toBe("Alpha");
	});

	it("returns the following profile", () => {
		expect(nextProfile(["Alpha", "Bravo", "Charlie"], "Alpha")).toBe("Bravo");
	});

	it("wraps around at the end", () => {
		expect(nextProfile(["Alpha", "Bravo", "Charlie"], "Charlie")).toBe("Alpha");
	});

	it("starts at the first profile when the active one is missing", () => {
		expect(nextProfile(["Alpha", "Bravo", "Charlie"], "Deleted")).toBe("Alpha");
	});

	it("keeps a single profile", () => {
		expect(nextProfile(["Only"], "Only")).toBe("Only");
	});
});

describe("profileStatusTitle", () => {
	it("shows the active profile with a label", () => {
		expect(profileStatusTitle("RGB-Zoned", 2, true, "connected")).toBe("Active:\nRGB-Zoned");
	});

	it("shows that no profile is active", () => {
		expect(profileStatusTitle(null, 2, true, "connected")).toBe("No profile");
	});

	it("shows that no profiles are saved", () => {
		expect(profileStatusTitle(null, 0, true, "connected")).toBe("No profiles");
	});

	it("shows progress while connecting", () => {
		expect(profileStatusTitle(null, 2, false, "connecting")).toBe("Connecting…");
		expect(profileStatusTitle(null, 2, false, "handshaking")).toBe("Connecting…");
		expect(profileStatusTitle(null, 2, false, "reconnecting")).toBe("Connecting…");
	});

	it("shows the offline state", () => {
		expect(profileStatusTitle(null, 2, false, "idle")).toBe("OpenRGB offline");
		expect(profileStatusTitle(null, 2, false, "stopped")).toBe("OpenRGB offline");
	});

	it("shows an unsupported protocol", () => {
		expect(profileStatusTitle("RGB-Zoned", 2, false, "failed")).toBe("OpenRGB too old");
	});
});
