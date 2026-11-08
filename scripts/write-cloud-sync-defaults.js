#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const url = String(process.env.NVB_SYNC_URL || 'https://nicoval-sync.tracker-mps.workers.dev').trim().replace(/\/+$/, '');
const readToken = String(process.env.NVB_SYNC_READ_TOKEN || '').trim();

if (!/^https:\/\//i.test(url)) {
  throw new Error('NVB_SYNC_URL precisa ser um endereço HTTPS.');
}
if (readToken.length < 32) {
  throw new Error('Secret NVB_SYNC_READ_TOKEN ausente ou muito curta. Cadastre no GitHub: Settings > Secrets and variables > Actions.');
}

const target = path.join(__dirname, '..', 'build', 'cloud-sync-defaults.json');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, JSON.stringify({ url, readToken }, null, 2) + '\n', 'utf8');
console.log('Configuração de sincronização somente-leitura preparada para o instalador.');
