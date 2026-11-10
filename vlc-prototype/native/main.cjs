const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const koffi = require('koffi');

const appPath = process.env.VLC_PROTOTYPE_APP_PATH;
const libraryDirectory = path.join(appPath, 'Contents', 'MacOS', 'lib');
const libraryPath = path.join(libraryDirectory, 'libvlc.dylib');
const stateNames = ['Остановлено', 'Открытие файла', 'Буферизация', 'Воспроизведение', 'Пауза', 'Остановлено', 'Завершено', 'Ошибка'];
let mainWindow;
let videoWindow;
let vlc;
let player = null;
let currentFilePath = null;
let coreLibrary;
let library;

function loadVlc() {
  if (!fs.existsSync(libraryPath)) {
    throw new Error(`Не найдена библиотека libVLC: ${libraryPath}. Проверьте VLC_APP_PATH.`);
  }

  coreLibrary = koffi.load(path.join(libraryDirectory, 'libvlccore.dylib'));
  library = koffi.load(libraryPath);
  const instanceNew = library.func('void * libvlc_new(int argc, void *argv)');
  const mediaNewPath = library.func('void * libvlc_media_new_path(void *instance, const char *path)');
  const mediaRelease = library.func('void libvlc_media_release(void *media)');
  const playerNewFromMedia = library.func('void * libvlc_media_player_new_from_media(void *media)');
  const playerRelease = library.func('void libvlc_media_player_release(void *player)');
  const playerSetView = library.func('void libvlc_media_player_set_nsobject(void *player, void *drawable)');
  const playerPlay = library.func('int libvlc_media_player_play(void *player)');
  const playerPause = library.func('void libvlc_media_player_pause(void *player)');
  const playerStop = library.func('void libvlc_media_player_stop(void *player)');
  const playerSetTime = library.func('void libvlc_media_player_set_time(void *player, int64_t time)');
  const playerGetTime = library.func('int64_t libvlc_media_player_get_time(void *player)');
  const playerGetLength = library.func('int64_t libvlc_media_player_get_length(void *player)');
  const playerGetState = library.func('int libvlc_media_player_get_state(void *player)');
  const playerSetVolume = library.func('int libvlc_audio_set_volume(void *player, int volume)');
  const playerIsPlaying = library.func('int libvlc_media_player_is_playing(void *player)');
  const releaseInstance = library.func('void libvlc_release(void *instance)');
  const instance = instanceNew(0, null);
  if (!instance) throw new Error('libVLC не удалось инициализировать.');

  vlc = {
    instance,
    mediaNewPath,
    mediaRelease,
    playerNewFromMedia,
    playerRelease,
    playerSetView,
    playerPlay,
    playerPause,
    playerStop,
    playerSetTime,
    playerGetTime,
    playerGetLength,
    playerGetState,
    playerSetVolume,
    playerIsPlaying,
    releaseInstance
  };
}

function createVideoWindow() {
  if (videoWindow && !videoWindow.isDestroyed()) return Promise.resolve(videoWindow);

  videoWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  videoWindow.on('closed', () => {
    videoWindow = null;
    if (player) vlc.playerStop(player);
  });

  return new Promise((resolve, reject) => {
    videoWindow.once('ready-to-show', () => resolve(videoWindow));
    videoWindow.once('unresponsive', () => reject(new Error('Окно вывода VLC не отвечает.')));
    videoWindow.loadURL('about:blank').catch(reject);
  });
}

