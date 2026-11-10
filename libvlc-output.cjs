const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { app } = require('electron');
const koffi = require('koffi');

class LibVlcOutput {
  constructor() {
    this.instance = null;
    this.player = null;
    this.library = null;
    this.mediaFilePath = null;
    this.tempDirectory = null;
    this.loopEnabled = false;
    this.savedVideoTrack = null;
    this.loopTimer = null;
  }

  getRuntimePaths() {
    if (process.platform !== 'darwin' && process.platform !== 'win32') {
      throw new Error('Видеовывод libVLC поддерживается только в macOS и Windows.');
    }

    if (app.isPackaged) {
      const directory = path.join(process.resourcesPath, 'vlc');
      return process.platform === 'darwin'
        ? { libraryDirectory: path.join(directory, 'lib'), pluginDirectory: path.join(directory, 'plugins') }
        : { libraryDirectory: directory, pluginDirectory: path.join(directory, 'plugins') };
    }

    const configuredDirectory = process.env.VLC_RUNTIME_DIR;
    if (configuredDirectory) {
      return process.platform === 'darwin'
        ? { libraryDirectory: path.join(configuredDirectory, 'lib'), pluginDirectory: path.join(configuredDirectory, 'plugins') }
        : { libraryDirectory: configuredDirectory, pluginDirectory: path.join(configuredDirectory, 'plugins') };
    }

    if (process.platform === 'darwin') {
      const appPath = process.env.VLC_APP_PATH ||
        path.join(os.homedir(), 'Applications', 'ShowDeck VLC Prototype', 'VLC.app');
      const directory = path.join(appPath, 'Contents', 'MacOS');
      return { libraryDirectory: path.join(directory, 'lib'), pluginDirectory: path.join(directory, 'plugins') };
    }

    const directory = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'VideoLAN', 'VLC');
    return { libraryDirectory: directory, pluginDirectory: path.join(directory, 'plugins') };
  }

  initialize() {
    if (this.instance) return;

    const { libraryDirectory, pluginDirectory } = this.getRuntimePaths();
    const coreLibraryPath = path.join(libraryDirectory, process.platform === 'darwin' ? 'libvlccore.dylib' : 'libvlccore.dll');
    const libraryPath = path.join(libraryDirectory, process.platform === 'darwin' ? 'libvlc.dylib' : 'libvlc.dll');
    if (process.platform === 'win32') {
      process.env.PATH = [libraryDirectory, process.env.PATH].filter(Boolean).join(path.delimiter);
    }
    process.env.VLC_PLUGIN_PATH = pluginDirectory;

    let coreLibrary;
    try {
      coreLibrary = koffi.load(coreLibraryPath);
      this.library = koffi.load(libraryPath);
    } catch (error) {
      throw new Error(`Не удалось загрузить libVLC из ${libraryDirectory}: ${error.message}`);
    }

    const fn = (signature) => this.library.func(signature);

    this.api = {
      instanceNew: fn('void * libvlc_new(int argc, void *argv)'),
      mediaNewPath: fn('void * libvlc_media_new_path(void *instance, const char *path)'),
      mediaNewLocation: fn('void * libvlc_media_new_location(void *instance, const char *location)'),
      mediaRelease: fn('void libvlc_media_release(void *media)'),
      playerNewFromMedia: fn('void * libvlc_media_player_new_from_media(void *media)'),
      playerRelease: fn('void libvlc_media_player_release(void *player)'),
      playerSetNsobject: process.platform === 'darwin'
        ? fn('void libvlc_media_player_set_nsobject(void *player, void *drawable)')
        : null,
      playerSetHwnd: process.platform === 'win32'
        ? fn('void libvlc_media_player_set_hwnd(void *player, void *drawable)')
        : null,
      playerPlay: fn('int libvlc_media_player_play(void *player)'),
      playerPause: fn('void libvlc_media_player_pause(void *player)'),
      playerStop: fn('void libvlc_media_player_stop(void *player)'),
      playerSetTime: fn('void libvlc_media_player_set_time(void *player, int64_t time)'),
      playerGetState: fn('int libvlc_media_player_get_state(void *player)'),
      playerSetVolume: fn('int libvlc_audio_set_volume(void *player, int volume)'),
      playerSetMute: fn('void libvlc_audio_set_mute(void *player, int mute)'),
      playerGetVideoTrack: fn('int libvlc_video_get_track(void *player)'),
      playerSetVideoTrack: fn('int libvlc_video_set_track(void *player, int track)'),
      releaseInstance: fn('void libvlc_release(void *instance)')
    };

    this.coreLibrary = coreLibrary;
    this.instance = this.api.instanceNew(0, null);
    if (!this.instance) throw new Error('libVLC не удалось инициализировать.');
  }

  async open(window, { bytes, location, fileName, timeMs = 0, volume = 100, muted = false, loop = false, playing = false, blackout = false }) {
    this.initialize();
    await this.releasePlayer();

    let media;
    if (bytes instanceof Uint8Array) {
      if (!this.tempDirectory) {
        this.tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'showdeck-vlc-'));
      }
      const extension = path.extname(path.basename(fileName || 'video')).replace(/[^.a-zA-Z0-9]/g, '').slice(0, 12);
      this.mediaFilePath = path.join(this.tempDirectory, `${randomUUID()}${extension || '.media'}`);
      await fs.writeFile(this.mediaFilePath, bytes);
      media = this.api.mediaNewPath(this.instance, this.mediaFilePath);
    } else if (typeof location === 'string' && /^https?:\/\//i.test(location)) {
      media = this.api.mediaNewLocation(this.instance, location);
    } else {
      throw new TypeError('Для libVLC требуется содержимое видео или HTTP(S)-адрес.');
    }

    if (!media) throw new Error('libVLC не смог открыть видео.');

    this.player = this.api.playerNewFromMedia(media);
    this.api.mediaRelease(media);
    if (!this.player) throw new Error('libVLC не смог создать видеоплеер.');

    const nativeHandle = window.getNativeWindowHandle();
    if (nativeHandle.length < 8) throw new Error(`Неверный размер native window handle: ${nativeHandle.length} байт.`);
    const nativeViewPointer = nativeHandle.readBigUInt64LE();
    if (nativeViewPointer === 0n) throw new Error('Electron вернул пустой указатель видеоповерхности.');

    if (process.platform === 'darwin') this.api.playerSetNsobject(this.player, nativeViewPointer);
    else this.api.playerSetHwnd(this.player, nativeViewPointer);

    this.api.playerSetVolume(this.player, volume);
    this.api.playerSetMute(this.player, muted ? 1 : 0);
    this.loopEnabled = loop;

    if (this.api.playerPlay(this.player) !== 0) throw new Error('libVLC не смог начать воспроизведение.');
    if (timeMs > 0) this.api.playerSetTime(this.player, BigInt(Math.round(timeMs)));
    if (!playing) this.api.playerPause(this.player);
    if (blackout) this.setBlackout(true);

    this.loopTimer = setInterval(() => {
      if (this.player && this.loopEnabled && this.api.playerGetState(this.player) === 6) {
        this.api.playerPlay(this.player);
      }
    }, 250);
    this.loopTimer.unref();
  }

  action({ action, time, volume, muted, loop, blackout }) {
    if (!this.player) return;

    if (action === 'stop') {
      void this.releasePlayer().catch(error => {
        console.error('Unable to stop the libVLC output player:', error);
      });
      return;
    }

    if (action === 'play') {
      if (Number.isFinite(time) && time >= 0) this.api.playerSetTime(this.player, BigInt(Math.round(time * 1000)));
      this.api.playerPlay(this.player);
    } else if (action === 'pause') {
      this.api.playerPause(this.player);
    } else if (action === 'seek' && Number.isFinite(time) && time >= 0) {
      this.api.playerSetTime(this.player, BigInt(Math.round(time * 1000)));
    }

    if (Number.isFinite(volume)) {
      const normalizedVolume = Math.max(0, Math.min(1, volume));
      this.api.playerSetVolume(this.player, Math.round(normalizedVolume * 100));
    }
    if (typeof muted === 'boolean') this.api.playerSetMute(this.player, muted ? 1 : 0);
    if (typeof loop === 'boolean') this.loopEnabled = loop;
    if (typeof blackout === 'boolean') this.setBlackout(blackout);
  }

  setBlackout(enabled) {
    if (enabled && this.savedVideoTrack === null) {
      const track = this.api.playerGetVideoTrack(this.player);
      if (track >= 0) {
        this.savedVideoTrack = track;
        this.api.playerSetVideoTrack(this.player, -1);
      }
    } else if (!enabled && this.savedVideoTrack !== null) {
      this.api.playerSetVideoTrack(this.player, this.savedVideoTrack);
      this.savedVideoTrack = null;
    }
  }

  async releasePlayer() {
    if (this.loopTimer) clearInterval(this.loopTimer);
    this.loopTimer = null;
    this.loopEnabled = false;
    this.savedVideoTrack = null;
    if (this.player) {
      this.api.playerStop(this.player);
      this.api.playerRelease(this.player);
      this.player = null;
    }
    if (this.mediaFilePath) {
      await fs.rm(this.mediaFilePath, { force: true });
      this.mediaFilePath = null;
    }
  }

  async dispose() {
    await this.releasePlayer();
    if (this.tempDirectory) {
      await fs.rm(this.tempDirectory, { recursive: true, force: true });
      this.tempDirectory = null;
    }
    if (this.instance) {
      this.api.releaseInstance(this.instance);
      this.instance = null;
    }
  }
}

module.exports = LibVlcOutput;
