import { parseArgs } from "node:util";

import { OpenRgbClient } from "../src/openrgb/client";
import type { OpenRgbConnectedEvent, OpenRgbError } from "../src/openrgb/types";

interface ProbeOptions {
	/** OpenRGB SDK host. */
	host: string;

	/** OpenRGB SDK port. */
	port: number;

	/** Watch duration, in seconds. */
	seconds: number;

	/** Whether to keep printing changes. */
	watch: boolean;
}

const HELP = `Usage: npm run probe -- [options]

Options:
  --host <host>    OpenRGB SDK host (default 127.0.0.1)
  --port <port>    OpenRGB SDK port (default 6742)
  --watch          keep printing changes for --seconds
  --seconds <n>    watch duration in seconds (default 60)
  -h, --help       show this help`;

/**
 * Prints the profile list and highlights the active profile.
 * @param profiles Profile names.
 * @param active Active profile, or null.
 */
function printProfiles(profiles: readonly string[], active: string | null): void {
	console.log(`Profiles (${profiles.length}):`);

	if (profiles.length === 0) {
		console.log("  (none)");
	} else {
		for (const profile of profiles) {
			console.log(`  ${profile === active ? "*" : "-"} ${profile}`);
		}
	}

	console.log(`Active: ${active ?? "(none)"}`);
}

/**
 * Formats capability flags with their hexadecimal value.
 * @param flags Flag value.
 * @returns Human-readable flags.
 */
function formatFlags(flags: number): string {
	return `${flags} (0x${flags.toString(16)})`;
}

/**
 * Formats a duration in seconds with the correct plural.
 * @param seconds Number of seconds.
 * @returns Human-readable duration.
 */
function formatSeconds(seconds: number): string {
	return `${seconds} second${seconds === 1 ? "" : "s"}`;
}

/**
 * Prints a human-readable error.
 * @param error Error to report.
 */
function printError(error: unknown): void {
	if (isOpenRgbError(error)) {
		console.error(`Error [${error.code}]: ${error.message}`);
	} else {
		console.error(error instanceof Error ? error.message : String(error));
	}
}

/**
 * Checks whether a value looks like an OpenRGB error.
 * @param error Value to check.
 * @returns True when the value has an OpenRGB error code.
 */
function isOpenRgbError(error: unknown): error is OpenRgbError {
	return typeof error === "object" && error !== null && "code" in error && "message" in error;
}

/**
 * Parses command-line options.
 * @returns Validated probe options.
 */
function parseOptions(): ProbeOptions {
	const { values } = parseArgs({
		options: {
			help: { default: false, short: "h", type: "boolean" },
			host: { default: "127.0.0.1", type: "string" },
			port: { default: "6742", type: "string" },
			seconds: { default: "60", type: "string" },
			watch: { default: false, type: "boolean" },
		},
		strict: true,
	});

	if (values.help) {
		console.log(HELP);
		process.exit(0);
	}

	const port = Number.parseInt(values.port, 10);
	const seconds = Number.parseInt(values.seconds, 10);

	if (!Number.isInteger(port) || port < 1 || port > 65535) {
		throw new Error(`Port must be an integer between 1 and 65535; received ${values.port}.`);
	}

	if (!Number.isInteger(seconds) || seconds < 1) {
		throw new Error(`Seconds must be a positive integer; received ${values.seconds}.`);
	}

	return { host: values.host, port, seconds, watch: values.watch };
}

/**
 * Runs the probe.
 */
function main(): void {
	let options: ProbeOptions;

	try {
		options = parseOptions();
	} catch (error) {
		printError(error);
		console.error(HELP);
		process.exit(2);
	}

	const client = new OpenRgbClient({
		clientName: "OpenRGB Deck Probe",
		host: options.host,
		port: options.port,
	});

	let firstConnection = true;
	let suppressEvents = true;
	let shuttingDown = false;
	let connectTimer: NodeJS.Timeout | undefined;
	let watchTimer: NodeJS.Timeout | undefined;

	/**
	 * Stops the client and exits.
	 * @param code Process exit code.
	 */
	const shutdown = (code: number): void => {
		if (shuttingDown) {
			return;
		}

		shuttingDown = true;
		suppressEvents = true;

		if (connectTimer !== undefined) {
			clearTimeout(connectTimer);
		}

		if (watchTimer !== undefined) {
			clearTimeout(watchTimer);
		}

		client.stop();
		process.exit(code);
	};

	/**
	 * Handles a completed handshake.
	 * @param event Connection details.
	 */
	const handleConnected = async (event: OpenRgbConnectedEvent): Promise<void> => {
		if (connectTimer !== undefined) {
			clearTimeout(connectTimer);
			connectTimer = undefined;
		}

		suppressEvents = true;

		if (firstConnection) {
			console.log(`Server: ${event.serverName || "(unknown)"}`);
			console.log(`Protocol: ${event.protocolVersion}`);
			console.log(`Flags: ${formatFlags(event.serverFlags)}`);
			firstConnection = false;
		} else {
			console.log("Reconnected.");
		}

		if (options.watch) {
			console.log(`Watching for ${formatSeconds(options.seconds)}. Press Ctrl+C to stop.`);
		}

		try {
			const profiles = await client.listProfiles();
			const active = await client.getActiveProfile();

			printProfiles(profiles, active);
		} catch (error) {
			printError(error);
			suppressEvents = false;

			if (!options.watch) {
				shutdown(1);
			}

			return;
		}

		suppressEvents = false;

		if (!options.watch) {
			shutdown(0);
		}
	};

	client.on("connected", (event) => {
		void handleConnected(event);
	});

	client.on("profiles", (profiles) => {
		if (!options.watch || suppressEvents) {
			return;
		}

		console.log("Profile list updated:");
		printProfiles(profiles, client.activeProfile);
	});

	client.on("activeProfile", (profile) => {
		if (!options.watch || suppressEvents) {
			return;
		}

		console.log(`Active profile: ${profile ?? "(none)"}`);
	});

	client.on("serverName", (name) => {
		if (!options.watch || suppressEvents) {
			return;
		}

		console.log(`Server name: ${name}`);
	});

	client.on("stateChanged", (state) => {
		if (!options.watch || suppressEvents) {
			return;
		}

		console.log(`State: ${state}`);
	});

	client.on("disconnected", (reason) => {
		console.log(`Disconnected: ${reason}`);

		if (!options.watch) {
			shutdown(1);
		}
	});

	client.on("error", (error) => {
		printError(error);

		if (!options.watch) {
			shutdown(1);
		}
	});

	process.on("SIGINT", () => {
		console.log("\nStopped.");
		shutdown(0);
	});

	console.log(`Connecting to ${options.host}:${options.port}...`);

	if (!options.watch) {
		connectTimer = setTimeout(() => {
			console.error("Timed out connecting to OpenRGB.");
			shutdown(1);
		}, 5000);
	} else {
		watchTimer = setTimeout(() => {
			console.log(`Finished watching after ${formatSeconds(options.seconds)}.`);
			shutdown(0);
		}, options.seconds * 1000);
	}

	client.start();
}

main();
