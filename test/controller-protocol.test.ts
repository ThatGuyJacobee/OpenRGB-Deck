import { describe, expect, it } from "vitest";

import { encodeUpdateLeds, parseControllerData, parseControllerIds } from "../src/openrgb/protocol";
import { controllerDataPayload } from "./controller-fixture";

describe("parseControllerIds", () => {
	it("decodes the controller count and unique IDs", () => {
		const payload = Buffer.alloc(4 + 3 * 4);

		payload.writeUInt32LE(3, 0);
		payload.writeUInt32LE(10, 4);
		payload.writeUInt32LE(20, 8);
		payload.writeUInt32LE(30, 12);

		expect(parseControllerIds(payload)).toEqual([10, 20, 30]);
	});

	it("decodes an empty controller list", () => {
		const payload = Buffer.alloc(4);

		payload.writeUInt32LE(0, 0);

		expect(parseControllerIds(payload)).toEqual([]);
	});

	it("rejects a payload shorter than the count", () => {
		expect(() => parseControllerIds(Buffer.alloc(2))).toThrow("too short");
	});

	it("rejects a count that does not match the payload", () => {
		const payload = Buffer.alloc(8);

		payload.writeUInt32LE(2, 0);

		expect(() => parseControllerIds(payload)).toThrow("payload is 8 bytes");
	});
});

