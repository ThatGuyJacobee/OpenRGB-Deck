import { describe, expect, it } from "vitest";

import { DEFAULT_CONNECTION_SETTINGS, parseConnectionSettings } from "../src/connection-settings";

describe("connection settings", () => {
	it("uses the defaults when nothing is saved", () => {
		expect(parseConnectionSettings(undefined)).toEqual({ ok: true, settings: DEFAULT_CONNECTION_SETTINGS });
		expect(parseConnectionSettings({})).toEqual({ ok: true, settings: DEFAULT_CONNECTION_SETTINGS });
		expect(parseConnectionSettings({ host: "  ", port: "" })).toEqual({
			ok: true,
			settings: DEFAULT_CONNECTION_SETTINGS,
		});
	});

	it("trims the host and reads a numeric port", () => {
		expect(parseConnectionSettings({ host: " 192.168.1.10 ", port: " 6742 " })).toEqual({
			ok: true,
			settings: { host: "192.168.1.10", port: 6742 },
		});
	});

	it("accepts hostnames, IPv4 and IPv6 addresses", () => {
		for (const host of ["localhost", "192.168.1.10", "::1", "fe80::1%eth0"]) {
			expect(parseConnectionSettings({ host, port: 6742 })).toEqual({
				ok: true,
				settings: { host, port: 6742 },
			});
		}
	});

	it("unwraps a bracketed IPv6 address", () => {
		expect(parseConnectionSettings({ host: "[::1]", port: 6742 })).toEqual({
			ok: true,
			settings: { host: "::1", port: 6742 },
		});
	});

	it("ignores unknown settings", () => {
		expect(parseConnectionSettings({ host: "localhost", other: "value", port: 6742 })).toEqual({
			ok: true,
			settings: { host: "localhost", port: 6742 },
		});
	});

	it("treats a non-object value as empty settings", () => {
		expect(parseConnectionSettings("not settings")).toEqual({
			ok: true,
			settings: DEFAULT_CONNECTION_SETTINGS,
		});
	});

	it("rejects a URL", () => {
		expect(parseConnectionSettings({ host: "https://openrgb.example", port: 6742 })).toEqual({
			ok: false,
			error: "Enter a hostname or IP address, not a URL.",
		});
		expect(parseConnectionSettings({ host: "openrgb.example/path", port: 6742 })).toEqual({
			ok: false,
			error: "Enter a hostname or IP address, not a URL.",
		});
	});

	it("tells the user to use the port field", () => {
		expect(parseConnectionSettings({ host: "192.168.1.10:6742", port: 6742 })).toEqual({
			ok: false,
			error: "Put the port in the Port field, not the host.",
		});
		expect(parseConnectionSettings({ host: "[::1]:6742", port: 6742 })).toEqual({
			ok: false,
			error: "Put the port in the Port field, not the host.",
		});
	});

	it("rejects spaces and single colons in the host", () => {
		expect(parseConnectionSettings({ host: "open rgb", port: 6742 })).toEqual({
			ok: false,
			error: "Host cannot contain spaces.",
		});
		expect(parseConnectionSettings({ host: "open:rgb", port: 6742 })).toEqual({
			ok: false,
			error: "Host cannot contain a single colon.",
		});
	});

	it("rejects an invalid host type or length", () => {
		expect(parseConnectionSettings({ host: 42, port: 6742 })).toEqual({
			ok: false,
			error: "Host must be text.",
		});
		expect(parseConnectionSettings({ host: "x".repeat(256), port: 6742 })).toEqual({
			ok: false,
			error: "Host must be 255 characters or fewer.",
		});
	});

	it("rejects invalid ports", () => {
		for (const port of [0, -1, 65536, 1.5, "abc", "1e3", "12.5"]) {
			expect(parseConnectionSettings({ host: "localhost", port })).toEqual({
				ok: false,
				error: "Port must be a whole number between 1 and 65535.",
			});
		}

		expect(parseConnectionSettings({ host: "localhost", port: true })).toEqual({
			ok: false,
			error: "Port must be a number.",
		});
	});

	it("accepts the port boundaries", () => {
		expect(parseConnectionSettings({ host: "localhost", port: 1 })).toEqual({
			ok: true,
			settings: { host: "localhost", port: 1 },
		});
		expect(parseConnectionSettings({ host: "localhost", port: 65535 })).toEqual({
			ok: true,
			settings: { host: "localhost", port: 65535 },
		});
	});
});
