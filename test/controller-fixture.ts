import type { RgbColour } from "../src/openrgb/types";

/**
 * Matrix map used by a controller fixture.
 */
export interface MatrixFixture {
	/** Number of rows. */
	height: number;

	/** Number of columns. */
	width: number;

	/** Row-major LED indices; defaults to sequential values. */
	data?: number[];
}

/**
 * Mode used by a controller fixture.
 */
export interface ModeFixture {
	/** Mode name. */
	name: string;

	/** Capability flags. */
	flags?: number;

	/** Lowest supported speed. */
	speedMin?: number;

	/** Highest supported speed. */
	speedMax?: number;

	/** Lowest supported brightness. */
	brightnessMin?: number;

	/** Highest supported brightness. */
	brightnessMax?: number;

	/** Lowest number of colours. */
	coloursMin?: number;

	/** Highest number of colours. */
	coloursMax?: number;

	/** Current speed. */
	speed?: number;

	/** Current brightness. */
	brightness?: number;

	/** Current direction. */
	direction?: number;

	/** How the mode interprets its colours. */
	colourMode?: number;

	/** Colours configured for the mode. */
	colours?: RgbColour[];
}

/**
 * Segment used by a zone fixture.
 */
export interface SegmentFixture {
	/** Segment name. */
	name: string;

	/** Segment type. */
	type?: number;

	/** First LED index. */
	startIndex?: number;

	/** Number of LEDs. */
	ledCount?: number;

	/** Matrix map of the segment. */
	matrix?: MatrixFixture;

	/** Segment flags. */
	flags?: number;
}

/**
 * Zone used by a controller fixture.
 */
export interface ZoneFixture {
	/** Zone name. */
	name: string;

	/** Zone type. */
	type?: number;

	/** Lowest supported LED count. */
	ledsMin?: number;

	/** Highest supported LED count. */
	ledsMax?: number;

	/** Current LED count. */
	ledsCount?: number;

	/** Matrix map of the zone. */
	matrix?: MatrixFixture;

	/** Segments that make up the zone. */
	segments?: SegmentFixture[];

	/** Zone flags. */
	flags?: number;

	/** Active mode index. */
	activeMode?: number;

	/** Per-zone modes. */
	modes?: ModeFixture[];

	/** User-facing zone name. */
	displayName?: string;
}

/**
 * Controller description used to build a packet 1 payload.
 */
export interface ControllerFixture {
	/** Controller name. */
	name: string;

	/** Controller type. */
	type?: number;

	/** Controller vendor. */
	vendor?: string;

	/** Controller description. */
	description?: string;

	/** Controller version. */
	version?: string;

	/** Controller serial number. */
	serial?: string;

	/** Controller location. */
	location?: string;

	/** Active mode index. */
	activeMode?: number;

	/** Controller modes. */
	modes?: ModeFixture[];

	/** Controller zones. */
	zones?: ZoneFixture[];

	/** LED names. */
	ledNames?: string[];

	/** Colours stored on the controller. */
	colours?: RgbColour[];

	/** Alternative LED names. */
	ledDisplayNames?: string[];

	/** Controller flags. */
	flags?: number;

	/** User-facing controller name. */
	displayName?: string;

	/** Device-specific configuration. */
	configuration?: string;
}

/**
 * Builds a protocol 6 controller data payload for tests and the fake server.
 * @param fixture Controller description.
 * @returns The size-prefixed packet body used by packet 1.
 */
export function controllerDataPayload(fixture: ControllerFixture): Buffer {
	const device = Buffer.concat([
		uint32(fixture.type ?? 0),
		string(fixture.name),
		string(fixture.vendor ?? ""),
		string(fixture.description ?? ""),
		string(fixture.version ?? ""),
		string(fixture.serial ?? ""),
		string(fixture.location ?? ""),
		uint16((fixture.modes ?? []).length),
		uint32(fixture.activeMode ?? 0),
		modeEntriesPayload(fixture.modes ?? []),
		zonesPayload(fixture.zones ?? []),
		ledNamesPayload(fixture.ledNames ?? []),
		coloursPayload(fixture.colours ?? []),
		ledDisplayNamesPayload(fixture.ledDisplayNames ?? []),
		uint32(fixture.flags ?? 0),
		string(fixture.displayName ?? fixture.name),
		configurationPayload(fixture.configuration ?? "{}"),
	]);

	return Buffer.concat([uint32(device.length + 4), device]);
}

/**
 * Encodes a mode list.
 * @param modes Modes to encode.
 * @returns Encoded modes with their count.
 */
function modesPayload(modes: readonly ModeFixture[]): Buffer {
	return Buffer.concat([uint16(modes.length), modeEntriesPayload(modes)]);
}

/**
 * Encodes mode entries without their count.
 * @param modes Modes to encode.
 * @returns Encoded mode entries.
 */
