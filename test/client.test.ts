import { afterEach, describe, expect, it, vi } from "vitest";

import { OpenRgbClient } from "../src/openrgb/client";
import { MAX_PACKET_SIZE, PacketId } from "../src/openrgb/protocol";
import type { OpenRgbClientOptions, OpenRgbError } from "../src/openrgb/types";
import { FakeServer, type FakeServerOptions } from "./fake-server";

const clients: OpenRgbClient[] = [];
const servers: FakeServer[] = [];
const WAIT = { interval: 10, timeout: 2000 };

/**
 * Starts a fake server and registers it for cleanup.
 * @param options Server behaviour.
 * @returns The listening server.
 */
async function startServer(options: FakeServerOptions = {}): Promise<FakeServer> {
	const server = await FakeServer.start(options);

	servers.push(server);

	return server;
}

/**
 * Creates a client pointed at a fake server.
 * @param server Fake server to connect to.
 * @param options Client overrides.
 * @returns The client.
 */
function createClient(server: FakeServer, options: Partial<OpenRgbClientOptions> = {}): OpenRgbClient {
	const client = new OpenRgbClient({
		host: "127.0.0.1",
		port: server.port,
		reconnectDelaysMs: [20, 40],
		requestTimeoutMs: 200,
		...options,
	});

	clients.push(client);
	client.on("error", () => undefined);

	return client;
}

/**
 * Waits for the next client error.
 * @param client Client to observe.
 * @returns The error.
 */
function nextError(client: OpenRgbClient): Promise<OpenRgbError> {
	return new Promise<OpenRgbError>((resolve) => {
		client.once("error", resolve);
	});
}

afterEach(async () => {
	for (const client of clients.splice(0)) {
		client.stop();
	}

	for (const server of servers.splice(0)) {
		await server.stop();
	}
});

describe("handshake", () => {
	it("completes the protocol 6 handshake", async () => {
		const server = await startServer();
		const client = createClient(server);

		client.start();

		await vi.waitFor(() => expect(client.state).toBe("connected"), WAIT);

		expect(client.protocolVersion).toBe(6);
		expect(client.serverName).toBe("Fake OpenRGB");
		expect(client.serverFlags).toBe(127);
		expect(server.clientName).toBe("OpenRGB Deck");
		expect(server.clientFlags).toBe(5);

		const packetIds = server.received.map((packet) => packet.packetId);

		expect(packetIds).toContain(PacketId.RequestProtocolVersion);
		expect(packetIds).toContain(PacketId.SetClientName);
		expect(packetIds).toContain(PacketId.SetClientFlags);
	});

	it("uses the configured client name", async () => {
		const server = await startServer();
		const client = createClient(server, { clientName: "OpenRGB Deck Test" });

		client.start();

		await vi.waitFor(() => expect(client.state).toBe("connected"), WAIT);
		expect(server.clientName).toBe("OpenRGB Deck Test");
	});

	it("negotiates the lower protocol version", async () => {
		const server = await startServer({ protocolVersion: 7 });
		const client = createClient(server);

		client.start();

		await vi.waitFor(() => expect(client.state).toBe("connected"), WAIT);
		expect(client.protocolVersion).toBe(6);
	});

	it("reassembles fragmented responses", async () => {
		const server = await startServer({ fragmentResponses: true });
		const client = createClient(server);

		client.start();

		await vi.waitFor(() => expect(client.state).toBe("connected"), WAIT);
		expect(client.serverName).toBe("Fake OpenRGB");
		expect(client.serverFlags).toBe(127);
	});

	it("handles multiple packets in one read", async () => {
		const server = await startServer({ coalesceHandshake: true });
		const client = createClient(server);

		client.start();

		await vi.waitFor(() => expect(client.state).toBe("connected"), WAIT);
		expect(client.serverName).toBe("Fake OpenRGB");
	});

	it("stops retrying when the server is too old", async () => {
		const server = await startServer({ protocolVersion: 5 });
		const client = createClient(server);
		const error = nextError(client);

		client.start();

		expect((await error).code).toBe("PROTOCOL_TOO_OLD");
		await vi.waitFor(() => expect(client.state).toBe("failed"), WAIT);

		await new Promise((resolve) => setTimeout(resolve, 100));
		expect(server.connections).toBe(1);
	});

	it("times out a handshake and retries", async () => {
		const server = await startServer({ replyToVersion: false });
		const client = createClient(server, { reconnectDelaysMs: [20], requestTimeoutMs: 40 });
		const error = nextError(client);

		client.start();

		expect((await error).code).toBe("REQUEST_TIMEOUT");
		await vi.waitFor(() => expect(server.connections).toBeGreaterThan(1), WAIT);
	});
});

describe("reconnect", () => {
	it("reconnects after the server drops the connection", async () => {
		const server = await startServer();
		const client = createClient(server);
		const disconnected = new Promise<string>((resolve) => {
			client.once("disconnected", resolve);
		});

		client.start();

		await vi.waitFor(() => expect(client.state).toBe("connected"), WAIT);
		server.dropConnections();

		expect(await disconnected).toMatch(/closed|failed/i);
		await vi.waitFor(() => expect(server.connections).toBe(2), WAIT);
		await vi.waitFor(() => expect(client.state).toBe("connected"), WAIT);
	});

	it("does not reconnect after stop", async () => {
		const server = await startServer();
		const client = createClient(server);

		client.start();

		await vi.waitFor(() => expect(client.state).toBe("connected"), WAIT);
		client.stop();

		expect(client.state).toBe("stopped");

		await new Promise((resolve) => setTimeout(resolve, 100));
		expect(server.connections).toBe(1);
	});

	it("stops during a handshake without reconnecting", async () => {
		const server = await startServer({ replyToVersion: false });
		const client = createClient(server, { requestTimeoutMs: 1000 });

		client.start();

		await vi.waitFor(() => expect(server.connections).toBe(1), WAIT);
		client.stop();

		expect(client.state).toBe("stopped");

		await new Promise((resolve) => setTimeout(resolve, 100));
		expect(server.connections).toBe(1);
	});
});

describe("malformed input", () => {
	it("rejects invalid packet magic and reconnects", async () => {
		const server = await startServer();
		const client = createClient(server);

		client.start();

		await vi.waitFor(() => expect(client.state).toBe("connected"), WAIT);

		const error = nextError(client);
		server.sendRaw(Buffer.alloc(16));

		expect((await error).code).toBe("PROTOCOL_ERROR");
		await vi.waitFor(() => expect(server.connections).toBe(2), WAIT);
	});

	it("rejects packets larger than the limit and reconnects", async () => {
		const server = await startServer();
		const client = createClient(server);

		client.start();

		await vi.waitFor(() => expect(client.state).toBe("connected"), WAIT);

		const header = Buffer.alloc(16);
		header.write("ORGB", 0, "ascii");
		header.writeUInt32LE(0, 4);
		header.writeUInt32LE(999, 8);
		header.writeUInt32LE(MAX_PACKET_SIZE + 1, 12);

		const error = nextError(client);
		server.sendRaw(header);

		expect((await error).code).toBe("PACKET_TOO_LARGE");
		await vi.waitFor(() => expect(server.connections).toBe(2), WAIT);
	});
});
