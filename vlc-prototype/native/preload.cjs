const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vlcNative', {
  open: () => ipcRenderer.invoke('vlc-native:open'),
  play: () => ipcRenderer.invoke('vlc-native:play'),
  pause: () => ipcRenderer.invoke('vlc-native:pause'),
  stop: () => ipcRenderer.invoke('vlc-native:stop'),
  seek: timeMs => ipcRenderer.invoke('vlc-native:seek', timeMs),
  volume: volume => ipcRenderer.invoke('vlc-native:volume', volume),
  fullscreen: () => ipcRenderer.invoke('vlc-native:fullscreen'),
  status: () => ipcRenderer.invoke('vlc-native:status'),
  onState: callback => ipcRenderer.on('vlc-native:state', (_event, state) => callback(state))
});
