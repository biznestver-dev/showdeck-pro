const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vlcPrototype', {
  open: () => ipcRenderer.invoke('vlc-prototype:open'),
  stop: () => ipcRenderer.invoke('vlc-prototype:stop'),
  onExit: (callback) => ipcRenderer.on('vlc-prototype:exit', (_event, result) => callback(result)),
  onError: (callback) => ipcRenderer.on('vlc-prototype:error', (_event, message) => callback(message))
});
