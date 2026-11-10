import { describe, expect, it } from "vitest";

import {
	ClientFlags,
	decodeHeader,
	DEFAULT_CLIENT_FLAGS,
	encodeCString,
	encodeHeader,
	encodePacket,
	HEADER_SIZE,
	PacketId,
	PacketReader,
	PacketStatus,
	PacketWriter,
	parseAck,
	parseActiveProfile,
	parseProfileList,
	parseUint32,
} from "../src/openrgb/protocol";
import { OpenRgbError } from "../src/openrgb/types";

/**
 * Builds a profile-list body in the format the server uses.
 * @param profiles Profile names to include.
 * @returns Packet body with the data size, count and names.
 */
function profileListPayload(profiles: readonly string[]): Buffer {
	const body = new PacketWriter().uint16(profiles.length);

	for (const profile of profiles) {
		body.string(profile);
	}

	const data = body.toBuffer();
	const size = new PacketWriter().uint32(data.length + 4).toBuffer();

	return Buffer.concat([size, data]);
}

describe("packet headers", () => {
	it("encodes a header with the expected little-endian layout", () => {
		const header = encodeHeader({ deviceId: 0, packetId: PacketId.RequestProtocolVersion, size: 4 });

		expect(header.toString("hex")).toBe("4f524742000000002800000004000000");
	});

	it("encodes non-zero fields in little-endian order", () => {
		const header = encodeHeader({ deviceId: 0x01020304, packetId: 150, size: 0x01020304 });

		expect(header.toString("hex")).toBe("4f524742040302019600000004030201");
	});

	it("returns null until a complete header is available", () => {
		expect(decodeHeader(Buffer.alloc(HEADER_SIZE - 1))).toBeNull();
	});

	it("round-trips a header", () => {
		const header = { deviceId: 7, packetId: 152, size: 12 };

		expect(decodeHeader(encodeHeader(header))).toEqual(header);
	});

	it("rejects invalid magic", () => {
		const buffer = encodeHeader({ deviceId: 0, packetId: 40, size: 0 });
		buffer.write("NOPE", 0, "ascii");

		expect(() => decodeHeader(buffer)).toThrowError(OpenRgbError);
		expect(() => decodeHeader(buffer)).toThrowError(/magic/i);
	});

	it("rejects values outside the unsigned 32-bit range", () => {
		expect(() => encodeHeader({ deviceId: -1, packetId: 40, size: 0 })).toThrowError(/deviceId/);
		expect(() => encodeHeader({ deviceId: 0, packetId: 40, size: 0x1_0000_0000 })).toThrowError(/size/);
	});

	it("sets the packet size from the payload", () => {
		const payload = Buffer.from([1, 2, 3]);
		const packet = encodePacket({ deviceId: 2, packetId: 50 }, payload);

		expect(packet.length).toBe(HEADER_SIZE + payload.length);
		expect(decodeHeader(packet)).toEqual({ deviceId: 2, packetId: 50, size: 3 });
	});
});

describe("primitive encoding", () => {
	it("round-trips mixed fields", () => {
		const buffer = new PacketWriter()
			.uint16(0xffff)
			.uint32(0x01020304)
			.cstring("RGB-Zoned")
			.string("Żółw 🎮")
			.toBuffer();

		const reader = new PacketReader(buffer);

		expect(reader.uint16()).toBe(0xffff);
		expect(reader.uint32()).toBe(0x01020304);
		expect(reader.cstring()).toBe("RGB-Zoned");
		expect(reader.string()).toBe("Żółw 🎮");
		expect(reader.remaining).toBe(0);
	});

	it("encodes UTF-8 with a null terminator and no extra bytes", () => {
		const encoded = encodeCString("Żółw 🎮");

		expect(encoded.at(-1)).toBe(0);
		expect(encoded.length).toBe(Buffer.byteLength("Żółw 🎮", "utf8") + 1);
		expect(encoded.toString("utf8", 0, encoded.length - 1)).toBe("Żółw 🎮");
	});

	it("rejects strings containing a null character", () => {
		expect(() => encodeCString("before\0after")).toThrowError(/null/i);
	});

	it("rejects reads past the end of a packet", () => {
		expect(() => new PacketReader(Buffer.from([1])).uint16()).toThrowError(/short/);
		expect(() => new PacketReader(Buffer.alloc(3)).uint32()).toThrowError(/short/);
	});

	it("rejects an unterminated string", () => {
		expect(() => new PacketReader(Buffer.from("RGB-Zoned", "utf8")).cstring()).toThrowError(/unterminated/i);
	});

	it("rejects a length-prefixed string without a null terminator", () => {
		const payload = new PacketWriter().uint16(2).bytes(Buffer.from("ab")).toBuffer();

		expect(() => new PacketReader(payload).string()).toThrowError(/null-terminated/i);
	});

	it("rejects a zero-length length-prefixed string", () => {
		const payload = new PacketWriter().uint16(0).toBuffer();

		expect(() => new PacketReader(payload).string()).toThrowError(/zero length/i);
	});

	it("rejects values outside a 16-bit integer", () => {
		expect(() => new PacketWriter().uint16(-1)).toThrowError(/uint16/);
		expect(() => new PacketWriter().uint16(0x1_0000)).toThrowError(/uint16/);
	});
});

