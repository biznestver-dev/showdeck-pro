const { app, BrowserWindow, dialog, ipcMain, net, protocol, shell } = require('electron');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const LibVlcOutput = require('./libvlc-output.cjs');

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'showdeck',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true
    }
  }
]);

const appRoot = path.join(__dirname, 'app-build');
const appPage = 'showdeck://app/index.html';
let mainWindow;
const vlcOutput = new LibVlcOutput();
let activeTranscode = null;

function assertMainWindow(event) {
  const senderWindow = BrowserWindow.fromWebContents(event.sender);
  if (!senderWindow || senderWindow !== mainWindow || senderWindow.isDestroyed()) {
    throw new Error('Эта операция доступна только в главном окне ShowDeck.');
  }
  return senderWindow;
}

async function moveFileReplacingDestination(sourcePath, destinationPath) {
  const backupPath = `${destinationPath}.showdeck-backup-${randomUUID()}`;
  let destinationBackedUp = false;
  try {
    try {
      await fs.rename(destinationPath, backupPath);
      destinationBackedUp = true;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    await fs.rename(sourcePath, destinationPath);
  } catch (error) {
    if (destinationBackedUp) {
      try {
        await fs.rename(backupPath, destinationPath);
      } catch (restoreError) {
        throw new AggregateError(
          [error, restoreError],
          `Не удалось заменить файл и восстановить прежнюю версию: ${restoreError.message}`
        );
      }
    }
    throw error;
  }
  if (destinationBackedUp) await fs.rm(backupPath);
}

function getFontStorePath() {
  return path.join(app.getPath('userData'), 'fonts');
}

function getStoredFontPaths(id) {
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) {
    throw new TypeError('Invalid font id.');
  }
  const fontStorePath = getFontStorePath();
  return {
    dataPath: path.join(fontStorePath, `${id}.bin`),
    metadataPath: path.join(fontStorePath, `${id}.json`)
  };
}

function registerAppProtocol() {
  protocol.handle('showdeck', (request) => {
    const requestUrl = new URL(request.url);
    if (requestUrl.hostname !== 'app') {
      return new Response('Not found', { status: 404 });
    }

    const filePath = path.resolve(appRoot, `.${decodeURIComponent(requestUrl.pathname)}`);
    if (!filePath.startsWith(`${appRoot}${path.sep}`)) {
      return new Response('Not found', { status: 404 });
    }

    return net.fetch(pathToFileURL(filePath).href);
  });
}

ipcMain.handle('showdeck:save-project', async (event, data, suggestedName) => {
  if (!(data instanceof Uint8Array)) {
    throw new TypeError('Invalid project data.');
  }

  const result = await dialog.showSaveDialog(BrowserWindow.fromWebContents(event.sender), {
    title: 'Сохранить проект ShowDeck',
    defaultPath: path.basename(suggestedName || 'ShowDeck-Project.showdeck'),
    filters: [{ name: 'Проект ShowDeck', extensions: ['showdeck'] }]
  });
  if (result.canceled || !result.filePath) return { canceled: true };

  await fs.writeFile(result.filePath, data);
  return { canceled: false, filePath: result.filePath };
});

ipcMain.handle('showdeck:save-font', async (_event, data, fontInfo) => {
  if (!(data instanceof Uint8Array) || !fontInfo ||
      typeof fontInfo.fileName !== 'string' ||
      typeof fontInfo.family !== 'string' ||
      !['user', 'google_fonts'].includes(fontInfo.source)) {
    throw new TypeError('Invalid font data.');
  }

  const id = randomUUID();
  const { dataPath, metadataPath } = getStoredFontPaths(id);
  await fs.mkdir(getFontStorePath(), { recursive: true });
  await fs.writeFile(dataPath, data);
  await fs.writeFile(metadataPath, JSON.stringify({
    id,
    fileName: path.basename(fontInfo.fileName),
    family: fontInfo.family,
    source: fontInfo.source
  }));
  return { id };
});

