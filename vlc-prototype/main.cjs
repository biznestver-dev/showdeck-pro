const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const appPath = process.env.VLC_PROTOTYPE_APP_PATH;
const vlcExecutable = path.join(appPath, 'Contents', 'MacOS', 'VLC');
const pluginPath = path.join(appPath, 'Contents', 'MacOS', 'plugins');
let mainWindow;
let vlcProcess = null;
let currentFilePath = null;

function openVideo() {
  return dialog.showOpenDialog(mainWindow, {
    title: 'Выбрать видео для проверки VLC',
    properties: ['openFile'],
    filters: [{
      name: 'Видеофайлы',
      extensions: ['mp4', 'mov', 'm4v', 'mkv', 'avi', 'webm', 'wmv', 'ts', 'mts', 'm2ts', 'flv', 'ogv']
    }]
  }).then(result => {
    if (result.canceled || result.filePaths.length === 0) return { canceled: true };

    if (!fs.existsSync(vlcExecutable)) {
      throw new Error(`Не найден VLC: ${vlcExecutable}. Задайте путь через VLC_APP_PATH.`);
    }

    if (vlcProcess && vlcProcess.exitCode === null) {
      vlcProcess.kill();
      vlcProcess = null;
    }

    currentFilePath = result.filePaths[0];
    vlcProcess = spawn(vlcExecutable, [
      '--no-one-instance',
      '--no-video-title-show',
      currentFilePath
    ], {
      env: {
        ...process.env,
        VLC_PLUGIN_PATH: pluginPath
      },
      stdio: 'ignore'
    });
    const childPid = vlcProcess.pid;

    vlcProcess.once('error', error => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('vlc-prototype:error', error.message);
      }
    });
    vlcProcess.once('exit', (code, signal) => {
      if (vlcProcess?.pid === childPid) vlcProcess = null;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('vlc-prototype:exit', { code, signal });
      }
    });

    return { canceled: false, filePath: currentFilePath };
  });
}

function stopVlc() {
  if (vlcProcess && vlcProcess.exitCode === null) {
    vlcProcess.kill();
  }
  vlcProcess = null;
  return { stopped: true };
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 760,
    height: 330,
    minWidth: 620,
    minHeight: 300,
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
  if (!fs.existsSync(vlcExecutable)) {
    throw new Error(`Не найден VLC: ${vlcExecutable}. Задайте путь через VLC_APP_PATH.`);
  }
  ipcMain.handle('vlc-prototype:open', openVideo);
  ipcMain.handle('vlc-prototype:stop', stopVlc);
  createMainWindow();
}).catch(error => {
  dialog.showErrorBox('Ошибка прототипа VLC', error.stack || error.message);
  app.quit();
});

app.on('before-quit', stopVlc);
app.on('window-all-closed', () => app.quit());
