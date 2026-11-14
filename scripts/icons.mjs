import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = await readFile(path.join(root, "assets/icon.svg"));
const sourceText = source.toString("utf8");

/**
 * Adds a faint RGB wash behind the device outline, used by the active-profile key state.
 * @param {string} svg Source icon markup.
 * @returns {Buffer} SVG markup for the active key image.
 */
function renderActiveSource(svg) {
	const marker = '<rect x="72" y="132"';

	if (!svg.includes(marker)) {
		throw new Error("Could not find the device outline in assets/icon.svg.");
	}

	return Buffer.from(
		svg.replace(
			marker,
			`<rect x="16" y="16" width="480" height="480" rx="112" fill="url(#rgb)" fill-opacity="0.18" />\n\t${marker}`,
		),
	);
}

const activeSource = renderActiveSource(sourceText);

/**
 * Output images, as `[source, 1x, 2x]` pixel sizes keyed by path without extension.
 */
const images = {
	"imgs/plugin/icon": [source, 288, 512],
	"imgs/plugin/category-icon": [source, 28, 56],
	"imgs/actions/set-profile/icon": [source, 20, 40],
	"imgs/actions/set-profile/key": [source, 72, 144],
	"imgs/actions/set-profile/key-active": [activeSource, 72, 144],
	"imgs/actions/profile-status/icon": [source, 20, 40],
	"imgs/actions/profile-status/key": [source, 72, 144],
	"imgs/actions/set-colour/icon": [source, 20, 40],
	"imgs/actions/set-colour/key": [source, 72, 144],
};

const sdPlugin = path.join(root, "com.thatguyjacobee.openrgbdeck.sdPlugin");

for (const [target, [image, size, size2x]] of Object.entries(images)) {
	const file = path.join(sdPlugin, `${target}.png`);

	await mkdir(path.dirname(file), { recursive: true });
	await sharp(image).resize(size, size).png({ compressionLevel: 9 }).toFile(file);
	await sharp(image)
		.resize(size2x, size2x)
		.png({ compressionLevel: 9 })
		.toFile(file.replace(/\.png$/, "@2x.png"));

	console.log(`${target}.png (${size}x${size}), ${target}@2x.png (${size2x}x${size2x})`);
}
