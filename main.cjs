const { app, BrowserWindow, dialog, ipcMain, net, protocol, shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

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
    mainWindow = null;
  });
  mainWindow.loadURL(appPage);
}

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
