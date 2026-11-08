'use strict';

const assert = require('node:assert/strict');
const { attachNavigationGuards } = require('../electron/navigation-guard');

const listeners = new Map();
let popupHandler;
const openedExternal = [];
const webContents = {
  setWindowOpenHandler(handler) { popupHandler = handler; },
  on(name, handler) { listeners.set(name, handler); }
};
const shell = { openExternal: async url => { openedExternal.push(url); } };
const appUrl = 'http://127.0.0.1:8787';
attachNavigationGuards(webContents, { appUrl, shell });

assert.equal(popupHandler({
  url: 'https://ad.example/popup',
  referrer: { url: 'https://player.example/embed/123' }
}).action, 'deny');
assert.deepEqual(openedExternal, [], 'Pop-up iniciado pelo player não pode abrir no sistema.');

assert.equal(popupHandler({
  url: 'https://docs.example/source',
  referrer: { url: `${appUrl}/` }
}).action, 'deny');
assert.deepEqual(openedExternal, ['https://docs.example/source'], 'Link externo da interface pode abrir no navegador padrão.');

let prevented = false;
listeners.get('will-navigate')({ preventDefault() { prevented = true; } }, {
  url: 'https://ad.example/landing', isMainFrame: true
});
assert.equal(prevented, true, 'Navegação externa da janela principal deve ser bloqueada.');

prevented = false;
listeners.get('will-navigate')({ preventDefault() { prevented = true; } }, {
  url: `${appUrl}/match/1`, isMainFrame: true
});
assert.equal(prevented, false, 'Navegação interna do aplicativo deve continuar permitida.');

prevented = false;
listeners.get('will-redirect')({ preventDefault() { prevented = true; } }, {
  url: 'https://ad.example/landing', isMainFrame: true
});
assert.equal(prevented, true, 'Redirecionamento externo da janela principal deve ser bloqueado.');

prevented = false;
listeners.get('will-redirect')({ preventDefault() { prevented = true; } }, {
  url: 'https://video-cdn.example/stream.m3u8', isMainFrame: false
});
assert.equal(prevented, false, 'Redirecionamentos internos do iframe do player devem continuar permitidos.');

console.log('PASSOU: pop-ups de terceiros são negados; links da interface preservados; redirecionamentos externos do frame principal bloqueados; navegação do iframe do player preservada.');
