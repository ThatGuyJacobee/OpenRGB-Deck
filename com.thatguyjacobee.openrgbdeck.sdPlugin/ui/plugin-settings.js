(function () {
	const { streamDeckClient } = SDPIComponents;
	const DEFAULT_HOST = "127.0.0.1";
	const DEFAULT_PORT = 6742;

	/**
	 * Builds a Stream Deck item with a label and its controls.
	 * @param {string} label Item label.
	 * @param {...Node} children Controls to show.
	 * @returns {HTMLElement} The item.
	 */
	function item(label, ...children) {
		const element = document.createElement("sdpi-item");

		element.setAttribute("label", label);
		element.append(...children);

		return element;
	}

	/**
	 * Builds a text field for the connection form.
	 * @param {string} placeholder Example value.
	 * @returns {HTMLElement} The field.
	 */
	function field(placeholder) {
		const element = document.createElement("sdpi-textfield");

		element.setAttribute("placeholder", placeholder);

		return element;
	}

	/**
	 * Validates the form values and returns the normalised settings.
	 * Keep these rules in sync with src/connection-settings.ts.
	 * @param {string} hostValue Host as typed.
	 * @param {string} portValue Port as typed.
	 * @returns {{ ok: true, host: string, port: number } | { ok: false, error: string }} The result.
	 */
	function parseConnection(hostValue, portValue) {
		let host = hostValue.trim();

		if (host.length === 0) {
			host = DEFAULT_HOST;
		}

		if (host.length > 255) {
			return { ok: false, error: "Host must be 255 characters or fewer." };
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

		const portText = portValue.trim();
		const port = portText === "" ? DEFAULT_PORT : /^\d+$/.test(portText) ? Number(portText) : Number.NaN;

		if (!Number.isInteger(port) || port < 1 || port > 65535) {
			return { ok: false, error: "Port must be a whole number between 1 and 65535." };
		}

		return { ok: true, host, port };
	}

	/**
	 * Builds a chevron icon.
	 * @param {string} path SVG path for the icon.
	 * @returns {string} SVG markup.
	 */
	function chevron(path) {
		return (
			'<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">' +
			`<path d="${path}" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>` +
			"</svg>"
		);
	}

	// Collect the action's own controls before adding the plugin settings.
	const actionItems = Array.from(document.body.children).filter((element) => element.tagName === "SDPI-ITEM");

	const hostField = field(DEFAULT_HOST);
	const portField = field(String(DEFAULT_PORT));

	hostField.value = DEFAULT_HOST;
	portField.value = String(DEFAULT_PORT);

	const scope = document.createElement("div");

	scope.className = "hint";
	scope.textContent = "Applies to every OpenRGB Deck key.";

	const error = document.createElement("div");

	error.className = "hint plugin-settings-error";
	error.style.display = "none";

	const panel = document.createElement("div");

	panel.id = "plugin-settings";
	panel.style.display = "none";
	panel.append(item("Host", hostField), item("Port", portField), item("Scope", scope), error);

	const buttonValue = document.createElement("span");
	const buttonBack = document.createElement("span");
	const buttonChevron = document.createElement("span");
	const button = document.createElement("button");

	button.type = "button";
	button.className = "plugin-settings-toggle";
	button.setAttribute("aria-controls", "plugin-settings");
	button.setAttribute("aria-expanded", "false");
	buttonValue.className = "plugin-settings-value";
	buttonValue.textContent = "Open…";
	buttonBack.className = "plugin-settings-chevron";
	buttonBack.innerHTML = chevron("M6.5 2 3.5 5 6.5 8");
	buttonBack.style.display = "none";
	buttonChevron.className = "plugin-settings-chevron";
	buttonChevron.innerHTML = chevron("M3.5 2 6.5 5 3.5 8");
	button.append(buttonBack, buttonValue, buttonChevron);

	const settingsItem = item("Plugin settings", button);

	const status = document.createElement("div");
	const statusItem = item("Status", status);

	status.id = "status";
	status.className = "status";
	status.textContent = "Connecting…";

	document.body.insertBefore(settingsItem, document.body.firstChild);
	settingsItem.insertAdjacentElement("afterend", panel);
	document.body.append(statusItem);

	/**
	 * Shows or hides the plugin settings.
	 * @param {boolean} expanded Whether the settings should show.
	 */
	function setExpanded(expanded) {
		panel.style.display = expanded ? "" : "none";

		for (const element of actionItems) {
			element.style.display = expanded ? "none" : "";
		}

		buttonValue.textContent = expanded ? "Back" : "Open…";
		buttonBack.style.display = expanded ? "" : "none";
		buttonChevron.style.display = expanded ? "none" : "";
		button.setAttribute("aria-expanded", String(expanded));
	}

	/**
	 * Shows a validation or save error.
	 * @param {string} message Message to show; empty hides it.
	 */
	function showError(message) {
		error.textContent = message;
		error.style.display = message.length > 0 ? "" : "none";
	}

	/**
	 * Reads the saved connection settings into the fields.
	 */
	async function load() {
		try {
			const settings = await streamDeckClient.getGlobalSettings();
			const rawHost = typeof settings.host === "string" ? settings.host : DEFAULT_HOST;
			const rawPort =
				settings.port === undefined || settings.port === null ? String(DEFAULT_PORT) : String(settings.port);
			const result = parseConnection(rawHost, rawPort);

			hostField.value = result.ok ? result.host : DEFAULT_HOST;
			portField.value = result.ok ? String(result.port) : String(DEFAULT_PORT);
		} catch {
			hostField.value = DEFAULT_HOST;
			portField.value = String(DEFAULT_PORT);
		}
	}

	/**
	 * Validates the fields and saves them to the plugin's global settings.
	 */
	async function save() {
		const result = parseConnection(hostField.value, portField.value);

		if (!result.ok) {
			showError(result.error);

			return;
		}

		showError("");

		try {
			const settings = await streamDeckClient.getGlobalSettings();

			streamDeckClient.setGlobalSettings({ ...settings, host: result.host, port: result.port });
			hostField.value = result.host;
			portField.value = String(result.port);
		} catch {
			showError("Could not save the connection settings.");
		}
	}

	button.addEventListener("click", () => {
		const expanded = button.getAttribute("aria-expanded") === "true";

		if (expanded) {
			const result = parseConnection(hostField.value, portField.value);

			if (!result.ok) {
				showError(result.error);

				return;
			}

			void save();
		}

		setExpanded(!expanded);
	});

	panel.addEventListener("focusout", () => {
		window.setTimeout(() => {
			if (!panel.contains(document.activeElement)) {
				void save();
			}
		}, 0);
	});

	panel.addEventListener("keydown", (event) => {
		if (event.key === "Enter") {
			event.preventDefault();
			void save();
		}
	});

	for (const input of [hostField, portField]) {
		input.addEventListener("valuechange", () => {
			showError("");
		});
	}

	streamDeckClient.sendToPropertyInspector.subscribe(({ payload }) => {
		if (payload?.event !== "status") {
			return;
		}

		if (payload.connected) {
			status.textContent = payload.activeProfile
				? `Connected · ${payload.activeProfile}`
				: "Connected · no active profile";
			status.dataset.tone = "ok";
		} else if (["connecting", "handshaking", "reconnecting"].includes(payload.state)) {
			status.textContent = "Connecting to OpenRGB…";
			delete status.dataset.tone;
		} else if (payload.state === "failed") {
			status.textContent = "OpenRGB is too old (SDK 6 required)";
			status.dataset.tone = "error";
		} else {
			status.textContent = "OpenRGB offline — is the SDK server enabled?";
			status.dataset.tone = "error";
		}
	});

	void load();
	streamDeckClient.send("sendToPlugin", { event: "getStatus" });
})();
