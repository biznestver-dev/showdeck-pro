# ShowDeck Pro Desktop

ShowDeck Pro packaged as a desktop app for macOS and Windows. The desktop build bundles PDF.js, JSZip, Tailwind CSS, and the Inter and JetBrains Mono fonts so the player UI and supported document formats work without loading those assets from a CDN.

The mouse cursor hides after 1.2 seconds without movement in fullscreen playback and appears again when moved.

## Run locally

Requires Node.js 24 or newer.

```sh
npm ci
npm start
```

## Build installers

Build for the current host platform:

```sh
npm run dist:mac
npm run dist:win
```

Installers are written to `release/`. macOS builds target both Intel and Apple Silicon. Windows installers should be built on Windows, and macOS disk images should be built on macOS.

GitHub Actions builds both installers on pushes and pull requests to `main`. To attach them to a GitHub Release, push a version tag such as `v1.0.0`.

The installers are not code-signed or notarized. macOS Gatekeeper and Windows SmartScreen may show a warning when installing them.