describe("parseControllerData", () => {
	it("parses a minimal controller", () => {
		const payload = controllerDataPayload({
			activeMode: 0,
			configuration: '{"key":"value"}',
			description: "A controller",
			displayName: "Fake Display",
			flags: 5,
			ledNames: ["LED 1", "LED 2", "LED 3"],
			location: "PCI:0",
			name: "Fake Controller",
			serial: "SN-123",
			vendor: "Fake Vendor",
			version: "1.2.3",
		});

		const controller = parseControllerData(payload, 42);

		expect(controller).toMatchObject({
			activeMode: 0,
			colours: [],
			configuration: '{"key":"value"}',
			description: "A controller",
			displayName: "Fake Display",
			flags: 5,
			id: 42,
			ledDisplayNames: [],
			ledNames: ["LED 1", "LED 2", "LED 3"],
			location: "PCI:0",
			modes: [],
			name: "Fake Controller",
			serial: "SN-123",
			type: 0,
			vendor: "Fake Vendor",
			version: "1.2.3",
			zones: [],
		});
	});

	it("parses modes, zones, segments and matrix maps", () => {
		const red = { blue: 0, green: 0, red: 255 };
		const green = { blue: 0, green: 255, red: 0 };
		const payload = controllerDataPayload({
			activeMode: 1,
			configuration: '{"device":"x"}',
			displayName: "Rich Display",
			flags: 9,
			ledDisplayNames: ["A", "B"],
			ledNames: ["LED A", "LED B", "LED C", "LED D", "LED E", "LED F"],
			modes: [
				{
					brightness: 80,
					brightnessMax: 100,
					brightnessMin: 0,
					colourMode: 2,
					colours: [red],
					coloursMax: 1,
					coloursMin: 1,
					direction: 1,
					flags: 1,
					name: "Direct",
					speed: 50,
					speedMax: 100,
					speedMin: 0,
				},
				{ colours: [red, green], flags: 2, name: "Rainbow" },
			],
			name: "Rich Controller",
			type: 7,
			colours: [red, green],
			zones: [
				{
					activeMode: 1,
					displayName: "Zone Display",
					flags: 3,
					ledsCount: 6,
					ledsMax: 10,
					ledsMin: 1,
					matrix: { data: [0, 1, 2, 3, 4, 5], height: 2, width: 3 },
					modes: [{ colours: [green], name: "Zone Mode" }],
					name: "Zone 1",
					segments: [
						{
							flags: 4,
							ledCount: 3,
							matrix: { data: [0, 1, 2], height: 1, width: 3 },
							name: "Seg A",
							startIndex: 0,
							type: 1,
						},
						{ flags: 8, ledCount: 3, name: "Seg B", startIndex: 3, type: 2 },
					],
					type: 1,
				},
			],
		});

		const controller = parseControllerData(payload, 7);

		expect(controller.type).toBe(7);
		expect(controller.activeMode).toBe(1);
		expect(controller.modes).toHaveLength(2);
		expect(controller.modes[0]).toEqual({
			brightness: 80,
			brightnessMax: 100,
			brightnessMin: 0,
			colourMode: 2,
			colours: [red],
			coloursMax: 1,
			coloursMin: 1,
			direction: 1,
			flags: 1,
			name: "Direct",
			speed: 50,
			speedMax: 100,
			speedMin: 0,
		});
		expect(controller.modes[1]?.colours).toEqual([red, green]);
		expect(controller.ledNames).toHaveLength(6);
		expect(controller.colours).toEqual([red, green]);
		expect(controller.ledDisplayNames).toEqual(["A", "B"]);
		expect(controller.flags).toBe(9);
		expect(controller.displayName).toBe("Rich Display");
		expect(controller.configuration).toBe('{"device":"x"}');

		const zone = controller.zones[0];

		expect(zone).toBeDefined();
		expect(zone).toMatchObject({
			activeMode: 1,
			displayName: "Zone Display",
			flags: 3,
			ledsCount: 6,
			ledsMax: 10,
			ledsMin: 1,
			name: "Zone 1",
			type: 1,
		});
		expect(zone?.matrix).toEqual({ data: [0, 1, 2, 3, 4, 5], height: 2, width: 3 });
		expect(zone?.modes).toHaveLength(1);
		expect(zone?.modes[0]?.name).toBe("Zone Mode");
		expect(zone?.segments).toHaveLength(2);
		expect(zone?.segments[0]).toEqual({
			flags: 4,
			ledCount: 3,
			matrix: { data: [0, 1, 2], height: 1, width: 3 },
			name: "Seg A",
			startIndex: 0,
			type: 1,
		});
		expect(zone?.segments[1]).toEqual({
			flags: 8,
			ledCount: 3,
			matrix: null,
			name: "Seg B",
			startIndex: 3,
			type: 2,
		});
	});

	it("decodes unicode names", () => {
		const payload = controllerDataPayload({
			displayName: "Kontroler Łódź",
			ledNames: ["Dioda ą", "Dioda ę"],
			name: "Kontroler Łódź",
			vendor: "Firma Żółć",
		});

		const controller = parseControllerData(payload, 1);

		expect(controller.name).toBe("Kontroler Łódź");
		expect(controller.vendor).toBe("Firma Żółć");
		expect(controller.ledNames).toEqual(["Dioda ą", "Dioda ę"]);
	});

	it("rejects a mismatched data size", () => {
		const payload = controllerDataPayload({ ledNames: ["LED"], name: "Controller" });

		payload.writeUInt32LE(payload.length + 1, 0);

		expect(() => parseControllerData(payload, 1)).toThrow("size mismatch");
	});

	it("rejects trailing bytes", () => {
		const payload = controllerDataPayload({ name: "Controller" });
		const extended = Buffer.concat([payload, Buffer.from([0])]);

		extended.writeUInt32LE(extended.length, 0);

		expect(() => parseControllerData(extended, 1)).toThrow("trailing byte");
	});

	it("rejects a truncated device block", () => {
		const payload = controllerDataPayload({ ledNames: ["LED 1", "LED 2"], name: "Controller" });
		const truncated = payload.subarray(0, payload.length - 1);

		truncated.writeUInt32LE(truncated.length, 0);

		expect(() => parseControllerData(truncated, 1)).toThrow("short");
	});
});

describe("encodeUpdateLeds", () => {
	it("encodes the size, count and one colour per LED", () => {
		const payload = encodeUpdateLeds([
			{ blue: 3, green: 2, red: 1 },
			{ blue: 16, green: 0, red: 255 },
		]);

		expect(payload.readUInt32LE(0)).toBe(payload.length);
		expect(payload.readUInt16LE(4)).toBe(2);
		expect([...payload.subarray(6, 10)]).toEqual([1, 2, 3, 0]);
		expect([...payload.subarray(10, 14)]).toEqual([255, 0, 16, 0]);
	});

	it("rejects a channel outside one byte", () => {
		expect(() => encodeUpdateLeds([{ blue: 0, green: 0, red: 256 }])).toThrow("Red must be an integer");
		expect(() => encodeUpdateLeds([{ blue: -1, green: 0, red: 0 }])).toThrow("Blue must be an integer");
		expect(() => encodeUpdateLeds([{ blue: 0, green: 1.5, red: 0 }])).toThrow("Green must be an integer");
	});
});
