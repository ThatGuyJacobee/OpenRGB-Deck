import { OpenRgbError } from "./types";

/** Magic value at the start of every OpenRGB SDK packet. */
export const MAGIC = "ORGB";

/** Size of the OpenRGB SDK packet header, in bytes. */
export const HEADER_SIZE = 16;

/** Highest OpenRGB SDK protocol version supported by this client. */
export const PROTOCOL_VERSION = 6;

/** Default OpenRGB SDK host. */
export const DEFAULT_HOST = "127.0.0.1";

/** Default OpenRGB SDK port. */
export const DEFAULT_PORT = 6742;

/** Default name shown in OpenRGB's connected clients list. */
export const DEFAULT_CLIENT_NAME = "OpenRGB Deck";

/** Largest packet body accepted from the server, in bytes. */
export const MAX_PACKET_SIZE = 16 * 1024 * 1024;

/**
 * OpenRGB SDK packet identifiers used by the plugin.
 */
export const PacketId = {
	Ack: 10,
	RequestControllerCount: 0,
	RequestControllerData: 1,
	RequestProtocolVersion: 40,
	SetClientName: 50,
	SetServerName: 51,
	SetClientFlags: 52,
	SetServerFlags: 53,
	DeviceListUpdated: 100,
	ProfileGetList: 150,
	ProfileLoad: 152,
	ProfileGetActive: 156,
	ProfileActiveChanged: 157,
	ProfileAboutToLoad: 159,
	ProfileListUpdated: 160,
	UpdateLeds: 1050,
	SetCustomMode: 1100,
} as const;

/**
 * Client capability flags sent in packet `52`.
 */
export const ClientFlags = {
	RgbController: 1 << 0,
	LogManager: 1 << 1,
	ProfileManager: 1 << 2,
	PluginManager: 1 << 3,
	SettingsManager: 1 << 4,
	RequestLocalClient: 1 << 16,
} as const;

/**
 * Server capability flags received in packet `53`.
 */
export const ServerFlags = {
	RgbController: 1 << 0,
	LogManager: 1 << 1,
	ProfileManager: 1 << 2,
	PluginManager: 1 << 3,
	SettingsManager: 1 << 4,
	Detection: 1 << 5,
	DeviceInfo: 1 << 6,
	LocalClient: 1 << 16,
} as const;

/**
 * Capabilities requested by this client: controller data and profiles.
 */
export const DEFAULT_CLIENT_FLAGS = ClientFlags.RgbController | ClientFlags.ProfileManager;

/**
 * Status codes returned in an acknowledgement packet.
 */
export const PacketStatus = {
	Ok: 0,
	ErrorGeneric: 1,
	ErrorUnsupported: 2,
	ErrorNotAllowed: 3,
	ErrorInvalidId: 4,
	ErrorInvalidData: 5,
} as const;

/**
 * A packet identifier known to this client.
 */
export type PacketId = (typeof PacketId)[keyof typeof PacketId];

/**
 * An acknowledgement status known to this client.
 */
export type PacketStatus = (typeof PacketStatus)[keyof typeof PacketStatus];

/**
 * Header at the start of every OpenRGB SDK packet.
 */
export interface PacketHeader {
	/** Device or controller identifier the packet targets. */
	deviceId: number;

	/** Packet identifier. */
	packetId: number;

	/** Size of the packet body, in bytes. */
	size: number;
}

/**
 * Body of an acknowledgement packet.
 */
export interface PacketAck {
	/** Packet identifier being acknowledged. */
	packetId: number;

	/** Status code returned by the server. */
	status: number;
}

const EMPTY_PAYLOAD = Buffer.alloc(0);

/**
 * Encodes a packet header.
 * @param header Header fields to encode.
 * @returns A 16-byte header.
 */
export function encodeHeader(header: PacketHeader): Buffer {
	assertUint32(header.deviceId, "deviceId");
	assertUint32(header.packetId, "packetId");
	assertUint32(header.size, "size");

	const buffer = Buffer.allocUnsafe(HEADER_SIZE);
	buffer.write(MAGIC, 0, "ascii");
	buffer.writeUInt32LE(header.deviceId, 4);
	buffer.writeUInt32LE(header.packetId, 8);
	buffer.writeUInt32LE(header.size, 12);

	return buffer;
}

/**
 * Decodes a packet header from the start of a buffer.
 * @param buffer Buffer that may contain a header.
 * @returns The header, or `null` when fewer than 16 bytes are available.
 * @throws {OpenRgbError} When the magic value is not `ORGB`.
 */
export function decodeHeader(buffer: Buffer): PacketHeader | null {
	if (buffer.length < HEADER_SIZE) {
		return null;
	}

	if (buffer.toString("ascii", 0, 4) !== MAGIC) {
		throw new OpenRgbError("PROTOCOL_ERROR", `Invalid packet magic: expected "${MAGIC}".`);
	}

	return {
		deviceId: buffer.readUInt32LE(4),
		packetId: buffer.readUInt32LE(8),
		size: buffer.readUInt32LE(12),
	};
}