async function openVideo() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Выбрать видео для проверки libVLC',
    properties: ['openFile'],
    filters: [{
      name: 'Видеофайлы',
      extensions: ['mp4', 'mov', 'm4v', 'mkv', 'avi', 'webm', 'wmv', 'ts', 'mts', 'm2ts', 'flv', 'ogv']
    }]
  });
  if (result.canceled || result.filePaths.length === 0) return { canceled: true };

  if (player) {
    vlc.playerStop(player);
    vlc.playerRelease(player);
    player = null;
  }

  const media = vlc.mediaNewPath(vlc.instance, result.filePaths[0]);
  if (!media) throw new Error('libVLC не смог открыть выбранный файл.');
  player = vlc.playerNewFromMedia(media);
  vlc.mediaRelease(media);
  if (!player) throw new Error('libVLC не смог создать видеоплеер.');

  const outputWindow = await createVideoWindow();
  const nativeHandle = outputWindow.getNativeWindowHandle();
  if (nativeHandle.length < 8) throw new Error(`Неверный размер native window handle: ${nativeHandle.length} байт.`);
  const nativeViewPointer = nativeHandle.readBigUInt64LE();
  if (nativeViewPointer === 0n) throw new Error('Electron вернул пустой указатель видеоповерхности.');

  console.log('Embedding libVLC into NSView handle:', `0x${nativeViewPointer.toString(16)}`);
  vlc.playerSetView(player, nativeViewPointer);
  outputWindow.show();
  currentFilePath = result.filePaths[0];
  if (vlc.playerPlay(player) !== 0) throw new Error('libVLC не смог начать воспроизведение.');

  return { canceled: false, filePath: currentFilePath, state: 'Воспроизведение через встроенный libVLC' };
}

function getStatus() {
  if (!player) return { filePath: currentFilePath, state: 'Выберите видео', timeMs: 0, durationMs: 0 };

  const rawState = vlc.playerGetState(player);
  const rawTime = vlc.playerGetTime(player);
  const rawDuration = vlc.playerGetLength(player);
  return {
    filePath: currentFilePath,
    state: stateNames[rawState] || `Состояние libVLC ${rawState}`,
    isPlaying: vlc.playerIsPlaying(player) === 1,
    timeMs: Number(rawTime > 0n ? rawTime : 0n),
    durationMs: Number(rawDuration > 0n ? rawDuration : 0n)
  };
}

function registerHandlers() {
  ipcMain.handle('vlc-native:open', openVideo);
  ipcMain.handle('vlc-native:play', () => {
    if (!player) throw new Error('Сначала выберите видео.');
    if (vlc.playerPlay(player) !== 0) throw new Error('libVLC не смог продолжить воспроизведение.');
    return { state: 'Воспроизведение через встроенный libVLC' };
  });
  ipcMain.handle('vlc-native:pause', () => {
    if (!player) throw new Error('Сначала выберите видео.');
    vlc.playerPause(player);
    return { state: 'Пауза' };
  });
  ipcMain.handle('vlc-native:stop', () => {
    if (!player) return { state: 'Остановлено' };
    vlc.playerStop(player);
    return { state: 'Остановлено' };
  });
  ipcMain.handle('vlc-native:seek', (_event, timeMs) => {
    if (!player || !Number.isFinite(timeMs) || timeMs < 0) throw new TypeError('Некорректная позиция видео.');
    vlc.playerSetTime(player, BigInt(Math.round(timeMs)));
  });
  ipcMain.handle('vlc-native:volume', (_event, volume) => {
    if (!player || !Number.isInteger(volume) || volume < 0 || volume > 100) {
      throw new TypeError('Громкость должна быть числом от 0 до 100.');
    }
    if (vlc.playerSetVolume(player, volume) !== 0) throw new Error('libVLC не смог изменить громкость.');
  });
  ipcMain.handle('vlc-native:fullscreen', () => {
    if (!videoWindow || videoWindow.isDestroyed()) throw new Error('Сначала откройте видео.');
    videoWindow.setFullScreen(!videoWindow.isFullScreen());
  });
  ipcMain.handle('vlc-native:status', getStatus);
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 820,
    height: 480,
    minWidth: 640,
    minHeight: 420,
    backgroundColor: '#101318',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(() => {
  loadVlc();
  registerHandlers();
  createMainWindow();
}).catch(error => {
  dialog.showErrorBox('Ошибка прототипа libVLC', error.stack || error.message);
  app.quit();
});

app.on('before-quit', () => {
  if (player) {
    vlc.playerStop(player);
    vlc.playerRelease(player);
    player = null;
  }
  if (vlc) vlc.releaseInstance(vlc.instance);
});

app.on('window-all-closed', () => app.quit());
