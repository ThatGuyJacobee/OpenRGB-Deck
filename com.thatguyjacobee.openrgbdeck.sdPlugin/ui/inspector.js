(function () {
	const { streamDeckClient } = SDPIComponents;
	const status = document.getElementById("status");

	if (status === null) {
		return;
	}

	streamDeckClient.sendToPropertyInspector.subscribe(({ payload }) => {
		if (payload?.event !== "status") {
			return;
		}

		if (payload.state === "connected") {
			status.textContent = payload.activeProfile
				? `Connected · ${payload.activeProfile}`
				: "Connected · no active profile";
			status.dataset.tone = "ok";
		} else if (["connecting", "handshaking", "reconnecting"].includes(payload.state)) {
			status.textContent = "Connecting to OpenRGB…";
			status.dataset.tone = "pending";
		} else if (payload.state === "failed") {
			status.textContent = "OpenRGB is too old (SDK 6 required)";
			status.dataset.tone = "error";
		} else {
			status.textContent = "OpenRGB offline — is the SDK server enabled?";
			status.dataset.tone = "error";
		}
	});

	streamDeckClient.send("sendToPlugin", { event: "getStatus" });
})();