/**
 * Encodes a complete packet, setting the size from the payload.
 * @param header Header fields without the size.
 * @param payload Packet body.
 * @returns The header followed by the payload.
 */
export function encodePacket(header: Omit<PacketHeader, "size">, payload: Buffer = EMPTY_PAYLOAD): Buffer {
	const packetHeader = encodeHeader({ ...header, size: payload.length });
	return Buffer.concat([packetHeader, payload], HEADER_SIZE + payload.length);
}

/**
 * Writes primitive values into an OpenRGB packet body.
 */
export class PacketWriter {
	/** Chunks written so far. */
	readonly #chunks: Buffer[] = [];

	/** Total number of bytes written. */
	#length = 0;

	/** Number of bytes written so far. */
	public get length(): number {
		return this.#length;
	}

	/**
	 * Appends raw bytes.
	 * @param value Bytes to append.
	 * @returns This writer.
	 */
	public bytes(value: Buffer): this {
		return this.#append(value);
	}

	/**
	 * Appends a null-terminated UTF-8 string.
	 * @param value String to append.
	 * @returns This writer.
	 */
	public cstring(value: string): this {
		return this.#append(encodeCString(value));
	}

	/**
	 * Appends a 16-bit length followed by a null-terminated UTF-8 string.
	 * @param value String to append.
	 * @returns This writer.
	 */
	public string(value: string): this {
		const encoded = encodeCString(value);

		if (encoded.length > 0xffff) {
			throw new OpenRgbError(
				"PROTOCOL_ERROR",
				`String is too long for a 16-bit length: ${encoded.length} bytes.`,
			);
		}

		this.uint16(encoded.length);

		return this.#append(encoded);
	}

	/**
	 * Concatenates everything written so far.
	 * @returns The complete packet body.
	 */
	public toBuffer(): Buffer {
		return Buffer.concat(this.#chunks, this.#length);
	}

	/**
	 * Appends an unsigned 16-bit integer.
	 * @param value Integer between 0 and 65535.
	 * @returns This writer.
	 */
	public uint16(value: number): this {
		assertUint(value, 0xffff, "uint16");

		const chunk = Buffer.allocUnsafe(2);
		chunk.writeUInt16LE(value, 0);

		return this.#append(chunk);
	}

	/**
	 * Appends an unsigned 32-bit integer.
	 * @param value Integer between 0 and 4294967295.
	 * @returns This writer.
	 */
	public uint32(value: number): this {
		assertUint32(value, "uint32");

		const chunk = Buffer.allocUnsafe(4);
		chunk.writeUInt32LE(value, 0);

		return this.#append(chunk);
	}

	/**
	 * Adds a chunk to the output.
	 * @param chunk Bytes to add.
	 * @returns This writer.
	 */
	#append(chunk: Buffer): this {
		this.#chunks.push(chunk);
		this.#length += chunk.length;

		return this;
	}
}

/**
 * Reads primitive values from an OpenRGB packet body.
 */
export class PacketReader {
	/** Packet body being read. */
	readonly #buffer: Buffer;

	/** Current read offset. */
	#offset = 0;

	/**
	 * Creates a reader over a packet body.
	 * @param buffer Packet body to read.
	 */
	constructor(buffer: Buffer) {
		this.#buffer = buffer;
	}

	/** Current read offset, in bytes. */
	public get offset(): number {
		return this.#offset;
	}

	/** Number of bytes left to read. */
	public get remaining(): number {
		return this.#buffer.length - this.#offset;
	}

	/**
	 * Reads a fixed number of bytes.
	 * @param length Number of bytes to read.
	 * @returns The bytes, as a view into the packet body.
	 */
	public bytes(length: number): Buffer {
		if (!Number.isInteger(length) || length < 0) {
			throw new OpenRgbError("PROTOCOL_ERROR", `Invalid byte length: ${length}.`);
		}

		this.#ensure(length);

		const value = this.#buffer.subarray(this.#offset, this.#offset + length);
		this.#offset += length;

		return value;
	}

	/**
	 * Reads a null-terminated UTF-8 string.
	 * @returns The decoded string.
	 */
	public cstring(): string {
		const end = this.#buffer.indexOf(0, this.#offset);

		if (end === -1) {
			throw new OpenRgbError("PROTOCOL_ERROR", "Unterminated string in packet.");
		}

		const value = this.#buffer.toString("utf8", this.#offset, end);
		this.#offset = end + 1;

		return value;
	}

	/**
	 * Reads a 16-bit length followed by a null-terminated UTF-8 string.
	 * @returns The decoded string.
	 */
	public string(): string {
		const length = this.uint16();

		if (length === 0) {
			throw new OpenRgbError("PROTOCOL_ERROR", "Length-prefixed string has zero length.");
		}

		const value = this.bytes(length);

		if (value[length - 1] !== 0) {
			throw new OpenRgbError("PROTOCOL_ERROR", "Length-prefixed string is not null-terminated.");
		}

		return value.toString("utf8", 0, length - 1);
	}

