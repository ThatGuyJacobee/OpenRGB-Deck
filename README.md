# OpenRGB Deck 🎨

An unofficial [Elgato Stream Deck](https://www.elgato.com/stream-deck) plugin for
controlling [OpenRGB](https://openrgb.org/) devices and profiles.

I decided to build this as there are no dedicated Stream Deck plugins for this - the only solutions were general HTTP hook plugins and guides on integrating it with other services. OpenRGB Deck talks directly to OpenRGB's SDK which is clean and reliable.

Loving this open-source project? Leaving a ⭐ on the repository would be much
appreciated! ❤️

> [!NOTE]
> OpenRGB Deck is unofficial and not affiliated with OpenRGB or Elgato.

## Features 💡

- Load a saved OpenRGB profile from a key.
- See the active profile on a status key, and press to load the next one.
- Set every OpenRGB device to a colour from a swatch key.
- Give colour keys an optional title, such as "Desk" or "Warm".
- Follow profile changes made in the OpenRGB GUI.
- Reconnect automatically after OpenRGB restarts.
- Free, local and open source; no account, telemetry or cloud service.

## Installation 🔌

### Prerequisites 🛂

- [Stream Deck](https://www.elgato.com/stream-deck) 7.1 or newer.
- [OpenRGB](https://openrgb.org/) 1.0 or newer with the SDK server enabled
  (protocol 6).
- At least one saved profile in OpenRGB for the profile actions.
- Windows 10/11 or macOS 12+. Windows is tested; macOS support has not been verified yet ([#8](https://github.com/ThatGuyJacobee/OpenRGB-Deck/issues/8)).

### Setup 🔧

#### Install from a release

1. Download the latest `com.thatguyjacobee.openrgbdeck.streamDeckPlugin` from
   [Releases](https://github.com/ThatGuyJacobee/OpenRGB-Deck/releases/latest).
2. Double-click the file to install it, then restart Stream Deck if the actions
   do not appear.
3. In OpenRGB, open **Settings → SDK Server** and press **Start Server**. It is usually enabled by default, but double-check.
4. Add the actions to your deck and configure them to your liking!

> [!IMPORTANT]
> The SDK server must be running before the plugin can connect. v0.1 connects to
> `127.0.0.1:6742` only; configurable host and port settings are tracked in
> [#4](https://github.com/ThatGuyJacobee/OpenRGB-Deck/issues/4).

> [!TIP]
> Save at least one profile in OpenRGB before using the profile actions. The
> plugin can switch profiles, but it does not create them.

#### Build from source

You need [Node.js](https://nodejs.org/en) 24 or newer.

```bash
npm ci
npm run build
npm run validate
npx streamdeck link com.thatguyjacobee.openrgbdeck.sdPlugin
npm run watch
```

`streamdeck link` only needs to run once. `npm run watch` rebuilds the plugin and
restarts it whenever a source file changes.

Useful commands:

- `npm test` runs the Vitest suite.
- `npm run probe` prints the OpenRGB server, protocol, profiles and controllers;
  useful for checking the connection before opening Stream Deck.
- `npm run pack` builds the `.streamDeckPlugin` release asset.
- `npm run icons` regenerates the PNGs from `assets/icon.svg`.

## Actions 🎛️

### Set OpenRGB Profile

Pick one of your saved profiles in the inspector and press the key to load it.
The key shows the profile name and gets a tinted state while that profile is
active, so a row of profile keys shows the current one at a glance. Use the
refresh button if you save or delete a profile while the inspector is open.

### OpenRGB Profile Status

The key shows the active profile (labelled `Active:`) and follows changes made
in the OpenRGB GUI. Press it to load the next profile in OpenRGB's list, wrapping
at the end.

If OpenRGB is unavailable the key shows `Connecting…`, `OpenRGB offline` or
`OpenRGB too old` instead. The next/previous direction option is tracked in
[#6](https://github.com/ThatGuyJacobee/OpenRGB-Deck/issues/6).

### Set OpenRGB Colour

Pick a colour with the native picker and the key becomes a swatch of that colour.
Press it to switch every OpenRGB controller to Direct mode and set all of its
LEDs to the colour. You can give the key an optional title in the inspector if
you want a label over the swatch.

In v0.1 the colour applies to every controller. Targeting individual devices is
tracked in [#5](https://github.com/ThatGuyJacobee/OpenRGB-Deck/issues/5).

## Troubleshooting 🩺

### The key says `OpenRGB offline`

Start the SDK server in OpenRGB: **Settings → SDK Server → Start Server**. The
default address is `127.0.0.1:6742`. If OpenRGB is running on another machine or
port, v0.1 cannot connect yet; see
[#4](https://github.com/ThatGuyJacobee/OpenRGB-Deck/issues/4).

### The key says `OpenRGB too old`

OpenRGB Deck needs protocol 6, which ships with OpenRGB 1.0 and newer. Update
OpenRGB and restart it.

### The key says `No profiles`

Save a profile in OpenRGB, then press the refresh button in the Set OpenRGB
Profile inspector.

### The profile list is stale

Press the refresh button next to the profile dropdown. This re-reads the list
from OpenRGB.

### The actions do not appear

Restart Stream Deck after installing or updating the plugin.

### Something else

Open an [issue](https://github.com/ThatGuyJacobee/OpenRGB-Deck/issues/new) with
your Stream Deck version, OpenRGB version and the newest file from the plugin's
`logs` folder:

- **Windows:**
  `%APPDATA%\Elgato\StreamDeck\Plugins\com.thatguyjacobee.openrgbdeck.sdPlugin\logs`
- **macOS:**
  `~/Library/Application Support/com.elgato.StreamDeck/Plugins/com.thatguyjacobee.openrgbdeck.sdPlugin/logs`

## Roadmap 🗺️

Planned work is tracked in the issue tracker:

- [Configurable OpenRGB host and port](https://github.com/ThatGuyJacobee/OpenRGB-Deck/issues/4)
- [Per-device colour targeting](https://github.com/ThatGuyJacobee/OpenRGB-Deck/issues/5)
- [Previous-profile option for the status key](https://github.com/ThatGuyJacobee/OpenRGB-Deck/issues/6)
- [Stream Deck+ dial and encoder support](https://github.com/ThatGuyJacobee/OpenRGB-Deck/issues/7)
- [macOS verification](https://github.com/ThatGuyJacobee/OpenRGB-Deck/issues/8)
- [Lights on/off toggle](https://github.com/ThatGuyJacobee/OpenRGB-Deck/issues/9)
- [Brightness up/down keys](https://github.com/ThatGuyJacobee/OpenRGB-Deck/issues/10)

## Contributing 🤝

Issues and pull requests are welcome. For a large change, open an issue first so
we can agree on the approach before you spend time on it.

## Support 🆘

Found a bug or need help? Open an issue on the
[repository](https://github.com/ThatGuyJacobee/OpenRGB-Deck/issues/new) with your
Stream Deck version, OpenRGB version and the plugin log. For OpenRGB itself,
use the [OpenRGB documentation](https://openrgb.org/) and community.

## License 📄

[GNU General Public License v2.0 or later © ThatGuyJacobee](./LICENSE)
