'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nvbDesktop', {
  isDesktop: true,
  version: process.versions.electron ? 'Desktop' : 'Web',
  checkForUpdates: () => ipcRenderer.invoke('nvb:update-check'),
  downloadUpdate: () => ipcRenderer.invoke('nvb:update-download'),
  installUpdate: () => ipcRenderer.invoke('nvb:update-install'),
  onUpdateStatus: callback => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('nvb:update-status', listener);
    return () => ipcRenderer.removeListener('nvb:update-status', listener);
  }
});
