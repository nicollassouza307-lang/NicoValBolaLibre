'use strict';

const { normalizeTeamName } = require('./apifootball-service');

const API_BASE = 'https://api.football-data.org/v4';
const DEFAULT_TTL = Object.freeze({ competitions: 12 * 60 * 60 * 1000, matches: 30 * 60 * 1000, standings: 6 * 60 * 60 * 1000 });

function isoDate(value) {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const parsed = new Date(`${text}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === text;
}

function addDays(date, days) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function localMatchDate(utcDate, timeZone = 'America/Sao_Paulo') {
  const parsed = new Date(utcDate);
  if (!Number.isFinite(parsed.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(parsed);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function cleanCompetition(item) {
  return {
    id: Number(item?.id || 0),
    name: String(item?.name || '').slice(0, 120),
    code: String(item?.code || '').slice(0, 12).toUpperCase(),
    type: String(item?.type || '').slice(0, 24).toUpperCase(),
    area: { name: String(item?.area?.name || '').slice(0, 80), code: String(item?.area?.code || '').slice(0, 8).toUpperCase() },
    currentSeason: item?.currentSeason ? {
      startDate: String(item.currentSeason.startDate || '').slice(0, 10),
      endDate: String(item.currentSeason.endDate || '').slice(0, 10),
      currentMatchday: Number(item.currentSeason.currentMatchday || 0) || null
    } : null
  };
}

function cleanMatch(item) {
  const score = item?.score || {};
  const pair = value => ({
    home: value?.home === null || value?.home === undefined || value?.home === '' ? null : (Number.isFinite(Number(value.home)) ? Number(value.home) : null),
    away: value?.away === null || value?.away === undefined || value?.away === '' ? null : (Number.isFinite(Number(value.away)) ? Number(value.away) : null)
  });
  return {
    id: Number(item?.id || 0),
    utcDate: String(item?.utcDate || ''),
    status: String(item?.status || '').slice(0, 24).toUpperCase(),
    minute: Number(item?.minute || 0) || null,
    competition: cleanCompetition(item?.competition),
    season: item?.season ? { startDate: String(item.season.startDate || '').slice(0, 10), endDate: String(item.season.endDate || '').slice(0, 10), currentMatchday: Number(item.season.currentMatchday || 0) || null } : null,
    homeTeam: { id: Number(item?.homeTeam?.id || 0), name: String(item?.homeTeam?.name || '').slice(0, 120), shortName: String(item?.homeTeam?.shortName || '').slice(0, 80), tla: String(item?.homeTeam?.tla || '').slice(0, 8) },
    awayTeam: { id: Number(item?.awayTeam?.id || 0), name: String(item?.awayTeam?.name || '').slice(0, 120), shortName: String(item?.awayTeam?.shortName || '').slice(0, 80), tla: String(item?.awayTeam?.tla || '').slice(0, 8) },
    score: {
      winner: String(score.winner || '').slice(0, 16),
      duration: String(score.duration || '').slice(0, 24),
      fullTime: pair(score.fullTime),
      halfTime: pair(score.halfTime),
      regularTime: pair(score.regularTime),
      penalties: pair(score.penalties)
    },
    matchday: Number(item?.matchday || 0) || null,
    stage: String(item?.stage || '').slice(0, 32),
    group: String(item?.group || '').slice(0, 40),
    lastUpdated: String(item?.lastUpdated || '')
  };
}

function cleanStandingRows(payload) {
  const groups = Array.isArray(payload?.standings) ? payload.standings : [];
  const total = groups.find(item => String(item?.type || '').toUpperCase() === 'TOTAL') || groups[0] || null;
  return {
    competition: cleanCompetition(payload?.competition),
    season: payload?.season ? { startDate: String(payload.season.startDate || '').slice(0, 10), endDate: String(payload.season.endDate || '').slice(0, 10), currentMatchday: Number(payload.season.currentMatchday || 0) || null } : null,
    type: String(total?.type || '').slice(0, 16),
    group: String(total?.group || '').slice(0, 40),
    table: (Array.isArray(total?.table) ? total.table : []).slice(0, 40).map(row => ({
      position: Number(row?.position || 0),
      team: String(row?.team?.name || '').slice(0, 120),
      played: Number(row?.playedGames || 0),
      won: Number(row?.won || 0),
      draw: Number(row?.draw || 0),
      lost: Number(row?.lost || 0),
      goalsFor: Number(row?.goalsFor || 0),
      goalsAgainst: Number(row?.goalsAgainst || 0),
      goalDifference: Number(row?.goalDifference || 0),
      points: Number(row?.points || 0)
    }))
  };
}

class FootballDataService {
  constructor(options = {}) {
    this.getToken = options.getToken || (() => process.env.NVB_FOOTBALL_DATA_TOKEN || '');
    this.fetchImpl = options.fetchImpl || globalThis.fetch;
    this.engine = options.engine || null;
    this.now = options.now || (() => Date.now());
    this.timeZone = options.timeZone || 'America/Sao_Paulo';
    this.ttl = { ...DEFAULT_TTL, ...(options.ttl || {}) };
    if (typeof this.fetchImpl !== 'function') throw new Error('Este Node.js não oferece fetch nativo.');
  }

  isConfigured() {
    return Boolean(String(this.getToken() || '').trim());
  }

  async request(path, options = {}) {
    const cacheKey = String(options.cacheKey || '').trim();
    if (!options.force && cacheKey && this.engine) {
      const cached = this.engine.get('football-data', cacheKey);
      if (cached) return { data: cached, cached: true, record: this.engine.getRecord('football-data', cacheKey) };
    }
    const token = String(this.getToken() || '').trim();
    if (!token) throw Object.assign(new Error('Token do football-data.org não configurado neste computador e não há dados compartilhados em cache.'), { status: 503, code: 'FOOTBALL_DATA_NOT_CONFIGURED' });

    if (this.engine) this.engine.reserveRequest('football-data', { perMinuteLimit: 8, countDaily: false });

    let response;
    try {
      response = await this.fetchImpl(`${API_BASE}${path}`, {
        method: 'GET',
        headers: { 'X-Auth-Token': token, 'Accept': 'application/json' },
        signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(12000) : undefined,
        cache: 'no-store'
      });
    } catch (error) {
      if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
        throw Object.assign(new Error('A conexão com football-data.org demorou demais. Confira a internet e tente novamente.'), { status: 504, code: 'FOOTBALL_DATA_TIMEOUT' });
      }
      throw Object.assign(new Error(`Não foi possível alcançar football-data.org: ${error.message || 'erro de rede'}`), { status: 502, code: 'FOOTBALL_DATA_NETWORK' });
    }

    let payload = {};
    try { payload = await response.json(); } catch {}
    if (!response.ok) {
      const messages = {
        401: 'Token não reconhecido. Confira se você copiou o token completo.',
        403: 'Sua conta não tem acesso a essa competição ou recurso no plano atual.',
        404: 'A classificação não está disponível para esta competição ou temporada.',
        429: 'Limite de 10 chamadas por minuto do football-data.org atingido. Aguarde um pouco e tente novamente.'
      };
      const message = messages[response.status] || `football-data.org respondeu com HTTP ${response.status}.`;
      throw Object.assign(new Error(message), { status: response.status, code: `FOOTBALL_DATA_HTTP_${response.status}` });
    }

    if (cacheKey && this.engine) {
      const ttlMs = Math.max(1000, Number(options.ttlMs || this.ttl.matches));
      this.engine.set('football-data', cacheKey, payload, ttlMs);
    }
    return { data: payload, cached: false, record: cacheKey && this.engine ? this.engine.getRecord('football-data', cacheKey) : null, response };
  }

  async testConnection() {
    const result = await this.request('/competitions', { force: true, cacheKey: 'competitions:v1', ttlMs: this.ttl.competitions });
    const competitions = (Array.isArray(result.data?.competitions) ? result.data.competitions : []).map(cleanCompetition).filter(item => item.code && item.name);
    return {
      ok: true,
      provider: 'football-data.org',
      competitionsCount: Number(result.data?.count ?? competitions.length),
      competitions,
      authenticatedClient: result.response?.headers?.get?.('X-Authenticated-Client') || null,
      requestsAvailableMinute: Number(result.response?.headers?.get?.('X-Requests-Available-Minute') || 0) || null,
      requestCounterResetSeconds: Number(result.response?.headers?.get?.('X-RequestCounter-Reset') || 0) || null,
      cached: false,
      keyNeverSentToBrowser: true
    };
  }

  async getCompetitions(options = {}) {
    const result = await this.request('/competitions', { cacheKey: 'competitions:v1', ttlMs: this.ttl.competitions, force: Boolean(options.force) });
    const competitions = (Array.isArray(result.data?.competitions) ? result.data.competitions : []).map(cleanCompetition).filter(item => item.code && item.name);
    return { competitions, count: Number(result.data?.count ?? competitions.length), cached: result.cached, record: result.record };
  }

  async getMatchesForDate(date, options = {}) {
    if (!isoDate(date)) throw Object.assign(new Error('Data inválida. Use o formato AAAA-MM-DD.'), { status: 400, code: 'FOOTBALL_DATA_INVALID_DATE' });
    const dateFrom = addDays(date, -1);
    const dateTo = addDays(date, 1);
    const query = new URLSearchParams({ dateFrom, dateTo });
    const result = await this.request(`/matches?${query}`, { cacheKey: `matches:${date}:v1`, ttlMs: this.ttl.matches, force: Boolean(options.force) });
    const matches = (Array.isArray(result.data?.matches) ? result.data.matches : []).map(cleanMatch).filter(item => item.id && item.utcDate && item.homeTeam.name && item.awayTeam.name);
    return { date, dateFrom, dateTo, matches, competitions: [...new Map(matches.map(item => [item.competition.code, item.competition])).values()], count: matches.length, cached: result.cached, record: result.record };
  }

  async getStandings(competitionCode, options = {}) {
    const code = String(competitionCode || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{2,8}$/.test(code)) throw Object.assign(new Error('Código de competição inválido.'), { status: 400, code: 'FOOTBALL_DATA_INVALID_COMPETITION' });
    const competitions = await this.getCompetitions();
    const selected = competitions.competitions.find(item => item.code === code);
    if (!selected) throw Object.assign(new Error('Sua conta não tem acesso a essa competição no football-data.org.'), { status: 403, code: 'FOOTBALL_DATA_COMPETITION_NOT_AVAILABLE' });
    if (selected.type !== 'LEAGUE') throw Object.assign(new Error('Esta competição não oferece uma classificação de liga neste recurso.'), { status: 400, code: 'FOOTBALL_DATA_STANDINGS_UNAVAILABLE' });
    const result = await this.request(`/competitions/${encodeURIComponent(code)}/standings`, {
      cacheKey: `standings:${code}:current:v1`, ttlMs: this.ttl.standings, force: Boolean(options.force)
    });
    return { ...cleanStandingRows(result.data), cached: result.cached, record: result.record };
  }

  static localDate(utcDate, timeZone = 'America/Sao_Paulo') {
    return localMatchDate(utcDate, timeZone);
  }

  static matchesForAgenda(events, providerMatches, timeZone = 'America/Sao_Paulo') {
    const index = new Map();
    for (const match of Array.isArray(providerMatches) ? providerMatches : []) {
      const date = localMatchDate(match.utcDate, timeZone);
      const home = normalizeTeamName(match.homeTeam?.name || '');
      const away = normalizeTeamName(match.awayTeam?.name || '');
      if (!date || !home || !away) continue;
      const key = `${date}|${home}|${away}`;
      const candidates = index.get(key) || [];
      candidates.push(match);
      index.set(key, candidates);
    }
    const matched = [];
    const seenEventIds = new Set();
    for (const event of Array.isArray(events) ? events.slice(0, 500) : []) {
      const eventId = String(event?.id || '').slice(0, 180);
      const date = String(event?.dateEvent || '').slice(0, 10);
      const home = normalizeTeamName(event?.home || '');
      const away = normalizeTeamName(event?.away || '');
      if (!eventId || seenEventIds.has(eventId) || !isoDate(date) || !home || !away) continue;
      seenEventIds.add(eventId);
      const candidates = index.get(`${date}|${home}|${away}`) || [];
      // Se mais de uma competição fornecer o mesmo confronto no mesmo dia, não escolhe por acaso.
      if (candidates.length === 1) matched.push({ eventId, match: candidates[0] });
    }
    return matched;
  }
}

module.exports = { FootballDataService, API_BASE, DEFAULT_TTL, cleanCompetition, cleanMatch, cleanStandingRows, localMatchDate, isoDate };
