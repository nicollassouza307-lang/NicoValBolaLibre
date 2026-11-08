'use strict';

// NicoValBolaLibre Cloudflare Worker + D1
// GET /health          public health check
// GET /v1/config       shared-read-token access (SYNC_READ_TOKEN secret)
// POST /v1/publish     admin-only write (SYNC_ADMIN_TOKEN secret)

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const EMPTY_CONFIG = { schemaVersion: 1, stations: [], sources: {}, teamLogoOverrides: {} };

function json(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      ...extraHeaders
    }
  });
}

function constantTimeEqual(a, b) {
  const left = new TextEncoder().encode(String(a));
  const right = new TextEncoder().encode(String(b));
  let diff = left.length ^ right.length;
  const size = Math.max(left.length, right.length);
  for (let i = 0; i < size; i++) diff |= (left[i] || 0) ^ (right[i] || 0);
  return diff === 0;
}

function bearerToken(request) {
  const authorization = request.headers.get('Authorization') || '';
  return authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
}

function hasReadAccess(request, env) {
  const expected = String(env.SYNC_READ_TOKEN || '');
  return expected.length >= 32 && constantTimeEqual(bearerToken(request), expected);
}

function hasAdminAccess(request, env) {
  const expected = String(env.SYNC_ADMIN_TOKEN || '');
  return expected.length >= 32 && constantTimeEqual(bearerToken(request), expected);
}

function cleanHttpsUrl(value, maxLength = 2000) {
  try {
    const parsed = new URL(String(value || '').trim());
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return '';
    return parsed.toString().slice(0, maxLength);
  } catch {
    return '';
  }
}

function safeConfig(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Configuração inválida.');
  }

  const stationsIn = Array.isArray(input.stations) ? input.stations.slice(0, 1000) : [];
  const stations = stationsIn.map((station) => {
    if (!station || typeof station !== 'object' || Array.isArray(station)) return null;
    const url = cleanHttpsUrl(station.url);
    if (!url) return null;
    return {
      id: String(station.id || '').slice(0, 100),
      name: String(station.name || 'Emissora').slice(0, 80),
      url,
      broadcasterId: String(station.broadcasterId || '').slice(0, 120),
      linkedBroadcasterIds: Array.isArray(station.linkedBroadcasterIds)
        ? station.linkedBroadcasterIds.slice(0, 100).map((item) => String(item).slice(0, 120))
        : []
    };
  }).filter(Boolean);

  const sources = {};
  if (input.sources && typeof input.sources === 'object' && !Array.isArray(input.sources)) {
    for (const [eventId, items] of Object.entries(input.sources).slice(0, 3000)) {
      if (!Array.isArray(items)) continue;
      const safeItems = items.slice(0, 20).map((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
        const url = cleanHttpsUrl(item.url);
        if (!url) return null;
        return {
          name: String(item.name || 'Player').slice(0, 80),
          url,
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
      const url = cleanHttpsUrl(value);
      if (url) teamLogoOverrides[String(key).slice(0, 180)] = url;
    }
  }

  return { schemaVersion: 1, stations, sources, teamLogoOverrides };
}

async function readStore(db) {
  const row = await db.prepare(
    'SELECT revision, updated_at, config_json FROM shared_config WHERE id = 1'
  ).first();
  if (!row) return { revision: 0, updatedAt: '', config: EMPTY_CONFIG };
  let config = EMPTY_CONFIG;
  try { config = safeConfig(JSON.parse(row.config_json || '{}')); } catch { /* use empty config on corrupt row */ }
  return {
    revision: Number(row.revision || 0),
    updatedAt: String(row.updated_at || ''),
    config
  };
}

async function readJson(request) {
  const contentLength = Number(request.headers.get('Content-Length') || 0);
  if (contentLength > MAX_BODY_BYTES) throw Object.assign(new Error('O arquivo excede o limite de 2 MB.'), { status: 413 });
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    throw Object.assign(new Error('O arquivo excede o limite de 2 MB.'), { status: 413 });
  }
  try { return JSON.parse(text || '{}'); }
  catch { throw Object.assign(new Error('JSON inválido.'), { status: 400 }); }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return json({}, 204);

    if (request.method === 'GET' && url.pathname === '/health') {
      if (!env.DB) return json({ ok: false, error: 'Banco D1 não conectado. Adicione o binding DB.' }, 503);
      try {
        const store = await readStore(env.DB);
        return json({ ok: true, service: 'NicoValBolaLibre Cloud Sync', revision: store.revision });
      } catch {
        return json({ ok: false, error: 'Não foi possível acessar o banco D1.' }, 503);
      }
    }

    if (!env.DB) return json({ ok: false, error: 'Banco D1 não conectado. Adicione o binding DB.' }, 503);

    if (request.method === 'GET' && url.pathname === '/v1/config') {
      if (!hasReadAccess(request, env)) {
        return json({ ok: false, error: 'Chave compartilhada de leitura inválida.' }, 401);
      }
      try {
        const store = await readStore(env.DB);
        return json({ ok: true, revision: store.revision, updatedAt: store.updatedAt, config: store.config });
      } catch {
        return json({ ok: false, error: 'Não foi possível ler a configuração compartilhada.' }, 503);
      }
    }

    if (request.method === 'POST' && url.pathname === '/v1/publish') {
      if (!hasAdminAccess(request, env)) {
        return json({ ok: false, error: 'Chave administrativa inválida.' }, 401);
      }
      try {
        const body = await readJson(request);
        const config = safeConfig(body.config);
        const updatedAt = new Date().toISOString();
        await env.DB.prepare(
          `UPDATE shared_config
             SET revision = revision + 1,
                 updated_at = ?,
                 config_json = ?
           WHERE id = 1`
        ).bind(updatedAt, JSON.stringify(config)).run();
        const current = await readStore(env.DB);
        return json({
          ok: true,
          revision: current.revision,
          updatedAt: current.updatedAt,
          counts: {
            stations: config.stations.length,
            eventLinks: Object.keys(config.sources).length,
            teamLogos: Object.keys(config.teamLogoOverrides).length
          }
        });
      } catch (error) {
        return json({ ok: false, error: error.message || 'Não foi possível publicar os dados.' }, error.status || 400);
      }
    }

    return json({ ok: false, error: 'Rota não encontrada.' }, 404);
  }
};
