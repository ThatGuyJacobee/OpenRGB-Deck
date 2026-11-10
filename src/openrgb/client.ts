import { EventEmitter } from "node:events";
import { connect, type Socket } from "node:net";

import {
	decodeHeader,
	DEFAULT_CLIENT_FLAGS,
	DEFAULT_CLIENT_NAME,
	DEFAULT_HOST,
	DEFAULT_PORT,
	encodePacket,
	HEADER_SIZE,
	MAX_PACKET_SIZE,
	type PacketAck,
	type PacketHeader,
	PacketId,
	PacketStatus,
	PacketWriter,
	parseAck,
	parseActiveProfile,
	parseCString,
	parseProfileList,
	parseUint32,
	PROTOCOL_VERSION,
} from "./protocol";
import {
	NOOP_LOGGER,
	type OpenRgbClientOptions,
	type OpenRgbConnectionState,
	OpenRgbError,
	type OpenRgbEventMap,
	type OpenRgbLogger,
} from "./types";

/** Default timeout for handshake and profile-list requests, in milliseconds. */
const DEFAULT_REQUEST_TIMEOUT_MS = 2000;

/** Default timeout for profile loads, in milliseconds. */
const DEFAULT_LOAD_PROFILE_TIMEOUT_MS = 10000;

/** Default reconnect delays, in milliseconds; the last value repeats. */
const DEFAULT_RECONNECT_DELAYS_MS = [1000, 2000, 5000, 10000] as const;

const EMPTY_PAYLOAD = Buffer.alloc(0);

/**
 * A request waiting for a payload or acknowledgement.
 */
interface PendingRequest {
	/** Map key used to find the request. */
	key: string;

	/** Device identifier the request targets. */
	deviceId: number;

	/** Packet identifier that was sent. */
	packetId: number;

	/** Packet identifier expected in the response, or undefined for an ACK-only request. */
	expectedPacketId: number | undefined;

	/** Resolves the request with its response payload. */
	resolve: (payload: Buffer) => void;

	/** Rejects the request with an OpenRGB error. */
	reject: (error: OpenRgbError) => void;

	/** Timer that rejects the request when it expires. */
	timer: NodeJS.Timeout;

	/** Promise returned to the caller, reused for duplicate read requests. */
	promise: Promise<Buffer>;
}

/**
 * One shared connection to an OpenRGB SDK server.
 *
 * The client owns a single TCP socket, performs the protocol 6 handshake, and
 * reconnects with backoff when the connection drops.
 */
export class OpenRgbClient extends EventEmitter<OpenRgbEventMap> {
	/** Currently active profile, or null when none is active. */
	#activeProfile: string | null = null;

	/** Bytes received but not yet parsed. */
	#buffer: Buffer = Buffer.alloc(0);

	/** Name sent to the server. */
	readonly #clientName: string;

	/** Connection generation, used to ignore stale sockets. */
	#generation = 0;

	/** Hostname or IP address of the server. */
	readonly #host: string;

	/** Timeout for profile loads, in milliseconds. */
	readonly #loadProfileTimeoutMs: number;

	/** Diagnostic logger. */
	readonly #logger: OpenRgbLogger;

	/** Largest accepted packet body, in bytes. */
	readonly #maxPacketSize: number;

	/** Requests waiting for a payload or acknowledgement. */
	readonly #pending = new Map<string, PendingRequest>();

	/** TCP port of the server. */
	readonly #port: number;

	/** Profiles reported by the server. */
	#profiles: string[] = [];

	/** Negotiated protocol version. */
	#protocolVersion = 0;

	/** Number of consecutive reconnect attempts. */
	#reconnectAttempt = 0;

	/** Reconnect delays, in milliseconds. */
	readonly #reconnectDelaysMs: readonly number[];

	/** Pending reconnect timer. */
	#reconnectTimer: NodeJS.Timeout | undefined;

	/** Timeout for handshake and profile-list requests, in milliseconds. */
	readonly #requestTimeoutMs: number;

	/** Capability flags reported by the server. */
	#serverFlags = 0;

