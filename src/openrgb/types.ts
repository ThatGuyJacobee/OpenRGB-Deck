/**
 * Machine-readable error codes raised by the OpenRGB client.
 */
export type OpenRgbErrorCode =
	| "CONNECTION_CLOSED"
	| "CONNECTION_TIMEOUT"
	| "HANDSHAKE_FAILED"
	| "PACKET_TOO_LARGE"
	| "PROFILE_MANAGER_UNSUPPORTED"
	| "PROTOCOL_ERROR"
	| "PROTOCOL_TOO_OLD"
	| "REQUEST_FAILED"
	| "REQUEST_TIMEOUT";

/**
 * Optional details for an {@link OpenRgbError}.
 */
export interface OpenRgbErrorOptions {
	/** Underlying error or value that caused this error. */
	cause?: unknown;

	/** Status code returned by the OpenRGB server. */
	status?: number;
}

/**
 * Error raised when a connection, request or packet is invalid.
 */
export class OpenRgbError extends Error {
	/** Machine-readable error code. */
	public readonly code: OpenRgbErrorCode;

	/** Status code returned by the OpenRGB server, when relevant. */
	public readonly status: number | undefined;

	/**
	 * Creates an OpenRGB error.
	 * @param code Machine-readable error code.
	 * @param message Human-readable description.
	 * @param options Optional error details.
	 */
	constructor(code: OpenRgbErrorCode, message: string, options: OpenRgbErrorOptions = {}) {
		super(message, options.cause === undefined ? undefined : { cause: options.cause });
		this.name = "OpenRgbError";
		this.code = code;
		this.status = options.status;
	}
}

/**
 * Logger used by the OpenRGB client.
 */
export interface OpenRgbLogger {
	/**
	 * Logs a diagnostic message.
	 * @param message Message to log.
	 * @param args Additional values.
	 */
	debug(message: string, ...args: unknown[]): void;

	/**
	 * Logs an informational message.
	 * @param message Message to log.
	 * @param args Additional values.
	 */
	info(message: string, ...args: unknown[]): void;

	/**
	 * Logs a warning.
	 * @param message Message to log.
	 * @param args Additional values.
	 */
	warn(message: string, ...args: unknown[]): void;

	/**
	 * Logs an error.
	 * @param message Message to log.
	 * @param args Additional values.
	 */
	error(message: string, ...args: unknown[]): void;
}

/**
 * Logger that discards every message.
 */
export const NOOP_LOGGER: OpenRgbLogger = {
	debug: () => undefined,
	info: () => undefined,
	warn: () => undefined,
	error: () => undefined,
};

/**
 * Options for an OpenRGB client.
 */
export interface OpenRgbClientOptions {
	/** Hostname or IP address of the OpenRGB SDK server. */
	host?: string;

	/** TCP port of the OpenRGB SDK server. */
	port?: number;

	/** Name shown in OpenRGB's connected clients list. */
	clientName?: string;

	/** Timeout for ordinary requests, in milliseconds. */
	requestTimeoutMs?: number;

	/** Timeout for profile loads, in milliseconds. */
	loadProfileTimeoutMs?: number;

	/** Reconnect delays, in milliseconds; the final value repeats. */
	reconnectDelaysMs?: readonly number[];

	/** Largest packet body accepted from the server, in bytes. */
	maxPacketSize?: number;

	/** Logger used for diagnostics. */
	logger?: OpenRgbLogger;
}

/**
 * Connection state of an OpenRGB client.
 */
export type OpenRgbConnectionState =
	"connected" | "connecting" | "failed" | "handshaking" | "idle" | "reconnecting" | "stopped";

/**
 * Details emitted when a client finishes its handshake.
 */
export interface OpenRgbConnectedEvent {
	/** Name reported by the OpenRGB server. */
	serverName: string;

	/** Negotiated protocol version. */
	protocolVersion: number;

	/** Capability flags reported by the server. */
	serverFlags: number;
}

/**
 * Events emitted by an OpenRGB client.
 */
export type OpenRgbEventMap = {
	/** The handshake completed and the connection is usable. */
	connected: [event: OpenRgbConnectedEvent];

	/** The connection closed; a reconnect may follow. */
	disconnected: [reason: string];

	/** A connection, handshake or protocol error occurred. */
	error: [error: OpenRgbError];

	/** The server reported a new name. */
	serverName: [serverName: string];

	/** The active profile changed. */
	activeProfile: [profile: string | null];

	/** The profile list changed. */
	profiles: [profiles: string[]];

	/** The connection state changed. */
	stateChanged: [state: OpenRgbConnectionState];
};