function modeEntriesPayload(modes: readonly ModeFixture[]): Buffer {
	const parts: Buffer[] = [];

	for (const mode of modes) {
		const colours = mode.colours ?? [];

		parts.push(
			string(mode.name),
			uint32(mode.flags ?? 0),
			uint32(mode.speedMin ?? 0),
			uint32(mode.speedMax ?? 0),
			uint32(mode.brightnessMin ?? 0),
			uint32(mode.brightnessMax ?? 0),
			uint32(mode.coloursMin ?? 0),
			uint32(mode.coloursMax ?? 0),
			uint32(mode.speed ?? 0),
			uint32(mode.brightness ?? 0),
			uint32(mode.direction ?? 0),
			uint32(mode.colourMode ?? 0),
			uint16(colours.length),
			...colours.map(colourBytes),
		);
	}

	return Buffer.concat(parts);
}

/**
 * Encodes a zone list.
 * @param zones Zones to encode.
 * @returns Encoded zones.
 */
function zonesPayload(zones: readonly ZoneFixture[]): Buffer {
	const parts: Buffer[] = [uint16(zones.length)];

	for (const zone of zones) {
		parts.push(
			string(zone.name),
			uint32(zone.type ?? 0),
			uint32(zone.ledsMin ?? 0),
			uint32(zone.ledsMax ?? 0),
			uint32(zone.ledsCount ?? 0),
			matrixPayload(zone.matrix),
			segmentsPayload(zone.segments ?? []),
			uint32(zone.flags ?? 0),
			uint32(zone.activeMode ?? 0),
			modesPayload(zone.modes ?? []),
			string(zone.displayName ?? zone.name),
		);
	}

	return Buffer.concat(parts);
}

/**
 * Encodes a segment list.
 * @param segments Segments to encode.
 * @returns Encoded segments.
 */
function segmentsPayload(segments: readonly SegmentFixture[]): Buffer {
	const parts: Buffer[] = [uint16(segments.length)];

	for (const segment of segments) {
		parts.push(
			string(segment.name),
			uint32(segment.type ?? 0),
			uint32(segment.startIndex ?? 0),
			uint32(segment.ledCount ?? 0),
			matrixPayload(segment.matrix),
			uint32(segment.flags ?? 0),
		);
	}

	return Buffer.concat(parts);
}

/**
 * Encodes a matrix map, including its length prefix.
 * @param matrix Matrix to encode.
 * @returns Encoded matrix, or a zero length when absent.
 */
function matrixPayload(matrix: MatrixFixture | undefined): Buffer {
	if (matrix === undefined) {
		return uint16(0);
	}

	const data = matrix.data ?? Array.from({ length: matrix.height * matrix.width }, (_, index) => index);
	const length = 8 + data.length * 4;

	return Buffer.concat([uint16(length), uint32(matrix.height), uint32(matrix.width), ...data.map(uint32)]);
}

/**
 * Encodes the LED name list.
 * @param names LED names.
 * @returns Encoded names.
 */
function ledNamesPayload(names: readonly string[]): Buffer {
	return Buffer.concat([uint16(names.length), ...names.map(string)]);
}

/**
 * Encodes the LED display name list.
 * @param names Display names.
 * @returns Encoded names.
 */
function ledDisplayNamesPayload(names: readonly string[]): Buffer {
	return Buffer.concat([uint16(names.length), ...names.map(string)]);
}

/**
 * Encodes a colour list.
 * @param colours Colours to encode.
 * @returns Encoded colours.
 */
function coloursPayload(colours: readonly RgbColour[]): Buffer {
	return Buffer.concat([uint16(colours.length), ...colours.map(colourBytes)]);
}

/**
 * Encodes the device-specific configuration.
 * @param configuration Configuration text.
 * @returns Length-prefixed, null-terminated configuration.
 */
function configurationPayload(configuration: string): Buffer {
	const bytes = Buffer.from(`${configuration}\0`, "utf8");

	return Buffer.concat([uint32(bytes.length), bytes]);
}

/**
 * Encodes one RGB colour.
 * @param colour Colour to encode.
 * @returns Four bytes.
 */
function colourBytes(colour: RgbColour): Buffer {
	return Buffer.from([colour.red, colour.green, colour.blue, 0]);
}

/**
 * Encodes a length-prefixed UTF-8 string.
 * @param value String to encode.
 * @returns Two length bytes followed by the null-terminated text.
 */
function string(value: string): Buffer {
	const bytes = Buffer.from(`${value}\0`, "utf8");

	return Buffer.concat([uint16(bytes.length), bytes]);
}

/**
 * Encodes an unsigned 32-bit integer.
 * @param value Value to encode.
 * @returns Four bytes.
 */
function uint32(value: number): Buffer {
	const buffer = Buffer.allocUnsafe(4);

	buffer.writeUInt32LE(value, 0);

	return buffer;
}

/**
 * Encodes an unsigned 16-bit integer.
 * @param value Value to encode.
 * @returns Two bytes.
 */
function uint16(value: number): Buffer {
	const buffer = Buffer.allocUnsafe(2);

	buffer.writeUInt16LE(value, 0);

	return buffer;
}