	/** Name reported by the server. */
	#serverName = "";

	/** Active socket. */
	#socket: Socket | undefined;

	/** Current connection state. */
	#state: OpenRgbConnectionState = "idle";

	/** Whether the client is shutting down. */
	#stopping = false;

	/**
	 * Creates an OpenRGB client.
	 * @param options Connection and timeout options.
	 */
	constructor(options: OpenRgbClientOptions = {}) {
		super();

		this.#host = options.host ?? DEFAULT_HOST;
		this.#port = options.port ?? DEFAULT_PORT;
		this.#clientName = options.clientName ?? DEFAULT_CLIENT_NAME;
		this.#requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
		this.#loadProfileTimeoutMs = options.loadProfileTimeoutMs ?? DEFAULT_LOAD_PROFILE_TIMEOUT_MS;
		this.#reconnectDelaysMs = options.reconnectDelaysMs ?? DEFAULT_RECONNECT_DELAYS_MS;
		this.#maxPacketSize = options.maxPacketSize ?? MAX_PACKET_SIZE;
		this.#logger = options.logger ?? NOOP_LOGGER;

		if (!Number.isInteger(this.#port) || this.#port < 1 || this.#port > 65535) {
			throw new RangeError(`Port must be an integer between 1 and 65535; received ${this.#port}.`);
		}
	}

	/** Currently active profile, or null when none is active. */
	public get activeProfile(): string | null {
		return this.#activeProfile;
	}

	/** Whether the handshake has completed and the connection is usable. */
	public get connected(): boolean {
		return this.#state === "connected";
	}

	/** Profiles reported by the server. */
	public get profiles(): readonly string[] {
		return this.#profiles;
	}

	/** Negotiated protocol version, or zero before the handshake. */
	public get protocolVersion(): number {
		return this.#protocolVersion;
	}

	/** Capability flags reported by the server, or zero before the handshake. */
	public get serverFlags(): number {
		return this.#serverFlags;
	}

	/** Name reported by the server, or an empty string before the handshake. */
	public get serverName(): string {
		return this.#serverName;
	}

	/** Current connection state. */
	public get state(): OpenRgbConnectionState {
		return this.#state;
	}

	/**
	 * Requests the active profile from the server.
	 * @returns The profile name, or null when no profile is active.
	 */
	public async getActiveProfile(): Promise<string | null> {
		const payload = await this.#requestOnConnection(
			0,
			PacketId.ProfileGetActive,
			PacketId.ProfileGetActive,
			EMPTY_PAYLOAD,
			this.#requestTimeoutMs,
		);
		const profile = parseActiveProfile(payload);

		this.#setActiveProfile(profile);

		return profile;
	}

	/**
	 * Requests the profile list from the server.
	 * @returns Profile names in server order.
	 */
	public async listProfiles(): Promise<string[]> {
		const payload = await this.#requestOnConnection(
			0,
			PacketId.ProfileGetList,
			PacketId.ProfileGetList,
			EMPTY_PAYLOAD,
			this.#requestTimeoutMs,
		);
		const profiles = parseProfileList(payload);

		this.#setProfiles(profiles);

