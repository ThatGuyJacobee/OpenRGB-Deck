import { DEFAULT_HOST, DEFAULT_PORT } from "./openrgb/protocol";

/**
 * Settings for the shared OpenRGB connection.
 */
export interface ConnectionSettings {
	/** OpenRGB SDK host. */
	host: string;

	/** OpenRGB SDK port. */
	port: number;
}

/**
 * Failed shared connection settings.
 */
export interface ConnectionSettingsFailure {
	/** Whether the settings are valid. */
	ok: false;

	/** Why the settings could not be used. */
	error: string;
}

/**
 * Valid shared connection settings.
 */
export interface ConnectionSettingsSuccess {
	/** Whether the settings are valid. */
	ok: true;

	/** The normalised settings. */
	settings: ConnectionSettings;
}

/**
 * Result of reading the shared connection settings.
 */
export type ConnectionSettingsResult = ConnectionSettingsFailure | ConnectionSettingsSuccess;

/**
 * A failed parse of one setting.
 */
interface ParseFailure {
	/** Whether the parse succeeded. */
	ok: false;

	/** Why the value could not be used. */
	error: string;
}

/**
 * A successful parse of one setting.
 * @template T Parsed value type.
 */
interface ParseSuccess<T> {
	/** Whether the parse succeeded. */
	ok: true;

	/** The normalised value. */
	value: T;
}

/**
 * Result of parsing a host.
 */
type HostResult = ParseFailure | ParseSuccess<string>;

/**
 * Result of parsing a port.
 */
type PortResult = ParseFailure | ParseSuccess<number>;

/** Connection settings used when none have been saved. */
export const DEFAULT_CONNECTION_SETTINGS: ConnectionSettings = {
	host: DEFAULT_HOST,
	port: DEFAULT_PORT,
};

/** Longest accepted host value, matching the DNS limit. */
const MAX_HOST_LENGTH = 255;

/**
 * Reads and validates the host and port from the plugin's global settings.
 * @param value Global settings as received from Stream Deck.
 * @returns The normalised settings, or a message explaining what is wrong.
 */
export function parseConnectionSettings(value: unknown): ConnectionSettingsResult {
	const settings = isRecord(value) ? value : {};
	const host = parseHost(settings.host);

	if (!host.ok) {
		return host;
	}

	const port = parsePort(settings.port);

	if (!port.ok) {
		return port;
	}

	return { ok: true, settings: { host: host.value, port: port.value } };
}

/**
 * Parses a stored host value.
 * @param value Value from the global settings.
 * @returns The normalised host, or an error message.
 */
function parseHost(value: unknown): HostResult {
	if (value === undefined || value === null || value === "") {
		return { ok: true, value: DEFAULT_HOST };
	}

	if (typeof value !== "string") {
		return { ok: false, error: "Host must be text." };
	}

	let host = value.trim();

	if (host.length === 0) {
		return { ok: true, value: DEFAULT_HOST };
	}

	if (host.length > MAX_HOST_LENGTH) {
		return { ok: false, error: `Host must be ${MAX_HOST_LENGTH} characters or fewer.` };
	}

	if (/\s/.test(host)) {
		return { ok: false, error: "Host cannot contain spaces." };
	}

	if (/^[a-z][a-z0-9+.-]*:\/\//i.test(host) || host.includes("/")) {
		return { ok: false, error: "Enter a hostname or IP address, not a URL." };
	}

	if (/^\[[^\]]+\]:\d+$/.test(host)) {
		return { ok: false, error: "Put the port in the Port field, not the host." };
	}

	if (host.startsWith("[") && host.endsWith("]")) {
		host = host.slice(1, -1);
	}

	if (host.includes("[") || host.includes("]")) {
		return { ok: false, error: "Host brackets are only valid around an IPv6 address." };
	}

	const colonCount = host.split(":").length - 1;

	if (colonCount === 1) {
		return {
			ok: false,
			error: /^[^:]+:\d+$/.test(host)
				? "Put the port in the Port field, not the host."
				: "Host cannot contain a single colon.",
		};
	}

	return { ok: true, value: host };
}

/**
 * Parses a stored port value.
 * @param value Value from the global settings.
 * @returns The normalised port, or an error message.
 */
function parsePort(value: unknown): PortResult {
	if (value === undefined || value === null || value === "") {
		return { ok: true, value: DEFAULT_PORT };
	}

	if (typeof value !== "number" && typeof value !== "string") {
		return { ok: false, error: "Port must be a number." };
	}

	const text = typeof value === "string" ? value.trim() : value;

	if (text === "") {
		return { ok: true, value: DEFAULT_PORT };
	}

	const port = typeof text === "number" ? text : /^\d+$/.test(text) ? Number(text) : Number.NaN;

	if (!Number.isInteger(port) || port < 1 || port > 65535) {
		return { ok: false, error: "Port must be a whole number between 1 and 65535." };
	}

	return { ok: true, value: port };
}

/**
 * Checks whether a value is a non-null object.
 * @param value Value to check.
 * @returns True for an object that can hold settings.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
