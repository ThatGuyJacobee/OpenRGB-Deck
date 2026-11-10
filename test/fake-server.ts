import { createServer, type Server, type Socket } from "node:net";

import { PacketId, PROTOCOL_VERSION } from "../src/openrgb/protocol";

/** Options for a {@link FakeServer}. */
export interface FakeServerOptions {
	/** Port to listen on; zero asks the operating system for one. */
	port?: number;

	/** Protocol version reported to the client. */
	protocolVersion?: number;

	/** Server name sent after the version reply. */
	serverName?: string;

	/** Capability flags sent in reply to the client flags. */
	serverFlags?: number;

	/** Send the version reply and server name in one write. */
	coalesceHandshake?: boolean;

	/** Split every response across multiple writes. */
	fragmentResponses?: boolean;

	/** Reply to the protocol version request. */
	replyToVersion?: boolean;

	/** Reply to the client flags packet. */
	replyToFlags?: boolean;
}

/** A packet received from a client. */
export interface ReceivedPacket {
	/** Device identifier from the header. */
	deviceId: number;

	/** Packet identifier. */
	packetId: number;

	/** Packet body. */
	payload: Buffer;
}

/** A decoded packet frame. */
interface Frame {
	/** Device identifier from the header. */
	deviceId: number;

	/** Packet identifier. */
	packetId: number;

	/** Packet body. */
	payload: Buffer;

	/** Total bytes consumed, including the header. */
	totalSize: number;
}

const HEADER_SIZE = 16;
const MAGIC = "ORGB";

/**
 * Minimal in-process OpenRGB SDK server used by client tests.
 */
export class FakeServer {
	/** Most recent client flags. */
	#clientFlags = 0;

	/** Most recent client name. */
	#clientName = "";

	/** Whether the listener has been closed. */
	#closed = false;

	/** Total connections accepted. */
	#connections = 0;

	/** Sockets currently being drained of queued writes. */
	readonly #draining = new Set<Socket>();

	/** Normalised server behaviour. */
	readonly #options: Required<FakeServerOptions>;

	/** Packets received from clients. */
	readonly #received: ReceivedPacket[] = [];

	/** TCP listener. */
	readonly #server: Server;

	/** Active client sockets. */
	readonly #sockets = new Set<Socket>();

	/** Frames waiting to be split across writes. */
	readonly #writeQueues = new Map<Socket, Buffer[]>();

	/**
	 * Creates a fake server; use {@link start} to listen.
	 * @param options Server behaviour.
	 */
	private constructor(options: FakeServerOptions) {
		this.#options = {
			coalesceHandshake: false,
			fragmentResponses: false,
			port: 0,
			protocolVersion: PROTOCOL_VERSION,
			replyToFlags: true,
			replyToVersion: true,
			serverFlags: 127,
			serverName: "Fake OpenRGB",
			...options,
		};