		return profiles;
	}

	/**
	 * Loads an OpenRGB profile.
	 *
	 * Resolves when the server acknowledges the request; the active-profile
	 * event follows once the profile has finished loading.
	 * @param name Profile name to load.
	 */
	public async loadProfile(name: string): Promise<void> {
		if (name.length === 0) {
			throw new OpenRgbError("REQUEST_FAILED", "Profile name cannot be empty.");
		}

		await this.#requestOnConnection(
			0,
			PacketId.ProfileLoad,
			undefined,
			new PacketWriter().cstring(name).toBuffer(),
			this.#loadProfileTimeoutMs,
		);
	}

	/**
	 * Starts connecting and keeps reconnecting until {@link stop} is called.
	 */
	public start(): void {
		if (
			this.#state === "connected" ||
			this.#state === "connecting" ||
			this.#state === "handshaking" ||
			this.#state === "reconnecting"
		) {
			return;
		}

		this.#stopping = false;
		this.#reconnectAttempt = 0;
		this.#connect();
	}

	/**
	 * Stops the connection and cancels any pending reconnect.
	 */
	public stop(): void {
		this.#stopping = true;

		if (this.#reconnectTimer !== undefined) {
			clearTimeout(this.#reconnectTimer);
			this.#reconnectTimer = undefined;
		}

		this.#rejectPending(new OpenRgbError("CONNECTION_CLOSED", "The OpenRGB client was stopped."));

		const socket = this.#socket;
		this.#socket = undefined;

		if (socket !== undefined && !socket.destroyed) {
			socket.destroy();
		}

		this.#buffer = Buffer.alloc(0);
		this.#setState("stopped");
	}

	/**
	 * Opens a new socket and starts the handshake once it connects.
	 */
	#connect(): void {
		if (this.#stopping) {
			return;
		}

		this.#generation += 1;
		const generation = this.#generation;

		this.#setState(this.#reconnectAttempt > 0 ? "reconnecting" : "connecting");

		let socket: Socket;

		try {
			socket = connect({ host: this.#host, port: this.#port });
		} catch (error) {
			const rgbError = toOpenRgbError(error);

			this.#logger.warn(`Could not create an OpenRGB connection: ${rgbError.message}`);
			this.emit("error", rgbError);
			this.#scheduleReconnect();

			return;
		}

		this.#socket = socket;
		socket.setNoDelay(true);

		socket.on("connect", () => {
			void this.#runHandshake(socket, generation);
		});

		socket.on("data", (chunk) => {
			if (socket !== this.#socket || generation !== this.#generation) {
				return;
			}

			this.#handleData(chunk);
		});

		socket.on("error", (error) => {
			if (socket !== this.#socket || generation !== this.#generation) {
				return;
			}

			this.#logger.warn(`OpenRGB connection error: ${error.message}`);
			this.emit("error", new OpenRgbError("CONNECTION_CLOSED", error.message, { cause: error }));
		});

		socket.on("close", (hadError) => {
			if (socket !== this.#socket) {
				return;
			}

			this.#handleClose(hadError);
		});
	}

	/**
	 * Performs the protocol 6 handshake on a newly connected socket.
	 * @param socket Connected socket.
	 * @param generation Connection generation that owns the socket.
	 */
	async #runHandshake(socket: Socket, generation: number): Promise<void> {
		if (socket !== this.#socket || generation !== this.#generation) {
			return;
		}

		try {
			this.#setState("handshaking");
			this.#serverName = "";
			this.#protocolVersion = 0;
			this.#serverFlags = 0;

			const versionPayload = new PacketWriter().uint32(PROTOCOL_VERSION).toBuffer();
			const versionReply = await this.#request(
				socket,
				generation,
				0,
				PacketId.RequestProtocolVersion,
				PacketId.RequestProtocolVersion,
				versionPayload,
				this.#requestTimeoutMs,
			);
			const serverVersion = parseUint32(versionReply);
			const protocolVersion = Math.min(PROTOCOL_VERSION, serverVersion);

			if (protocolVersion < 6) {
				throw new OpenRgbError(
					"PROTOCOL_TOO_OLD",
					`OpenRGB reports protocol ${serverVersion}; version 6 or newer is required.`,
				);
			}

			this.#protocolVersion = protocolVersion;

			if (socket !== this.#socket || generation !== this.#generation) {
				return;
			}

			this.#send(socket, 0, PacketId.SetClientName, new PacketWriter().cstring(this.#clientName).toBuffer());

			const flagsReply = await this.#request(
				socket,
				generation,
				0,
				PacketId.SetClientFlags,
				PacketId.SetServerFlags,
				new PacketWriter().uint32(DEFAULT_CLIENT_FLAGS).toBuffer(),
				this.#requestTimeoutMs,
			);
			this.#serverFlags = parseUint32(flagsReply);

			if (socket !== this.#socket || generation !== this.#generation) {
				return;
			}

			this.#reconnectAttempt = 0;
			this.#setState("connected");
			this.#logger.info(
				`Connected to OpenRGB at ${this.#host}:${this.#port} (protocol ${this.#protocolVersion}).`,
			);
			this.emit("connected", {
				serverName: this.#serverName,
				protocolVersion: this.#protocolVersion,
				serverFlags: this.#serverFlags,
			});
			void this.#refreshProfileState();
		} catch (error) {
			if (socket !== this.#socket || generation !== this.#generation) {
				return;
			}

			const rgbError = toOpenRgbError(error);

			if (rgbError.code === "PROTOCOL_TOO_OLD") {
				this.#logger.error(rgbError.message);
				this.#stopping = true;
				this.#setState("failed");
				this.emit("error", rgbError);
				socket.destroy();

				return;
			}

			this.#logger.warn(`OpenRGB handshake failed: ${rgbError.message}`);
			this.emit("error", rgbError);
			socket.destroy();
		}
	}

	/**
	 * Appends received bytes and dispatches every complete packet.
	 * @param chunk Bytes received from the socket.
	 */
	#handleData(chunk: Buffer): void {
		this.#buffer = this.#buffer.length === 0 ? chunk : Buffer.concat([this.#buffer, chunk]);

		try {
			while (true) {
				const header = decodeHeader(this.#buffer);

				if (header === null) {
					return;
				}

				if (header.size > this.#maxPacketSize) {
					throw new OpenRgbError(
						"PACKET_TOO_LARGE",
						`Packet ${header.packetId} declares ${header.size} bytes; the limit is ${this.#maxPacketSize}.`,
					);
				}

				if (this.#buffer.length < HEADER_SIZE + header.size) {
					return;
				}

				const payload = this.#buffer.subarray(HEADER_SIZE, HEADER_SIZE + header.size);
				this.#buffer = this.#buffer.subarray(HEADER_SIZE + header.size);
				this.#dispatch(header, payload);
			}
		} catch (error) {
			const rgbError = toOpenRgbError(error);

			this.#logger.error(`Invalid packet from OpenRGB: ${rgbError.message}`);
			this.emit("error", rgbError);
			this.#socket?.destroy();
		}
	}

	/**
	 * Refreshes the cached profile list and active profile after connecting.
	 */
	async #refreshProfileState(): Promise<void> {
		try {
			await this.listProfiles();
			await this.getActiveProfile();
		} catch (error) {
			if (this.#state !== "connected") {
				return;
			}

			this.#logger.warn(`Could not refresh OpenRGB profiles: ${toOpenRgbError(error).message}`);
		}
	}

	/**
	 * Routes a complete packet to its request or push handler.
	 * @param header Packet header.
	 * @param payload Packet body.
	 */
	#dispatch(header: PacketHeader, payload: Buffer): void {
		if (header.packetId === PacketId.Ack) {
			this.#handleAck(header.deviceId, parseAck(payload));
			return;
		}

		if (header.packetId === PacketId.SetServerName) {
			const serverName = parseCString(payload);

			this.#serverName = serverName;
			this.emit("serverName", serverName);

			return;
		}

		if (header.packetId === PacketId.ProfileAboutToLoad) {
			const socket = this.#socket;

			if (socket !== undefined) {
				this.#send(socket, 0, PacketId.ProfileAboutToLoad, EMPTY_PAYLOAD);
			}

			return;
		}

		if (header.packetId === PacketId.ProfileActiveChanged) {
			this.#setActiveProfile(parseActiveProfile(payload));
			return;
		}

		if (header.packetId === PacketId.ProfileListUpdated) {
			this.#setProfiles(parseProfileList(payload));
			return;
		}

		const pending = this.#settle(`${header.deviceId}:${header.packetId}`);

		if (pending !== undefined) {
			pending.resolve(payload);
			return;
		}

		this.#logger.debug(`Ignoring OpenRGB packet ${header.packetId} (${header.size} bytes).`);
	}

	/**
	 * Resolves or rejects a request from an acknowledgement.
	 * @param deviceId Device identifier from the ACK header.
	 * @param ack Acknowledged packet identifier and status.
	 */
	#handleAck(deviceId: number, ack: PacketAck): void {
		for (const pending of [...this.#pending.values()]) {
			if (pending.deviceId !== deviceId || pending.packetId !== ack.packetId) {
				continue;
			}

			if (ack.status !== PacketStatus.Ok) {
				this.#settle(pending.key)?.reject(
					new OpenRgbError(
						"REQUEST_FAILED",
						`OpenRGB rejected packet ${ack.packetId} with status ${ack.status}.`,
						{ status: ack.status },
					),
				);

				continue;
			}

			if (pending.expectedPacketId === undefined) {
				this.#settle(pending.key)?.resolve(EMPTY_PAYLOAD);
			}
		}
	}

	/**
	 * Handles the socket closing.
	 * @param hadError Whether the close followed a socket error.
	 */
	#handleClose(hadError: boolean): void {
		const stopping = this.#stopping;

		this.#socket = undefined;
		this.#buffer = Buffer.alloc(0);
		this.#rejectPending(new OpenRgbError("CONNECTION_CLOSED", "The OpenRGB connection closed."));

		if (stopping || this.#state === "failed") {
			if (this.#state !== "failed") {
				this.#setState("stopped");
			}

			return;
		}

		const reason = hadError ? "The OpenRGB connection failed." : "The OpenRGB connection closed.";

		this.#logger.warn(reason);
		this.emit("disconnected", reason);
		this.#scheduleReconnect();
	}

	/**
	 * Sends an OpenRGB packet on a socket.
	 * @param socket Socket to write to.
	 * @param deviceId Device identifier.
	 * @param packetId Packet identifier.
	 * @param payload Packet body.
	 */
	#send(socket: Socket, deviceId: number, packetId: number, payload: Buffer): void {
		if (socket.destroyed || !socket.writable) {
			throw new OpenRgbError("CONNECTION_CLOSED", "The OpenRGB connection is not writable.");
		}

		socket.write(encodePacket({ deviceId, packetId }, payload));
	}

	/**
	 * Sends a request and waits for its payload or acknowledgement.
	 * @param socket Socket that owns the request.
	 * @param generation Connection generation that owns the socket.
	 * @param deviceId Device identifier.
	 * @param packetId Packet identifier to send.
	 * @param expectedPacketId Expected payload identifier, or undefined for an ACK-only request.
	 * @param payload Packet body.
	 * @param timeoutMs Request timeout.
	 * @returns The response payload, or an empty buffer for an ACK-only request.
	 */
	#request(
		socket: Socket,
		generation: number,
		deviceId: number,
		packetId: number,
		expectedPacketId: number | undefined,
		payload: Buffer,
		timeoutMs: number,
	): Promise<Buffer> {
		if (socket !== this.#socket || generation !== this.#generation) {
			return Promise.reject(new OpenRgbError("CONNECTION_CLOSED", "The OpenRGB connection changed."));
		}

		const key = expectedPacketId === undefined ? `ack:${deviceId}:${packetId}` : `${deviceId}:${expectedPacketId}`;
		const existing = this.#pending.get(key);

		if (existing !== undefined) {
			if (expectedPacketId !== undefined) {
				return existing.promise;
			}

			return Promise.reject(
				new OpenRgbError("REQUEST_FAILED", `A request for packet ${packetId} is already in flight.`),
			);
		}

		let resolveRequest!: (payload: Buffer) => void;
		let rejectRequest!: (error: OpenRgbError) => void;

		const promise = new Promise<Buffer>((resolve, reject) => {
			resolveRequest = resolve;
			rejectRequest = reject;
		});
		const timer = setTimeout(() => {
			this.#settle(key)?.reject(
				new OpenRgbError(
					"REQUEST_TIMEOUT",
					`OpenRGB did not answer packet ${packetId} within ${timeoutMs} ms.`,
				),
			);
		}, timeoutMs);

		this.#pending.set(key, {
			deviceId,
			expectedPacketId,
			key,
			packetId,
			promise,
			reject: rejectRequest,
			resolve: resolveRequest,
			timer,
		});

		try {
			this.#send(socket, deviceId, packetId, payload);
		} catch (error) {
			this.#settle(key)?.reject(toOpenRgbError(error));
		}

		return promise;
	}

	/**
	 * Sends a request on the active connection.
	 * @param deviceId Device identifier.
	 * @param packetId Packet identifier to send.
	 * @param expectedPacketId Expected payload identifier, or undefined for an ACK-only request.
	 * @param payload Packet body.
	 * @param timeoutMs Request timeout.
	 * @returns The response payload, or an empty buffer for an ACK-only request.
	 */
	#requestOnConnection(
		deviceId: number,
		packetId: number,
		expectedPacketId: number | undefined,
		payload: Buffer,
		timeoutMs: number,
	): Promise<Buffer> {
		const socket = this.#socket;

		if (socket === undefined || this.#state !== "connected") {
			return Promise.reject(new OpenRgbError("CONNECTION_CLOSED", "The OpenRGB client is not connected."));
		}

		return this.#request(socket, this.#generation, deviceId, packetId, expectedPacketId, payload, timeoutMs);
	}

	/**
	 * Rejects every pending request and clears their timers.
	 * @param error Error passed to each request.
	 */
	#rejectPending(error: OpenRgbError): void {
		for (const pending of [...this.#pending.values()]) {
			this.#settle(pending.key)?.reject(error);
		}
	}

	/**
	 * Removes a pending request and clears its timer.
	 * @param key Request map key.
	 * @returns The removed request, if it was still pending.
	 */
	#settle(key: string): PendingRequest | undefined {
		const pending = this.#pending.get(key);

		if (pending === undefined) {
			return undefined;
		}

		this.#pending.delete(key);
		clearTimeout(pending.timer);

		return pending;
	}

	/**
	 * Schedules the next connection attempt.
	 */
	#scheduleReconnect(): void {
		if (this.#stopping || this.#state === "failed" || this.#reconnectTimer !== undefined) {
			return;
		}

		const index = Math.min(this.#reconnectAttempt, this.#reconnectDelaysMs.length - 1);
		const delay = this.#reconnectDelaysMs[index] ?? 1000;

		this.#reconnectAttempt += 1;
		this.#setState("reconnecting");
		this.#logger.debug(`Reconnecting to OpenRGB in ${delay} ms.`);

		this.#reconnectTimer = setTimeout(() => {
			this.#reconnectTimer = undefined;
			this.#connect();
		}, delay);
	}

	/**
	 * Updates the cached active profile and notifies listeners.
	 * @param profile Active profile, or null.
	 */
	#setActiveProfile(profile: string | null): void {
		if (this.#activeProfile === profile) {
			return;
		}

		this.#activeProfile = profile;
		this.emit("activeProfile", profile);
	}

	/**
	 * Updates the cached profile list and notifies listeners.
	 * @param profiles Profile names.
	 */
	#setProfiles(profiles: string[]): void {
		if (
			this.#profiles.length === profiles.length &&
			this.#profiles.every((profile, index) => profile === profiles[index])
		) {
			return;
		}

		this.#profiles = [...profiles];
		this.emit("profiles", [...this.#profiles]);
	}

	/**
	 * Updates the connection state and notifies listeners.
	 * @param state New state.
	 */
	#setState(state: OpenRgbConnectionState): void {
		if (this.#state === state) {
			return;
		}

		this.#state = state;
		this.emit("stateChanged", state);
	}
}

/**
 * Converts an unknown thrown value into an OpenRGB error.
 * @param error Thrown value.
 * @returns An OpenRGB error.
 */
function toOpenRgbError(error: unknown): OpenRgbError {
	if (error instanceof OpenRgbError) {
		return error;
	}

	const message = error instanceof Error ? error.message : String(error);

	return new OpenRgbError("CONNECTION_CLOSED", message, { cause: error });
}
