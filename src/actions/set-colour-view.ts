import type { RgbColour } from "../openrgb";

/** Colour used when the action has no setting yet. */
export const DEFAULT_COLOUR = "#ffffff";

/** RGB value matching {@link DEFAULT_COLOUR}. */
export const DEFAULT_RGB: RgbColour = { blue: 255, green: 255, red: 255 };

/**
 * Parses a six-digit hex colour, with or without a leading hash.
 * @param value Colour text from the settings.
 * @returns The parsed colour, or null when the text is not a valid colour.
 */
export function parseColour(value: string | undefined): RgbColour | null {
	const match = /^#?([0-9a-f]{6})$/i.exec((value ?? "").trim());
	const hex = match?.[1];

	if (hex === undefined) {
		return null;
	}

	return {
		blue: Number.parseInt(hex.slice(4, 6), 16),
		green: Number.parseInt(hex.slice(2, 4), 16),
		red: Number.parseInt(hex.slice(0, 2), 16),
	};
}

/**
 * Formats a colour as a lower-case hex string.
 * @param colour Colour to format.
 * @returns Six-digit hex with a leading hash.
 */
export function colourHex(colour: RgbColour): string {
	const channels = [colour.red, colour.green, colour.blue].map((channel) => channel.toString(16).padStart(2, "0"));

	return `#${channels.join("")}`;
}

/**
 * Builds the key swatch image for a colour.
 * @param colour Colour to draw.
 * @returns An SVG image accepted by the Stream Deck SDK.
 */
export function swatchSvg(colour: RgbColour): string {
	return (
		`<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">` +
		`<rect width="144" height="144" fill="${colourHex(colour)}" />` +
		`<rect x="1" y="1" width="142" height="142" fill="none" stroke="#000000" stroke-opacity="0.25" stroke-width="2" />` +
		`</svg>`
	);
}
