'use strict';

function getOrigin(value) {
  try { return new URL(String(value || '')).origin; }
  catch { return ''; }
}

function isHttpUrl(value) {
  try {
    const protocol = new URL(String(value || '')).protocol;
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Blocks popup windows and external top-level redirects while leaving player
 * iframe navigation alone. Links launched by the local app UI may still open
 * in the user's default browser; popups initiated by third-party player frames
 * are denied.
 */
function attachNavigationGuards(webContents, { appUrl, shell }) {
  if (!webContents || typeof webContents.setWindowOpenHandler !== 'function') {
    throw new TypeError('webContents inválido para instalar a proteção de navegação.');
  }
  const appOrigin = getOrigin(appUrl);
  if (!appOrigin) throw new TypeError('URL local do aplicativo inválida.');

  webContents.setWindowOpenHandler(details => {
    const target = String(details?.url || '');
    const referrer = String(details?.referrer?.url || '');
    const openedFromAppUi = getOrigin(referrer) === appOrigin;

    if (openedFromAppUi && isHttpUrl(target) && shell && typeof shell.openExternal === 'function') {
      Promise.resolve(shell.openExternal(target)).catch(() => {});
    }
    return { action: 'deny' };
  });

  // will-navigate is emitted for main-frame navigation only. Iframes continue
  // loading provider pages, CDNs and video resources normally.
  webContents.on('will-navigate', (event, details) => {
    const target = typeof details === 'string' ? details : details?.url;
    const isMainFrame = typeof details === 'object' ? details?.isMainFrame !== false : true;
    if (isMainFrame && getOrigin(target) !== appOrigin) event.preventDefault();
  });

  // Stop HTTP redirects that try to replace the app's top-level document.
  // Redirects inside player iframes are deliberately allowed for compatibility.
  webContents.on('will-redirect', (event, details) => {
    if (details?.isMainFrame === true && getOrigin(details.url) !== appOrigin) event.preventDefault();
  });
}

module.exports = { attachNavigationGuards, getOrigin, isHttpUrl };