	/**
	 * Reads an unsigned 16-bit integer.
	 * @returns The decoded value.
	 */
	public uint16(): number {
		this.#ensure(2);

		const value = this.#buffer.readUInt16LE(this.#offset);
		this.#offset += 2;

		return value;
	}

	/**
	 * Reads an unsigned 32-bit integer.
	 * @returns The decoded value.
	 */
	public uint32(): number {
		this.#ensure(4);

		const value = this.#buffer.readUInt32LE(this.#offset);
		this.#offset += 4;

		return value;
	}

	/**
	 * Throws when fewer than the requested number of bytes remain.
	 * @param length Number of bytes required.
	 */
	#ensure(length: number): void {
		if (length > this.remaining) {
			throw new OpenRgbError(
				"PROTOCOL_ERROR",
				`Packet is ${this.remaining} byte(s) short; needed ${length} more.`,
			);
		}
	}
}

/**
 * Encodes a null-terminated UTF-8 string.
 * @param value String to encode.
 * @returns The UTF-8 bytes followed by a null terminator.
 */
export function encodeCString(value: string): Buffer {
	if (value.includes("\0")) {
		throw new OpenRgbError("PROTOCOL_ERROR", "Strings cannot contain null characters.");
	}

	return Buffer.from(`${value}\0`, "utf8");
}

/**
 * Decodes a payload that contains exactly one null-terminated UTF-8 string.
 * @param payload Packet body.
 * @returns The decoded string.
 */
export function parseCString(payload: Buffer): string {
	const reader = new PacketReader(payload);
	const value = reader.cstring();

	if (reader.remaining !== 0) {
		throw new OpenRgbError("PROTOCOL_ERROR", `String payload has ${reader.remaining} trailing byte(s).`);
	}

	return value;
}

/**
 * Decodes a profile-list response or update.
 * @param payload Packet body containing a size, count and length-prefixed names.
 * @returns Profile names in server order.
 */
export function parseProfileList(payload: Buffer): string[] {
	if (payload.length < 6) {
		throw new OpenRgbError("PROTOCOL_ERROR", `Profile list is too short: ${payload.length} bytes.`);
	}

	const reader = new PacketReader(payload);
	const dataSize = reader.uint32();

	if (dataSize !== payload.length) {
		throw new OpenRgbError(
			"PROTOCOL_ERROR",
			`Profile list size mismatch: header says ${dataSize}, received ${payload.length}.`,
		);
	}

	const count = reader.uint16();
	const profiles: string[] = [];

	for (let index = 0; index < count; index++) {
		profiles.push(reader.string());
	}

	if (reader.remaining !== 0) {
		throw new OpenRgbError("PROTOCOL_ERROR", `Profile list has ${reader.remaining} trailing byte(s).`);
	}

	return profiles;
}

/**
 * Decodes the active profile name.
 * @param payload Packet body containing a null-terminated profile name.
 * @returns The profile name, or `null` when no profile is active.
 */
export function parseActiveProfile(payload: Buffer): string | null {
	const profile = parseCString(payload);

	return profile.length === 0 ? null : profile;
}

/**
 * Decodes a payload containing one unsigned 32-bit integer.
 * @param payload Packet body.
 * @returns The decoded value.
 */
export function parseUint32(payload: Buffer): number {
	if (payload.length !== 4) {
		throw new OpenRgbError("PROTOCOL_ERROR", `Expected 4 bytes, received ${payload.length}.`);
	}

	return payload.readUInt32LE(0);
}

/**
 * Decodes an acknowledgement packet.
 * @param payload Packet body.
 * @returns The acknowledged packet identifier and status.
 */
export function parseAck(payload: Buffer): PacketAck {
	if (payload.length !== 8) {
		throw new OpenRgbError("PROTOCOL_ERROR", `ACK payload must be 8 bytes, received ${payload.length}.`);
	}

	return {
		packetId: payload.readUInt32LE(0),
		status: payload.readUInt32LE(4),
	};
}

/**
 * Asserts that a value fits in an unsigned integer of the given width.
 * @param value Value to check.
 * @param max Largest allowed value.
 * @param label Field name used in the error.
 */
function assertUint(value: number, max: number, label: string): void {
	if (!Number.isInteger(value) || value < 0 || value > max) {
		throw new OpenRgbError(
			"PROTOCOL_ERROR",
			`${label} must be an integer between 0 and ${max}; received ${value}.`,
		);
	}
}

/**
 * Asserts that a value fits in an unsigned 32-bit integer.
 * @param value Value to check.
 * @param label Field name used in the error.
 */
function assertUint32(value: number, label: string): void {
	assertUint(value, 0xffffffff, label);
}
