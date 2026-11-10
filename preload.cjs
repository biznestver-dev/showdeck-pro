const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('showDeckDesktop', {
  saveProject: (data, suggestedName) =>
    ipcRenderer.invoke('showdeck:save-project', data, suggestedName),
  openProject: () => ipcRenderer.invoke('showdeck:open-project')
});
