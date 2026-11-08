'use strict';

// NicoValBolaLibre Cloudflare Worker + D1
// GET /health          public health check
// GET /v1/config       shared-read-token access (SYNC_READ_TOKEN secret)
// POST /v1/publish     admin-only write (SYNC_ADMIN_TOKEN secret)

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const EMPTY_CONFIG = { schemaVersion: 1, stations: [], sources: {}, teamLogoOverrides: {}, apiFootballData: { matches: [], standings: [] } };

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

  return { schemaVersion: 1, stations, sources, teamLogoOverrides, apiFootballData: safeApiFootballData(input.apiFootballData) };
}

function safeApiFootballData(input) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const matches = Array.isArray(source.matches) ? source.matches.slice(-80).map((match) => {
    if (!match || typeof match !== 'object' || Array.isArray(match)) return null;
    const eventId = String(match.eventId || '').slice(0, 180);
    const fixtureId = Number(match.fixtureId);
    if (!eventId || !Number.isInteger(fixtureId) || fixtureId <= 0) return null;
    const fixture = match.fixture && typeof match.fixture === 'object' ? match.fixture : {};
    const cleanTeam = (team) => ({ id: Number(team?.id || 0), name: String(team?.name || '').slice(0, 100), logo: '' });
    const lineups = Array.isArray(match.lineups) ? match.lineups.slice(0, 2).map((lineup) => ({
      team: cleanTeam(lineup?.team), formation: String(lineup?.formation || '').slice(0, 20),
      coach: { id: Number(lineup?.coach?.id || 0), name: String(lineup?.coach?.name || '').slice(0, 100) },
      startXI: (Array.isArray(lineup?.startXI) ? lineup.startXI : []).slice(0, 11).map((player) => ({
        id: Number(player?.id || 0), name: String(player?.name || '').slice(0, 100), number: Number(player?.number || 0),
        pos: String(player?.pos || '').slice(0, 12), grid: String(player?.grid || '').slice(0, 12)
      })),
      substitutes: (Array.isArray(lineup?.substitutes) ? lineup.substitutes : []).slice(0, 20).map((player) => ({
        id: Number(player?.id || 0), name: String(player?.name || '').slice(0, 100), number: Number(player?.number || 0), pos: String(player?.pos || '').slice(0, 12)
      }))
    })) : [];
    const statistics = Array.isArray(match.statistics) ? match.statistics.slice(0, 2).map((team) => ({
      team: cleanTeam(team?.team),
      values: (Array.isArray(team?.values) ? team.values : []).slice(0, 35).map((row) => ({
        type: String(row?.type || '').slice(0, 80), value: row?.value === null || row?.value === undefined ? null : String(row.value).slice(0, 40)
      }))
    })) : [];
    const events = Array.isArray(match.events) ? match.events.slice(0, 120).map((event) => ({
      time: { elapsed: event?.time?.elapsed === null || event?.time?.elapsed === undefined ? null : Number(event.time.elapsed), extra: event?.time?.extra === null || event?.time?.extra === undefined ? null : Number(event.time.extra) },
      team: cleanTeam(event?.team),
      player: { id: Number(event?.player?.id || 0), name: String(event?.player?.name || '').slice(0, 100) },
      assist: { id: Number(event?.assist?.id || 0), name: String(event?.assist?.name || '').slice(0, 100) },
      type: String(event?.type || '').slice(0, 24), detail: String(event?.detail || '').slice(0, 80), comments: String(event?.comments || '').slice(0, 160)
    })) : [];
    return {
      provider: 'API-Football', eventId, date: String(match.date || '').slice(0, 10),
      home: String(match.home || '').slice(0, 100), away: String(match.away || '').slice(0, 100), fixtureId,
      fixture: {
        date: String(fixture.date || '').slice(0, 40), status: String(fixture.status || '').slice(0, 12),
        statusLong: String(fixture.statusLong || '').slice(0, 80), elapsed: fixture.elapsed === null || fixture.elapsed === undefined ? null : (Number.isFinite(Number(fixture.elapsed)) ? Number(fixture.elapsed) : null),
        venue: String(fixture.venue || '').slice(0, 120), referee: String(fixture.referee || '').slice(0, 120),
        goals: { home: fixture.goals?.home === null || fixture.goals?.home === undefined ? null : Number(fixture.goals.home), away: fixture.goals?.away === null || fixture.goals?.away === undefined ? null : Number(fixture.goals.away) },
        score: Object.fromEntries(['halftime','fulltime','extratime','penalty'].map((part) => [part, { home: fixture.score?.[part]?.home === null || fixture.score?.[part]?.home === undefined ? null : Number(fixture.score[part].home), away: fixture.score?.[part]?.away === null || fixture.score?.[part]?.away === undefined ? null : Number(fixture.score[part].away) }])),
        league: { id: Number(fixture.league?.id || 0), name: String(fixture.league?.name || '').slice(0, 100), country: String(fixture.league?.country || '').slice(0, 80), season: Number(fixture.league?.season || 0), round: String(fixture.league?.round || '').slice(0, 100) },
        home: cleanTeam(fixture.home), away: cleanTeam(fixture.away)
      },
      lineups, statistics, events,
      detailErrors: Array.isArray(match.detailErrors) ? match.detailErrors.slice(0, 2).map(item => ({ section: String(item?.section || '').slice(0, 30), message: String(item?.message || '').slice(0, 240), code: String(item?.code || '').slice(0, 60) })) : [],
      fetchedAt: String(match.fetchedAt || new Date().toISOString()).slice(0, 40)
    };
  }).filter(Boolean) : [];
  const standings = Array.isArray(source.standings) ? source.standings.slice(-40).map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    const leagueId = Number(entry.leagueId); const season = Number(entry.season);
    if (!Number.isInteger(leagueId) || leagueId <= 0 || !Number.isInteger(season) || season <= 0) return null;
    const rows = Array.isArray(entry.rows) ? entry.rows.slice(0, 40).map((row) => ({
      rank: Number(row?.rank || 0), team: String(row?.team || '').slice(0, 100), points: Number(row?.points || 0),
      goalsDiff: Number(row?.goalsDiff || 0), played: Number(row?.played || 0), form: String(row?.form || '').slice(0, 20)
    })) : [];
    return { leagueId, season, leagueName: String(entry.leagueName || '').slice(0, 100), rows, fetchedAt: String(entry.fetchedAt || new Date().toISOString()).slice(0, 40) };
  }).filter(Boolean) : [];
  return { provider: 'API-Football', updatedAt: String(source.updatedAt || new Date().toISOString()).slice(0, 40), matches, standings };
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

    if (request.method === 'GET' && url.pathname === '/v1/provider-cache') {
      if (!hasReadAccess(request, env)) return json({ ok:false, error:'Chave compartilhada de leitura inválida.' }, 401);
      const provider = String(url.searchParams.get('provider') || '').trim().toLowerCase();
      const cacheKey = String(url.searchParams.get('key') || '').trim();
      if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(provider) || !cacheKey || cacheKey.length > 220) {
        return json({ ok:false, error:'Identificador de cache inválido.' }, 400);
      }
      try {
        const row = await env.DB.prepare('SELECT payload_json, expires_at, updated_at FROM provider_cache WHERE provider = ? AND cache_key = ?').bind(provider, cacheKey).first();
        if (!row) return json({ ok:true, hit:false });
        if (Number(row.expires_at) <= Date.now()) {
          await env.DB.prepare('DELETE FROM provider_cache WHERE provider = ? AND cache_key = ?').bind(provider, cacheKey).run();
          return json({ ok:true, hit:false, expired:true });
        }
        let data;
        try { data = JSON.parse(row.payload_json || 'null'); }
        catch { return json({ ok:false, error:'Entrada de cache corrompida.' }, 500); }
        return json({ ok:true, hit:true, record:{ data, expiresAt:Number(row.expires_at), updatedAt:String(row.updated_at || '') } });
      } catch (error) {
        return json({ ok:false, error:'Não foi possível ler o cache compartilhado. Confira se a migração provider_cache foi aplicada.' }, 503);
      }
    }

    if (request.method === 'POST' && url.pathname === '/v1/provider-cache') {
      if (!hasAdminAccess(request, env)) return json({ ok:false, error:'Chave administrativa inválida.' }, 401);
      try {
        const body = await readJson(request);
        const provider = String(body.provider || '').trim().toLowerCase();
        const cacheKey = String(body.key || '').trim();
        const ttlSeconds = Math.floor(Number(body.ttlSeconds));
        if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(provider) || !cacheKey || cacheKey.length > 220) {
          return json({ ok:false, error:'Identificador de cache inválido.' }, 400);
        }
        if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 30 * 24 * 60 * 60) {
          return json({ ok:false, error:'Validade do cache deve ficar entre 1 segundo e 30 dias.' }, 400);
        }
        if (!Object.prototype.hasOwnProperty.call(body, 'data')) return json({ ok:false, error:'O cache precisa conter o campo data.' }, 400);
        const payload = JSON.stringify(body.data);
        if (new TextEncoder().encode(payload).byteLength > 512 * 1024) return json({ ok:false, error:'A entrada individual de cache excede 512 KB.' }, 413);
        const now = Date.now();
        const expiresAt = now + ttlSeconds * 1000;
        const updatedAt = new Date(now).toISOString();
        // Limpeza oportunista para impedir que entradas expiradas ocupem o D1 indefinidamente.
        await env.DB.prepare('DELETE FROM provider_cache WHERE expires_at <= ?').bind(now).run();
        await env.DB.prepare(
          `INSERT INTO provider_cache (provider, cache_key, payload_json, expires_at, updated_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(provider, cache_key) DO UPDATE SET payload_json = excluded.payload_json, expires_at = excluded.expires_at, updated_at = excluded.updated_at`
        ).bind(provider, cacheKey, payload, expiresAt, updatedAt).run();
        return json({ ok:true, provider, key:cacheKey, expiresAt, updatedAt });
      } catch (error) {
        return json({ ok:false, error:error.message || 'Não foi possível salvar o cache compartilhado. Confira a migração provider_cache.' }, error.status || 503);
      }
    }

    if (request.method === 'GET' && url.pathname === '/v1/provider-cache/status') {
      if (!hasReadAccess(request, env)) return json({ ok:false, error:'Chave compartilhada de leitura inválida.' }, 401);
      try {
        const row = await env.DB.prepare('SELECT COUNT(*) AS entries FROM provider_cache WHERE expires_at > ?').bind(Date.now()).first();
        return json({ ok:true, entries:Number(row?.entries || 0) });
      } catch {
        return json({ ok:false, error:'Cache compartilhado ainda não foi inicializado. Aplique schema.sql atualizado.' }, 503);
      }
    }

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
        const existing = await readStore(env.DB);
        const incoming = body.config && typeof body.config === 'object' ? body.config : {};
        const incomingSports = safeApiFootballData(incoming.apiFootballData);
        const existingSports = existing.config.apiFootballData || { matches: [], standings: [] };
        const matchMap = new Map((existingSports.matches || []).map(item => [String(item.eventId), item]));
        for (const item of incomingSports.matches || []) {
          const previous = matchMap.get(String(item.eventId));
          if (!previous || String(item.fetchedAt) >= String(previous.fetchedAt)) matchMap.set(String(item.eventId), item);
        }
        const standingsMap = new Map((existingSports.standings || []).map(item => [`${item.leagueId}:${item.season}`, item]));
        for (const item of incomingSports.standings || []) {
          const key = `${item.leagueId}:${item.season}`; const previous = standingsMap.get(key);
          if (!previous || String(item.fetchedAt) >= String(previous.fetchedAt)) standingsMap.set(key, item);
        }
        incoming.apiFootballData = safeApiFootballData({
          updatedAt: new Date().toISOString(),
          matches: [...matchMap.values()].sort((a,b) => String(a.fetchedAt).localeCompare(String(b.fetchedAt))).slice(-80),
          standings: [...standingsMap.values()].sort((a,b) => String(a.fetchedAt).localeCompare(String(b.fetchedAt))).slice(-40)
        });
        const config = safeConfig(incoming);
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


    if (request.method === 'POST' && url.pathname === '/v1/sports-data') {
      if (!hasAdminAccess(request, env)) return json({ ok: false, error: 'Chave administrativa inválida.' }, 401);
      try {
        const body = await readJson(request);
        const existing = await readStore(env.DB);
        const current = existing.config.apiFootballData || { matches: [], standings: [] };
        const incoming = safeApiFootballData({ matches: body.match ? [body.match] : [], standings: body.standings ? [body.standings] : [] });
        if (!incoming.matches.length && !incoming.standings.length) return json({ ok: false, error: 'Nenhum snapshot estatístico válido foi enviado.' }, 400);
        const matchMap = new Map((current.matches || []).map(item => [String(item.eventId), item]));
        for (const item of incoming.matches) matchMap.set(String(item.eventId), item);
        const standingsMap = new Map((current.standings || []).map(item => [`${item.leagueId}:${item.season}`, item]));
        for (const item of incoming.standings) standingsMap.set(`${item.leagueId}:${item.season}`, item);
        const merged = safeApiFootballData({
          updatedAt: new Date().toISOString(),
          matches: [...matchMap.values()].sort((a, b) => String(a.fetchedAt).localeCompare(String(b.fetchedAt))).slice(-80),
          standings: [...standingsMap.values()].sort((a, b) => String(a.fetchedAt).localeCompare(String(b.fetchedAt))).slice(-40)
        });
        const config = safeConfig({ ...existing.config, apiFootballData: merged });
        const updatedAt = new Date().toISOString();
        await env.DB.prepare(
          `UPDATE shared_config SET revision = revision + 1, updated_at = ?, config_json = ? WHERE id = 1`
        ).bind(updatedAt, JSON.stringify(config)).run();
        const saved = await readStore(env.DB);
        return json({ ok: true, revision: saved.revision, updatedAt, counts: { matches: merged.matches.length, standings: merged.standings.length } });
      } catch (error) {
        return json({ ok: false, error: error.message || 'Não foi possível compartilhar os dados esportivos.' }, error.status || 400);
      }
    }

    return json({ ok: false, error: 'Rota não encontrada.' }, 404);
  }
};
