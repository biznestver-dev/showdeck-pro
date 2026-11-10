const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('showDeckVlcOutput', {
  open: (media) => ipcRenderer.invoke('showdeck:vlc-output-open', media),
  action: (payload) => ipcRenderer.invoke('showdeck:vlc-output-action', payload),
  fullscreen: () => ipcRenderer.invoke('showdeck:vlc-output-fullscreen'),
  onFullscreenChange: (callback) =>
    ipcRenderer.on('showdeck:vlc-output-fullscreen-changed', (_event, fullscreen) => callback(fullscreen))
});
