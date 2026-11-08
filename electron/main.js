'use strict';

const { app, BrowserWindow, ipcMain, shell, safeStorage } = require('electron');
const path = require('node:path');
const net = require('node:net');
const { autoUpdater } = require('electron-updater');
const { attachNavigationGuards } = require('./navigation-guard');

const APP_ID = 'com.nicovalbolalibre.desktop';
let mainWindow = null;
let localServer = null;
let updateDownloaded = false;
let checkingForUpdates = false;
let apiFootballKeyEncryptedAtRest = false;

function apiFootballKeyPath() {
  return path.join(app.getPath('userData'), 'apifootball-key.bin');
}

function loadEncryptedApiFootballKey() {
  try {
    const file = apiFootballKeyPath();
    if (!require('node:fs').existsSync(file) || !safeStorage.isEncryptionAvailable()) {
      apiFootballKeyEncryptedAtRest = false;
      return false;
    }
    const encrypted = require('node:fs').readFileSync(file);
    const key = safeStorage.decryptString(encrypted).trim();
    if (key) process.env.NVB_APIFOOTBALL_KEY = key;
    apiFootballKeyEncryptedAtRest = Boolean(key);
    return Boolean(key);
  } catch (error) {
    console.error('Não foi possível carregar a chave local da API-Football:', error.message);
    return false;
  }
}

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

  attachNavigationGuards(mainWindow.webContents, { appUrl: url, shell });
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

ipcMain.handle('nvb:apifootball-key-status', () => {
  const configured = Boolean(String(process.env.NVB_APIFOOTBALL_KEY || '').trim());
  return { configured, encryptedAtRest: configured && apiFootballKeyEncryptedAtRest };
});
ipcMain.handle('nvb:apifootball-key-save', (_event, rawKey) => {
  const key = String(rawKey || '').trim();
  if (!/^[A-Za-z0-9_-]{20,128}$/.test(key)) throw new Error('A chave parece inválida. Confira se você copiou a API Key completa do painel da API-Football.');
  if (!safeStorage.isEncryptionAvailable()) throw new Error('O Windows não disponibilizou a criptografia segura do sistema. A chave não foi salva.');
  const fs = require('node:fs');
  const file = apiFootballKeyPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const encrypted = safeStorage.encryptString(key);
  fs.writeFileSync(file, encrypted, { mode: 0o600 });
  process.env.NVB_APIFOOTBALL_KEY = key;
  apiFootballKeyEncryptedAtRest = true;
  return { ok: true, configured: true, encryptedAtRest: true };
});
ipcMain.handle('nvb:apifootball-key-clear', () => {
  try { require('node:fs').rmSync(apiFootballKeyPath(), { force: true }); } catch {}
  delete process.env.NVB_APIFOOTBALL_KEY;
  apiFootballKeyEncryptedAtRest = false;
  return { ok: true, configured: false, encryptedAtRest: false };
});

app.whenReady().then(async () => {
  try {
    // Segredos e cache da API ficam no perfil local do Windows, nunca na pasta do app/GitHub.
    process.env.NVB_USER_DATA_DIR = app.getPath('userData');
    loadEncryptedApiFootballKey();
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