ipcMain.handle('showdeck:list-fonts', async () => {
  const fontStorePath = getFontStorePath();
  await fs.mkdir(fontStorePath, { recursive: true });
  const entries = await fs.readdir(fontStorePath);
  const fonts = [];

  for (const entry of entries.filter(name => name.endsWith('.json'))) {
    const metadata = JSON.parse(await fs.readFile(path.join(fontStorePath, entry), 'utf8'));
    const { id, fileName, family, source } = metadata;
    const { dataPath } = getStoredFontPaths(id);
    fonts.push({
      id,
      fileName,
      family,
      source,
      data: new Uint8Array(await fs.readFile(dataPath))
    });
  }
  return fonts;
});

ipcMain.handle('showdeck:remove-font', async (_event, id) => {
  const { dataPath, metadataPath } = getStoredFontPaths(id);
  await Promise.all([
    fs.rm(dataPath, { force: true }),
    fs.rm(metadataPath, { force: true })
  ]);
});

ipcMain.handle('showdeck:vlc-output-open', async (event, media) => {
  const outputWindow = BrowserWindow.fromWebContents(event.sender);
  if (!outputWindow || outputWindow === mainWindow || outputWindow.isDestroyed()) {
    throw new Error('Видеовывод доступен только в окне Output.');
  }
  if (!media || typeof media !== 'object') throw new TypeError('Некорректные данные видео.');

  await vlcOutput.open(outputWindow, media);
  return { opened: true };
});

ipcMain.handle('showdeck:vlc-output-action', (event, payload) => {
  const outputWindow = BrowserWindow.fromWebContents(event.sender);
  if (!outputWindow || outputWindow === mainWindow || outputWindow.isDestroyed()) {
    throw new Error('Видеоуправление доступно только в окне Output.');
  }
  if (!payload || typeof payload !== 'object') throw new TypeError('Некорректная команда видео.');
  vlcOutput.action(payload);
  return { updated: true };
});

ipcMain.handle('showdeck:vlc-output-fullscreen', (event) => {
  const outputWindow = BrowserWindow.fromWebContents(event.sender);
  if (!outputWindow || outputWindow === mainWindow || outputWindow.isDestroyed()) {
    throw new Error('Полный экран доступен только в окне Output.');
  }
  outputWindow.setFullScreen(!outputWindow.isFullScreen());
  return { fullscreen: outputWindow.isFullScreen() };
});

ipcMain.handle('showdeck:open-project', async (event) => {
  const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
    title: 'Открыть проект ShowDeck',
    properties: ['openFile'],
    filters: [{ name: 'Проект ShowDeck', extensions: ['showdeck'] }]
  });
  if (result.canceled || result.filePaths.length === 0) return { canceled: true };

  return {
    canceled: false,
    filePath: result.filePaths[0],
    data: new Uint8Array(await fs.readFile(result.filePaths[0]))
  };
});

