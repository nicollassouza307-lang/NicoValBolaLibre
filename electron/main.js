'use strict';

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('node:path');
const net = require('node:net');
const { autoUpdater } = require('electron-updater');

const APP_ID = 'com.nicovalbolalibre.desktop';
let mainWindow = null;
let localServer = null;
let updateDownloaded = false;
let checkingForUpdates = false;

app.setAppUserModelId(APP_ID);
process.env.NVB_APP_VERSION = app.getVersion();
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

function sendUpdateStatus(message, extra = {}) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('nvb:update-status', { message, ...extra });
  }
}

function findAvailablePort(start = 8787, attempts = 20) {
  return new Promise((resolve, reject) => {
    const tryPort = (port, left) => {
      const probe = net.createServer();
      probe.once('error', error => {
        if (error.code === 'EADDRINUSE' && left > 0) return tryPort(port + 1, left - 1);
        reject(error);
      });
      probe.listen(port, '127.0.0.1', () => {
        const address = probe.address();
        probe.close(() => resolve(address.port));
      });
    };
    tryPort(start, attempts);
  });
}

async function waitForLocalServer(port, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1200), cache: 'no-store' });
      if (response.ok) return true;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 350));
  }
  throw new Error('O servidor local não iniciou. Feche outra versão do NicoValBola e tente novamente.');
}

async function startLocalServer() {
  const serverRoot = app.isPackaged
    ? path.join(process.resourcesPath, 'app-server')
    : path.join(app.getAppPath());
  const serverFile = path.join(serverRoot, 'server.js');
  if (!require('node:fs').existsSync(serverFile)) throw new Error(`Não encontrei o servidor: ${serverFile}`);

  const port = await findAvailablePort();
  process.env.PORT = String(port);
  process.env.NO_BROWSER = '1';
  process.env.NVB_SERVER_AUTOSTART = '1';
  // O servidor é carregado no processo principal do Electron. Assim, o usuário
  // final não precisa instalar Node.js nem manter uma janela de terminal aberta.
  const loaded = require(serverFile);
  localServer = loaded.server;
  await waitForLocalServer(port);
  return `http://127.0.0.1:${port}`;
}

function configureAutoUpdater() {
  if (!app.isPackaged) return;
  const updateConfig = path.join(process.resourcesPath, 'app-update.yml');
  if (!require('node:fs').existsSync(updateConfig)) {
    setTimeout(() => sendUpdateStatus('Atualizador ainda não configurado. Publique o primeiro instalador pelo GitHub Releases para ativá-lo.'), 1800);
    return;
  }
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('checking-for-update', () => sendUpdateStatus('Verificando se existe uma nova versão…'));
  autoUpdater.on('update-available', info => sendUpdateStatus(`Nova versão ${info.version} disponível.`, { updateAvailable: true, downloadAvailable: true, version: info.version }));
  autoUpdater.on('update-not-available', info => sendUpdateStatus(`Você já está usando a versão mais recente (${info.version}).`));
  autoUpdater.on('download-progress', progress => sendUpdateStatus(`Baixando atualização: ${Math.round(progress.percent || 0)}%.`, { progress: progress.percent || 0, downloadAvailable: true }));
  autoUpdater.on('update-downloaded', info => {
    updateDownloaded = true;
    sendUpdateStatus(`Versão ${info.version} baixada. Reinicie para instalar.`, { downloaded: true });
  });
  autoUpdater.on('error', error => sendUpdateStatus(`Atualizador: ${error.message || 'falha ao verificar atualização.'}`));
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(error => sendUpdateStatus(`Não foi possível verificar atualizações: ${error.message}`));
  }, 7000);
}

function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 980,
    minHeight: 680,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0b1220',
    icon: app.isPackaged ? path.join(process.resourcesPath, 'icon.ico') : path.join(app.getAppPath(), 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    try {
      const parsed = new URL(target);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') shell.openExternal(target);
    } catch {}
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, target) => {
    if (!target.startsWith(url)) {
      event.preventDefault();
      try {
        const parsed = new URL(target);
        if (parsed.protocol === 'https:' || parsed.protocol === 'http:') shell.openExternal(target);
      } catch {}
    }
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.loadURL(url);
}

ipcMain.handle('nvb:version', () => app.getVersion());
ipcMain.handle('nvb:update-check', async () => {
  if (!app.isPackaged) return { message: 'O atualizador fica ativo na versão instalada.' };
  if (!require('node:fs').existsSync(path.join(process.resourcesPath, 'app-update.yml'))) return { message: 'Atualizador ainda não configurado. Publique o instalador pelo GitHub Releases.' };
  if (checkingForUpdates) return { message: 'A verificação já está em andamento.' };
  checkingForUpdates = true;
  try {
    const result = await autoUpdater.checkForUpdates();
    return { message: result?.updateInfo ? `Versão consultada: ${result.updateInfo.version}.` : 'Consulta concluída.' };
  } finally { checkingForUpdates = false; }
});
ipcMain.handle('nvb:update-download', async () => {
  if (!app.isPackaged) throw new Error('Disponível somente no aplicativo instalado.');
  await autoUpdater.downloadUpdate();
  return { ok: true };
});
ipcMain.handle('nvb:update-install', () => {
  if (updateDownloaded) autoUpdater.quitAndInstall(false, true);
  return { ok: updateDownloaded };
});

app.whenReady().then(async () => {
  try {
    const url = await startLocalServer();
    createWindow(url);
    configureAutoUpdater();
  } catch (error) {
    const { dialog } = require('electron');
    dialog.showErrorBox('Não foi possível abrir o NicoValBolaLibre', error.message || String(error));
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0 && localServer?.listening) {
    // Reabre no mesmo processo/servidor em sistemas que usam ciclo de janela.
    const port = localServer.address()?.port;
    if (port) createWindow(`http://127.0.0.1:${port}`);
  }
});

app.on('before-quit', () => {
  try { if (localServer?.listening) localServer.close(); } catch {}
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
