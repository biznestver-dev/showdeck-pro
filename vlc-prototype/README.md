# ShowDeck libVLC prototype

This isolated macOS prototype compares VLC playback and exercises native libVLC video output. Production ShowDeck now hosts libVLC in its separate Output window; PGM remains the operator preview.

## Requirements

- macOS on Apple Silicon
- VLC 3.0.24 installed at `~/Applications/ShowDeck VLC Prototype/VLC.app`
- The project dependencies installed at the repository root

## Run

```sh
npm start --prefix vlc-prototype
```

Set `VLC_APP_PATH` if the VLC app is installed elsewhere.

Choose the same video that stutters in ShowDeck and compare playback on the same display. Use the VLC window's own controls for pause, seek, audio, and fullscreen. The existing ShowDeck UI and release build remain unchanged.

## Native surface experiment

```sh
npm run start:native --prefix vlc-prototype
```

This mode embeds the libVLC output into an Electron window. On macOS, it reads the NSView pointer value from Electron's native handle buffer.

The prototype is macOS-only and is not a distributable product. Verify playback, pause, seeking, audio, and fullscreen with a representative clip. Production installer bundling is configured in the repository root and remains subject to review of all VLC plugin licenses and source-distribution requirements.
