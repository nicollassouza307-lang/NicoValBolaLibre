'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nvbDesktop', {
  isDesktop: true,
  version: process.versions.electron ? 'Desktop' : 'Web',
  getVersion: () => ipcRenderer.invoke('nvb:version'),
  checkForUpdates: () => ipcRenderer.invoke('nvb:update-check'),
  downloadUpdate: () => ipcRenderer.invoke('nvb:update-download'),
  installUpdate: () => ipcRenderer.invoke('nvb:update-install'),
  getFootballDataTokenStatus: () => ipcRenderer.invoke('nvb:football-data-token-status'),
  saveFootballDataToken: token => ipcRenderer.invoke('nvb:football-data-token-save', token),
  clearFootballDataToken: () => ipcRenderer.invoke('nvb:football-data-token-clear'),
  getApiFootballKeyStatus: () => ipcRenderer.invoke('nvb:apifootball-key-status'),
  saveApiFootballKey: key => ipcRenderer.invoke('nvb:apifootball-key-save', key),
  clearApiFootballKey: () => ipcRenderer.invoke('nvb:apifootball-key-clear'),
  onUpdateStatus: callback => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('nvb:update-status', listener);
    return () => ipcRenderer.removeListener('nvb:update-status', listener);
  }
});
