import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = await readFile(path.join(root, "assets/icon.svg"));

/**
 * Output images, as `[1x, 2x]` pixel sizes keyed by path without extension.
 */
const images = {
	"imgs/plugin/icon": [288, 512],
	"imgs/plugin/category-icon": [28, 56],
	"imgs/actions/set-profile/icon": [20, 40],
	"imgs/actions/set-profile/key": [72, 144],
	"imgs/actions/profile-status/icon": [20, 40],
	"imgs/actions/profile-status/key": [72, 144],
	"imgs/actions/set-colour/icon": [20, 40],
	"imgs/actions/set-colour/key": [72, 144]
};

const sdPlugin = path.join(root, "com.thatguyjacobee.openrgbdeck.sdPlugin");

for (const [target, [size, size2x]] of Object.entries(images)) {
	const file = path.join(sdPlugin, `${target}.png`);

	await mkdir(path.dirname(file), { recursive: true });
	await sharp(source).resize(size, size).png({ compressionLevel: 9 }).toFile(file);
	await sharp(source).resize(size2x, size2x).png({ compressionLevel: 9 }).toFile(file.replace(/\.png$/, "@2x.png"));

	console.log(`${target}.png (${size}x${size}), ${target}@2x.png (${size2x}x${size2x})`);
}