		this.#server = createServer((socket) => this.#handleConnection(socket));
	}

	/** Most recent client flags sent in packet 52. */
	public get clientFlags(): number {
		return this.#clientFlags;
	}

	/** Most recent client name sent in packet 50. */
	public get clientName(): string {
		return this.#clientName;
	}

	/** Total number of client connections accepted. */
	public get connections(): number {
		return this.#connections;
	}

	/** TCP port the server is listening on. */
	public get port(): number {
		const address = this.#server.address();

		if (address === null || typeof address === "string") {
			throw new Error("The fake server is not listening.");
		}

		return address.port;
	}

	/** Packets received from clients, in order. */
	public get received(): readonly ReceivedPacket[] {
		return this.#received;
	}

	/**
	 * Starts a fake server on the loopback interface.
	 * @param options Server behaviour.
	 * @returns The listening server.
	 */
	public static async start(options: FakeServerOptions = {}): Promise<FakeServer> {
		const server = new FakeServer(options);

		await new Promise<void>((resolve, reject) => {
			const onError = (error: Error): void => {
				server.#server.off("listening", onListening);
				reject(error);
			};
			const onListening = (): void => {
				server.#server.off("error", onError);
				resolve();
			};

			server.#server.once("error", onError);
			server.#server.once("listening", onListening);
			server.#server.listen(server.#options.port, "127.0.0.1");
		});

		return server;
	}

	/**
	 * Drops every active client connection, leaving the listener running.
	 */
	public dropConnections(): void {
		for (const socket of this.#sockets) {
			socket.destroy();
		}

		this.#sockets.clear();
	}

	/**
	 * Writes raw bytes to every active client, bypassing normal framing.
	 * @param buffer Bytes to write.
	 */
	public sendRaw(buffer: Buffer): void {
		for (const socket of this.#sockets) {
			socket.write(buffer);
		}
	}

	/**
	 * Stops listening and closes every client socket.
	 * @returns A promise that resolves when the listener is closed.
	 */
	public async stop(): Promise<void> {
		if (this.#closed) {
			return;
		}

		this.#closed = true;

		for (const socket of this.#sockets) {
			socket.destroy();
		}

		this.#sockets.clear();

		await new Promise<void>((resolve, reject) => {
			this.#server.close((error) => {
				if (error !== undefined) {
					reject(error);
				} else {
					resolve();
				}
			});
		});
	}

	/**
	 * Writes queued frames one at a time, splitting each frame if requested.
	 * @param socket Client socket.
	 */
	#drainWrites(socket: Socket): void {
		if (this.#draining.has(socket)) {
			return;
		}

		const frame = this.#writeQueues.get(socket)?.shift();

		if (frame === undefined) {
			this.#writeQueues.delete(socket);
			return;
		}

		this.#draining.add(socket);

		const parts = [frame.subarray(0, 8), frame.subarray(8, HEADER_SIZE), frame.subarray(HEADER_SIZE)];
		let index = 0;

		const writeNext = (): void => {
			const part = parts[index];

			if (part === undefined || socket.destroyed) {
				this.#draining.delete(socket);
				this.#writeQueues.delete(socket);
				return;
			}

			socket.write(part);
			index += 1;

			if (index < parts.length) {
				setTimeout(writeNext, 1).unref();
				return;
			}

			this.#draining.delete(socket);
			this.#drainWrites(socket);
		};

		writeNext();
	}

	/**
	 * Accepts a client connection and starts reading frames.
	 * @param socket Connected client socket.
	 */
	#handleConnection(socket: Socket): void {
		this.#connections += 1;
		this.#sockets.add(socket);

		let buffer = Buffer.alloc(0);

		socket.on("data", (chunk) => {
			buffer = Buffer.concat([buffer, chunk]);

			while (true) {
				let frame: Frame | null;

				try {
					frame = decodeFrame(buffer);
				} catch {
					socket.destroy();
					return;
				}

				if (frame === null) {
					return;
				}

				buffer = buffer.subarray(frame.totalSize);
				this.#received.push({
					deviceId: frame.deviceId,
					packetId: frame.packetId,
					payload: Buffer.from(frame.payload),
				});
				this.#handlePacket(socket, frame);
			}
		});

		socket.on("close", () => {
			this.#sockets.delete(socket);
			this.#writeQueues.delete(socket);
			this.#draining.delete(socket);
		});

		socket.on("error", () => undefined);
	}

	/**
	 * Replies to one client packet.
	 * @param socket Client socket.
	 * @param frame Received packet.
	 */
	#handlePacket(socket: Socket, frame: Frame): void {
		switch (frame.packetId) {
			case PacketId.RequestProtocolVersion:
				if (this.#options.replyToVersion) {
					const version = encodeFrame(
						0,
						PacketId.RequestProtocolVersion,
						uint32(this.#options.protocolVersion),
					);
					const name = encodeFrame(0, PacketId.SetServerName, cstring(this.#options.serverName));

					this.#write(socket, this.#options.coalesceHandshake ? Buffer.concat([version, name]) : version);

					if (!this.#options.coalesceHandshake) {
						this.#write(socket, name);
					}
				}
				break;

			case PacketId.SetClientName:
				this.#clientName = readCString(frame.payload);
				break;

			case PacketId.SetClientFlags:
				this.#clientFlags = frame.payload.length >= 4 ? frame.payload.readUInt32LE(0) : 0;

				if (this.#options.replyToFlags) {
					this.#write(socket, encodeFrame(0, PacketId.SetServerFlags, uint32(this.#options.serverFlags)));
				}
				break;

			default:
				break;
		}

		this.#write(
			socket,
			encodeFrame(frame.deviceId, PacketId.Ack, Buffer.concat([uint32(frame.packetId), uint32(0)])),
		);
	}

	/**
	 * Writes a frame, optionally splitting it across several writes.
	 * @param socket Client socket.
	 * @param frame Encoded frame.
	 */
	#write(socket: Socket, frame: Buffer): void {
		if (!this.#options.fragmentResponses) {
			socket.write(frame);
			return;
		}

		const queue = this.#writeQueues.get(socket) ?? [];

		queue.push(frame);
		this.#writeQueues.set(socket, queue);
		this.#drainWrites(socket);
	}
}

/**
 * Encodes an OpenRGB frame without using the production codec.
 * @param deviceId Device identifier.
 * @param packetId Packet identifier.
 * @param payload Packet body.
 * @returns The encoded frame.
 */
function encodeFrame(deviceId: number, packetId: number, payload: Buffer): Buffer {
	const header = Buffer.alloc(HEADER_SIZE);

	header.write(MAGIC, 0, "ascii");
	header.writeUInt32LE(deviceId, 4);
	header.writeUInt32LE(packetId, 8);
	header.writeUInt32LE(payload.length, 12);

	return Buffer.concat([header, payload]);
}

/**
 * Decodes one frame from the start of a buffer.
 * @param buffer Buffered client bytes.
 * @returns The frame, or null when more bytes are needed.
 */
function decodeFrame(buffer: Buffer): Frame | null {
	if (buffer.length < HEADER_SIZE) {
		return null;
	}

	if (buffer.toString("ascii", 0, 4) !== MAGIC) {
		throw new Error("Invalid packet magic.");
	}

	const size = buffer.readUInt32LE(12);

	if (buffer.length < HEADER_SIZE + size) {
		return null;
	}

	return {
		deviceId: buffer.readUInt32LE(4),
		packetId: buffer.readUInt32LE(8),
		payload: buffer.subarray(HEADER_SIZE, HEADER_SIZE + size),
		totalSize: HEADER_SIZE + size,
	};
}

/**
 * Encodes an unsigned 32-bit integer in little-endian order.
 * @param value Value to encode.
 * @returns Four bytes.
 */
function uint32(value: number): Buffer {
	const buffer = Buffer.allocUnsafe(4);
	buffer.writeUInt32LE(value, 0);

	return buffer;
}

/**
 * Encodes a null-terminated UTF-8 string.
 * @param value String to encode.
 * @returns The encoded bytes.
 */
function cstring(value: string): Buffer {
	return Buffer.from(`${value}\0`, "utf8");
}

/**
 * Decodes a null-terminated UTF-8 string.
 * @param payload Bytes to decode.
 * @returns The decoded string.
 */
function readCString(payload: Buffer): string {
	const end = payload.indexOf(0);

	return payload.toString("utf8", 0, end === -1 ? payload.length : end);
}
