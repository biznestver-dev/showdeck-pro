const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('showDeckDesktop', {
  saveProject: (data, suggestedName) =>
    ipcRenderer.invoke('showdeck:save-project', data, suggestedName),
  openProject: () => ipcRenderer.invoke('showdeck:open-project'),
  saveFont: (data, fontInfo) =>
    ipcRenderer.invoke('showdeck:save-font', data, fontInfo),
  listFonts: () => ipcRenderer.invoke('showdeck:list-fonts'),
  removeFont: (id) => ipcRenderer.invoke('showdeck:remove-font', id),
  transcodeVideo: () => ipcRenderer.invoke('showdeck:transcode-video'),
  cancelTranscode: () => ipcRenderer.send('showdeck:transcode-cancel'),
  onTranscodeProgress: (callback) => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on('showdeck:transcode-progress', listener);
    return () => ipcRenderer.removeListener('showdeck:transcode-progress', listener);
  }
});
