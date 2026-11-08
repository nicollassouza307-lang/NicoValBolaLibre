'use strict';

// NicoValBolaLibre shared configuration service.
// Public reads, administrator-only writes. Store this file on a persistent volume.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT || 3030);
const ADMIN_TOKEN = String(process.env.SYNC_ADMIN_TOKEN || '').trim();
const READ_TOKEN = String(process.env.SYNC_READ_TOKEN || '').trim();
const DATA_FILE = path.resolve(process.env.DATA_FILE || path.join(__dirname, '.data', 'shared-config.json'));
const MAX_BODY = 5 * 1024 * 1024;

if (ADMIN_TOKEN.length < 24 || READ_TOKEN.length < 24) {
  console.error('ERRO: defina SYNC_ADMIN_TOKEN e SYNC_READ_TOKEN com pelo menos 24 caracteres aleatórios cada.');
  process.exit(1);
}

function reply(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('Arquivo maior que o limite de 5 MB.'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch { reject(Object.assign(new Error('JSON inválido.'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function safeConfig(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Configuração inválida.');
  const stationsIn = Array.isArray(input.stations) ? input.stations.slice(0, 1000) : [];
  const stations = stationsIn.map(st => {
    const url = String(st?.url || '').trim();
    let parsed;
    try { parsed = new URL(url); } catch { return null; }
    if (parsed.protocol !== 'https:') return null;
    return {
      id: String(st.id || '').slice(0, 100),
      name: String(st.name || 'Emissora').slice(0, 80),
      url: parsed.toString().slice(0, 2000),
      broadcasterId: String(st.broadcasterId || '').slice(0, 120),
      linkedBroadcasterIds: Array.isArray(st.linkedBroadcasterIds) ? st.linkedBroadcasterIds.slice(0, 100).map(x => String(x).slice(0, 120)) : []
    };
  }).filter(Boolean);

  const sources = {};
  if (input.sources && typeof input.sources === 'object' && !Array.isArray(input.sources)) {
    for (const [eventId, list] of Object.entries(input.sources).slice(0, 3000)) {
      if (!Array.isArray(list)) continue;
      const safeItems = list.slice(0, 20).map(item => {
        let parsed;
        try { parsed = new URL(String(item?.url || '')); } catch { return null; }
        if (parsed.protocol !== 'https:') return null;
        return {
          name: String(item.name || 'Player').slice(0, 80),
          url: parsed.toString().slice(0, 2000),
          stationId: String(item.stationId || '').slice(0, 100),
          autoLinked: Boolean(item.autoLinked),
          broadcasterKey: String(item.broadcasterKey || '').slice(0, 160)
        };
      }).filter(Boolean);
      if (safeItems.length) sources[String(eventId).slice(0, 180)] = safeItems;
    }
  }

  const teamLogoOverrides = {};
  if (input.teamLogoOverrides && typeof input.teamLogoOverrides === 'object' && !Array.isArray(input.teamLogoOverrides)) {
    for (const [key, value] of Object.entries(input.teamLogoOverrides).slice(0, 1000)) {
      const url = String(value || '').trim();
      try {
        const parsed = new URL(url);
        if (parsed.protocol === 'https:') teamLogoOverrides[String(key).slice(0, 180)] = parsed.toString().slice(0, 2000);
      } catch {}
    }
  }

  return { schemaVersion: 1, stations, sources, teamLogoOverrides };
}

function loadStore() {
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return {
      revision: Number(parsed.revision || 0),
      updatedAt: String(parsed.updatedAt || ''),
      config: safeConfig(parsed.config || {})
    };
  } catch {
    return { revision: 0, updatedAt: '', config: { schemaVersion: 1, stations: [], sources: {}, teamLogoOverrides: {} } };
  }
}

let store = loadStore();

function persist(next) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const tmp = `${DATA_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2), 'utf8');
  fs.renameSync(tmp, DATA_FILE);
  store = next;
}

function tokenMatches(req, expected) {
  const header = String(req.headers.authorization || '');
  const candidate = header.startsWith('Bearer ') ? header.slice(7) : '';
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  if (req.method === 'OPTIONS') return reply(res, 204, {});
  if (req.method === 'GET' && url.pathname === '/health') {
    return reply(res, 200, { ok: true, service: 'NicoValBolaLibre Cloud Sync', revision: store.revision });
  }
  if (req.method === 'GET' && url.pathname === '/v1/config') {
    if (!tokenMatches(req, READ_TOKEN)) return reply(res, 401, { ok:false, error:'Chave de acesso compartilhada inválida.' });
    return reply(res, 200, { ok: true, revision: store.revision, updatedAt: store.updatedAt, config: store.config });
  }
  if (req.method === 'POST' && url.pathname === '/v1/publish') {
    if (!tokenMatches(req, ADMIN_TOKEN)) return reply(res, 401, { ok: false, error: 'Chave administrativa inválida.' });
    try {
      const body = await readBody(req);
      const config = safeConfig(body.config);
      const next = { revision: store.revision + 1, updatedAt: new Date().toISOString(), config };
      persist(next);
      return reply(res, 200, { ok: true, revision: next.revision, updatedAt: next.updatedAt, counts: { stations: config.stations.length, eventLinks: Object.keys(config.sources).length, teamLogos: Object.keys(config.teamLogoOverrides).length } });
    } catch (error) {
      return reply(res, error.status || 400, { ok: false, error: error.message || 'Não foi possível publicar os dados.' });
    }
  }
  return reply(res, 404, { ok: false, error: 'Rota não encontrada.' });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`NicoValBolaLibre Cloud Sync ativo na porta ${PORT}. Revisão atual: ${store.revision}.`);
});