ipcMain.handle('showdeck:transcode-video', async (event) => {
  const parentWindow = assertMainWindow(event);
  if (activeTranscode) throw new Error('Другое видео уже перекодируется.');

  const controller = new AbortController();
  let resolveCompletion;
  const completion = new Promise(resolve => {
    resolveCompletion = resolve;
  });
  const job = { sender: event.sender, controller, completion, quitRequested: false };
  activeTranscode = job;
  let temporaryPath;

  try {
    const sourceResult = await dialog.showOpenDialog(parentWindow, {
      title: 'Выберите видео для перекодирования',
      properties: ['openFile'],
      filters: [{
        name: 'Видеофайлы',
        extensions: ['mp4', 'mov', 'm4v', 'mkv', 'avi', 'webm', 'ogv', '3gp', 'ts', 'mts', 'm2ts', 'flv', 'wmv']
      }]
    });
    if (sourceResult.canceled || sourceResult.filePaths.length === 0) return { canceled: true };

    const sourcePath = sourceResult.filePaths[0];
    const sourceName = path.basename(sourcePath, path.extname(sourcePath));
    const destinationResult = await dialog.showSaveDialog(parentWindow, {
      title: 'Сохранить перекодированное видео',
      defaultPath: `${sourceName}-H264.mp4`,
      filters: [{ name: 'Видео MP4 (H.264 + AAC)', extensions: ['mp4'] }]
    });
    if (destinationResult.canceled || !destinationResult.filePath) return { canceled: true };

    const destinationPath = path.extname(destinationResult.filePath).toLowerCase() === '.mp4'
      ? destinationResult.filePath
      : `${destinationResult.filePath}.mp4`;
    const normalizePath = value => {
      const resolved = path.resolve(value);
      return process.platform === 'win32' || process.platform === 'darwin'
        ? resolved.toLowerCase()
        : resolved;
    };
    if (normalizePath(sourcePath) === normalizePath(destinationPath)) {
      throw new Error('Выберите другое имя или папку: исходный файл не будет заменён.');
    }

    temporaryPath = path.join(
      path.dirname(destinationPath),
      `.showdeck-${randomUUID()}.partial.mp4`
    );
    if (controller.signal.aborted) return { canceled: true };
    await vlcOutput.transcode(sourcePath, temporaryPath, progress => {
      if (!event.sender.isDestroyed()) {
        event.sender.send('showdeck:transcode-progress', progress);
      }
    }, controller.signal);

    if (controller.signal.aborted) return { canceled: true };
    const data = await fs.readFile(temporaryPath);
    const hasMp4Container = data.includes(Buffer.from('ftyp')) && data.includes(Buffer.from('moov'));
    const hasH264Track = data.includes(Buffer.from('avc1')) || data.includes(Buffer.from('avc3'));
    if (!hasMp4Container || !hasH264Track) {
      throw new Error('libVLC не создал корректный MP4 с видеопотоком H.264.');
    }
    if (controller.signal.aborted) return { canceled: true };
    await moveFileReplacingDestination(temporaryPath, destinationPath);
    return {
      canceled: false,
      fileName: path.basename(destinationPath),
      data: new Uint8Array(data)
    };
  } catch (error) {
    if (error.name === 'AbortError') return { canceled: true };
    throw error;
  } finally {
    try {
      if (temporaryPath) await fs.rm(temporaryPath, { force: true });
    } finally {
      if (activeTranscode === job) activeTranscode = null;
      resolveCompletion();
    }
  }
});

ipcMain.on('showdeck:transcode-cancel', event => {
  if (activeTranscode?.sender === event.sender) activeTranscode.controller.abort();
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#0b0d10',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url === 'about:blank') {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 1280,
          height: 720,
          autoHideMenuBar: true,
          webPreferences: {
            preload: path.join(__dirname, 'preload-output.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true
          }
        }
      };
    }

    if (url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== appPage && url !== 'about:blank') {
      event.preventDefault();
    }
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => {
    activeTranscode?.controller.abort();
    mainWindow = null;
  });
  mainWindow.loadURL(appPage);
}

app.on('browser-window-created', (_event, window) => {
  if (window === mainWindow) return;
  window.on('enter-full-screen', () => {
    window.webContents.send('showdeck:vlc-output-fullscreen-changed', true);
  });
  window.on('leave-full-screen', () => {
    window.webContents.send('showdeck:vlc-output-fullscreen-changed', false);
  });
  window.on('closed', () => {
    void vlcOutput.releasePlayer().catch(error => {
      console.error('Unable to release the libVLC output player:', error);
    });
  });
});

app.whenReady().then(() => {
  registerAppProtocol();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', event => {
  if (activeTranscode) {
    event.preventDefault();
    const job = activeTranscode;
    job.controller.abort();
    if (!job.quitRequested) {
      job.quitRequested = true;
      job.completion.then(() => app.quit());
    }
    return;
  }
  void vlcOutput.dispose().catch(error => {
    console.error('Unable to dispose the libVLC output player:', error);
  });
});