describe("profile lists", () => {
	it("parses an empty list", () => {
		expect(parseProfileList(profileListPayload([]))).toEqual([]);
	});

	it("parses names with spaces and unicode", () => {
		const profiles = ["Gaming", "RGB-Zoned", "Żółw 🎮"];

		expect(parseProfileList(profileListPayload(profiles))).toEqual(profiles);
	});

	it("rejects a mismatched data size", () => {
		const payload = profileListPayload(["Gaming"]);
		payload.writeUInt32LE(payload.length + 1, 0);

		expect(() => parseProfileList(payload)).toThrowError(/size mismatch/i);
	});

	it("rejects trailing bytes", () => {
		const payload = profileListPayload(["Gaming"]);
		const extended = Buffer.concat([payload, Buffer.from([0])]);
		extended.writeUInt32LE(extended.length, 0);

		expect(() => parseProfileList(extended)).toThrowError(/trailing/i);
	});

	it("rejects a list shorter than its size field", () => {
		expect(() => parseProfileList(Buffer.alloc(5))).toThrowError(/too short/i);
	});
});

describe("active profile", () => {
	it("parses a profile name", () => {
		expect(parseActiveProfile(encodeCString("RGB-Zoned"))).toBe("RGB-Zoned");
	});

	it("parses unicode profile names", () => {
		expect(parseActiveProfile(encodeCString("Żółw 🎮"))).toBe("Żółw 🎮");
	});

	it("returns null when no profile is active", () => {
		expect(parseActiveProfile(encodeCString(""))).toBeNull();
	});

	it("rejects an unterminated name", () => {
		expect(() => parseActiveProfile(Buffer.from("RGB-Zoned", "utf8"))).toThrowError(/unterminated/i);
	});

	it("rejects trailing bytes", () => {
		const payload = Buffer.concat([encodeCString("RGB-Zoned"), Buffer.from([1])]);

		expect(() => parseActiveProfile(payload)).toThrowError(/trailing/i);
	});
});

describe("acknowledgements", () => {
	it("parses the acknowledged packet and status", () => {
		const payload = new PacketWriter()
			.uint32(PacketId.ProfileLoad)
			.uint32(PacketStatus.ErrorInvalidData)
			.toBuffer();

		expect(parseAck(payload)).toEqual({ packetId: 152, status: 5 });
	});

	it("rejects a truncated acknowledgement", () => {
		expect(() => parseAck(Buffer.alloc(7))).toThrowError(/ACK payload/i);
	});

	it("rejects a payload with extra bytes", () => {
		expect(() => parseAck(Buffer.alloc(9))).toThrowError(/ACK payload/i);
	});
});

describe("unsigned integers", () => {
	it("parses a 32-bit value", () => {
		expect(parseUint32(new PacketWriter().uint32(6).toBuffer())).toBe(6);
	});

	it("rejects a payload of the wrong size", () => {
		expect(() => parseUint32(Buffer.alloc(3))).toThrowError(/Expected 4 bytes/);
	});
});

describe("client flags", () => {
	it("requests RGBController and ProfileManager support", () => {
		expect(DEFAULT_CLIENT_FLAGS).toBe(5);
		expect(DEFAULT_CLIENT_FLAGS & ClientFlags.RgbController).toBe(ClientFlags.RgbController);
		expect(DEFAULT_CLIENT_FLAGS & ClientFlags.ProfileManager).toBe(ClientFlags.ProfileManager);
	});
});
