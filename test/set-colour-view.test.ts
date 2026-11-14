import { describe, expect, it } from "vitest";

import { colourHex, DEFAULT_COLOUR, DEFAULT_RGB, parseColour, swatchSvg } from "../src/actions/set-colour-view";

describe("parseColour", () => {
	it("parses a hex colour with a hash", () => {
		expect(parseColour("#ff453a")).toEqual({ blue: 58, green: 69, red: 255 });
	});

	it("parses a hex colour without a hash", () => {
		expect(parseColour("32d74b")).toEqual({ blue: 75, green: 215, red: 50 });
	});

	it("parses upper-case hex and surrounding whitespace", () => {
		expect(parseColour("  #0A84FF  ")).toEqual({ blue: 255, green: 132, red: 10 });
	});

	it("matches the default colour", () => {
		expect(parseColour(DEFAULT_COLOUR)).toEqual(DEFAULT_RGB);
	});

	it.each([undefined, "", "#f00", "#1234567", "red", "#gggggg", "#12345"])("rejects %s", (value) => {
		expect(parseColour(value)).toBeNull();
	});
});

describe("colourHex", () => {
	it("formats channels as a lower-case hex string", () => {
		expect(colourHex({ blue: 255, green: 132, red: 10 })).toBe("#0a84ff");
		expect(colourHex({ blue: 0, green: 0, red: 0 })).toBe("#000000");
		expect(colourHex(DEFAULT_RGB)).toBe("#ffffff");
	});
});

describe("swatchSvg", () => {
	it("draws a full-key swatch in the configured colour", () => {
		const svg = swatchSvg({ blue: 0, green: 0, red: 255 });

		expect(svg).toContain('fill="#ff0000"');
		expect(svg).toContain('width="144"');
		expect(svg).toContain('height="144"');
		expect(svg).toContain("<svg");
	});
});
