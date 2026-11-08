'use strict';

const fs = require('node:fs');
const path = require('node:path');

const API_BASE = 'https://v3.football.api-sports.io';
const TIME_ZONE = 'America/Sao_Paulo';
const DAILY_SOFT_LIMIT = 70;
const RESERVED_DAILY_QUOTA = 30;
const MINUTE_SOFT_LIMIT = 8;

const TEAM_ALIASES = new Map(Object.entries({
  'atletico mg': 'atletico mineiro', 'atletico mineiro': 'atletico mineiro', 'athletico mineiro': 'atletico mineiro',
  'atletico pr': 'athletico paranaense', 'athletico paranaense': 'athletico paranaense',
  'sport recife': 'sport recife', 'sport club do recife': 'sport recife',
  'gremio': 'gremio', 'gremio fbpa': 'gremio', 'gremio foot ball porto alegrense': 'gremio',
  'internacional': 'internacional', 'sc internacional': 'internacional', 'internacional rs': 'internacional',
  'man utd': 'manchester united', 'manchester utd': 'manchester united', 'man united': 'manchester united',
  'man city': 'manchester city', 'internazionale': 'inter', 'inter milan': 'inter', 'inter milano': 'inter',
  'ac milan': 'milan', 'a c milan': 'milan', 'paris saint germain': 'paris saint germain', 'psg': 'paris saint germain',
  'atletico madrid': 'atletico madrid', 'atletico de madrid': 'atletico madrid',
  'real sociedad': 'real sociedad', 'real sociedad san sebastian': 'real sociedad',
  'newcastle utd': 'newcastle united', 'tottenham hotspur': 'tottenham',
  'bayern munchen': 'bayern munich',
  'red bull leipzig': 'rb leipzig', 'rb leipzig': 'rb leipzig',
  'club brugge': 'club brugge', 'brugge': 'club brugge'
}));

function normalizeTeamName(value) {
  let key = String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  key = key.replace(/\b(football club|soccer club|club de futebol|futebol clube|fc|cf|sc|ec|ac|as|ssc|ss|afc|rcd|ud|cd|ca)\b/g, ' ')
    .replace(/\s+/g, ' ').trim();
  return TEAM_ALIASES.get(key) || key;
}

function asArray(value) { return Array.isArray(value) ? value : []; }
function isObject(value) { return Boolean(value && typeof value === 'object' && !Array.isArray(value)); }
function utcDay(now = Date.now()) { return new Date(now).toISOString().slice(0, 10); }

class ApiFootballService {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || API_BASE;
    this.getApiKey = options.getApiKey || (() => '');
    this.fetch = options.fetch || globalThis.fetch;
    this.now = options.now || (() => Date.now());
    this.dataDir = options.dataDir || path.join(process.cwd(), '.nvb-data');
    this.usageFile = path.join(this.dataDir, 'apifootball-usage.json');
    this.cacheFile = path.join(this.dataDir, 'apifootball-cache.json');
    this.usage = this.loadJson(this.usageFile, { day: utcDay(this.now()), used: 0, providerRemaining: null, providerLimit: null, minuteCalls: [] });
    this.cache = new Map(Object.entries(this.loadJson(this.cacheFile, {})));
    this.persistDebounce = null;
  }

  loadJson(file, fallback) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch { return fallback; }
  }

  ensureDataDir() { fs.mkdirSync(this.dataDir, { recursive: true }); }

  saveJson(file, value) {
    this.ensureDataDir();
    const temporary = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(value), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(temporary, file);
  }

  persistUsage() { this.saveJson(this.usageFile, this.usage); }
  persistCache() {
    const now = this.now();
    const stored = {};
    for (const [key, value] of this.cache.entries()) {
      if (value && value.expiresAt > now) stored[key] = value;
    }
    this.saveJson(this.cacheFile, stored);
  }

  getUsage() {
    const today = utcDay(this.now());
    if (this.usage.day !== today) {
      this.usage = { day: today, used: 0, providerRemaining: null, providerLimit: null, minuteCalls: [] };
      this.persistUsage();
    }
    const cutoff = this.now() - 60_000;
    this.usage.minuteCalls = asArray(this.usage.minuteCalls).filter(time => Number(time) >= cutoff);
    const providerRemaining = this.usage.providerRemaining !== null && this.usage.providerRemaining !== undefined && Number.isFinite(Number(this.usage.providerRemaining)) ? Number(this.usage.providerRemaining) : null;
    const providerSafeRemaining = providerRemaining === null ? null : Math.max(0, providerRemaining - RESERVED_DAILY_QUOTA);
    const localRemaining = Math.max(0, DAILY_SOFT_LIMIT - Number(this.usage.used || 0));
    const effectiveRemaining = providerSafeRemaining === null ? localRemaining : Math.min(localRemaining, providerSafeRemaining);
    return {
      dayUtc: today,
      requestsUsedByApp: Number(this.usage.used || 0),
      appSoftLimit: DAILY_SOFT_LIMIT,
      appRemaining: localRemaining,
      providerDailyLimit: this.usage.providerLimit !== null && this.usage.providerLimit !== undefined && Number.isFinite(Number(this.usage.providerLimit)) ? Number(this.usage.providerLimit) : 100,
      providerDailyRemaining: providerRemaining,
      reservedDailyQuota: RESERVED_DAILY_QUOTA,
      effectiveRemaining,
      requestsLastMinute: this.usage.minuteCalls.length,
      appPerMinuteLimit: MINUTE_SOFT_LIMIT,
      resetAtUtc: `${today}T00:00:00Z`
    };
  }

  reserveRequest({ countDaily = true } = {}) {
    const usage = this.getUsage();
    if (usage.requestsLastMinute >= MINUTE_SOFT_LIMIT) {
      throw Object.assign(new Error('Proteção de velocidade: aguarde até o próximo minuto para consultar a API-Football.'), { code: 'LOCAL_MINUTE_LIMIT', status: 429 });
    }
    if (countDaily) {
      if (usage.appRemaining <= 0) {
        throw Object.assign(new Error(`Limite interno de ${DAILY_SOFT_LIMIT} requisições diárias atingido. Os últimos dados em cache continuam disponíveis.`), { code: 'LOCAL_DAILY_LIMIT', status: 429 });
      }
      if (usage.providerDailyRemaining !== null && usage.providerDailyRemaining <= RESERVED_DAILY_QUOTA) {
        throw Object.assign(new Error(`A API-Football informou apenas ${usage.providerDailyRemaining} requisições restantes. O NicoValBola pausou as consultas para preservar a reserva de ${RESERVED_DAILY_QUOTA}.`), { code: 'PROVIDER_RESERVE', status: 429 });
      }
      this.usage.used = Number(this.usage.used || 0) + 1;
    }
    this.usage.minuteCalls.push(this.now());
    this.persistUsage();
  }

  updateRateHeaders(headers) {
    const remaining = headers?.get?.('x-ratelimit-requests-remaining');
    const limit = headers?.get?.('x-ratelimit-requests-limit');
    if (remaining !== null && remaining !== undefined && Number.isFinite(Number(remaining))) this.usage.providerRemaining = Number(remaining);
    if (limit !== null && limit !== undefined && Number.isFinite(Number(limit))) this.usage.providerLimit = Number(limit);
    this.persistUsage();
  }

  getCached(key) {
    const entry = this.cache.get(key);
    if (!entry || Number(entry.expiresAt) <= this.now()) return null;
    return entry.data;
  }

  setCached(key, data, ttlMs) {
    this.cache.set(key, { expiresAt: this.now() + ttlMs, data });
    if (this.cache.size > 600) {
      const now = this.now();
      for (const [cacheKey, value] of this.cache) if (value.expiresAt <= now) this.cache.delete(cacheKey);
      while (this.cache.size > 600) this.cache.delete(this.cache.keys().next().value);
    }
    this.persistCache();
  }

  async request(endpoint, options = {}) {
    const cacheKey = options.cacheKey || '';
    if (!options.force && cacheKey) {
      const cached = this.getCached(cacheKey);
      if (cached !== null) {
        if (cached && cached.__nvbApiCacheEnvelope === true) {
          return { data: cached.data, cached: true, headers: null, paging: cached.paging || {}, results: Number(cached.results || 0) };
        }
        return { data: cached, cached: true, headers: null, paging: {}, results: Array.isArray(cached) ? cached.length : 0 };
      }
    }
    const key = String(this.getApiKey() || '').trim();
    if (!key) throw Object.assign(new Error('Configure sua chave gratuita da API-Football no Painel Admin.'), { code: 'API_KEY_MISSING', status: 503 });
    this.reserveRequest({ countDaily: options.countDaily !== false });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 15_000);
    try {
      const response = await this.fetch(`${this.baseUrl}${endpoint}`, {
        method: 'GET',
        headers: { 'x-apisports-key': key, 'Accept': 'application/json' },
        signal: controller.signal,
        cache: 'no-store'
      });
      this.updateRateHeaders(response.headers);
      const text = await response.text();
      let payload;
      try { payload = JSON.parse(text || '{}'); }
      catch { throw Object.assign(new Error('A API-Football retornou uma resposta que não é JSON.'), { status: 502 }); }
      if (!response.ok) {
        const errorText = isObject(payload.errors) ? Object.values(payload.errors).join(' · ') : String(payload.message || payload.errors || '');
        throw Object.assign(new Error(errorText || `API-Football respondeu HTTP ${response.status}.`), { status: response.status, providerStatus: response.status });
      }
      if (payload.errors && (Array.isArray(payload.errors) ? payload.errors.length : Object.keys(payload.errors).length)) {
        const message = isObject(payload.errors) ? Object.values(payload.errors).join(' · ') : JSON.stringify(payload.errors);
        throw Object.assign(new Error(message || 'A API-Football retornou um erro.'), { status: 502 });
      }
      const data = payload.response ?? [];
      const paging = payload.paging || {};
      const results = Number(payload.results || 0);
      if (cacheKey && options.ttlMs > 0) this.setCached(cacheKey, { __nvbApiCacheEnvelope: true, data, paging, results }, options.ttlMs);
      return { data, cached: false, headers: response.headers, paging, results };
    } catch (error) {
      if (error.name === 'AbortError') throw Object.assign(new Error('A API-Football demorou mais de 15 segundos para responder.'), { status: 504 });
      throw error;
    } finally { clearTimeout(timeout); }
  }

  async testConnection() {
    const result = await this.request('/status', { countDaily: false, force: true });
    const account = Array.isArray(result.data) ? (result.data[0] || {}) : (result.data || {});
    const subscription = account.subscription || {};
    return {
      ok: true,
      account: {
        firstname: account.account?.firstname || '',
        lastname: account.account?.lastname || '',
        email: account.account?.email || ''
      },
      subscription: {
        plan: subscription.plan || '',
        end: subscription.end || '',
        active: Boolean(subscription.active)
      },
      usage: this.getUsage()
    };
  }

  async fixturesForDate(date, options = {}) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) {
      throw Object.assign(new Error('Data da partida inválida.'), { status: 400 });
    }

    // IMPORTANTE: /fixtures não aceita o parâmetro `page`.
    // A paginação existe em outros endpoints (por exemplo, profiles e odds),
    // mas não deve ser acrescentada à consulta de fixtures por data.
    // Uma única resposta de /fixtures?date=... devolve a lista do dia.
    const cacheKey = `fixtures:${date}:all:v2`;
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date(this.now()));

    // No dia atual, renovar a lista periodicamente para detectar partidas que
    // começaram; quando há partidas ao vivo, usar uma janela ainda menor.
    const normalTtl = date === today ? 5 * 60_000 : 12 * 60 * 60_000;
    const result = await this.request(
      `/fixtures?date=${encodeURIComponent(date)}&timezone=${encodeURIComponent(TIME_ZONE)}`,
      { cacheKey, ttlMs: normalTtl, force: Boolean(options.force) }
    );

    const fixtures = asArray(result.data);
    const liveStatuses = new Set(['1H', 'HT', '2H', 'ET', 'P', 'LIVE', 'BT']);
    const hasLive = fixtures.some(item => liveStatuses.has(String(item?.fixture?.status?.short || '').toUpperCase()));
    const effectiveTtl = date === today && hasLive ? 90_000 : normalTtl;

    // request() já gravou com normalTtl. Se a resposta indicar jogo ao vivo,
    // encurtamos a validade do cache para 90 segundos.
    if (!result.cached && effectiveTtl !== normalTtl) {
      this.setCached(cacheKey, {
        __nvbApiCacheEnvelope: true,
        data: fixtures,
        paging: result.paging || {},
        results: result.results || fixtures.length
      }, effectiveTtl);
    }

    return {
      fixtures,
      cached: result.cached,
      pages: 1,
      truncated: false,
      usage: this.getUsage()
    };
  }

  findFixture(event, fixtures) {
    const home = normalizeTeamName(event?.home);
    const away = normalizeTeamName(event?.away);
    const date = String(event?.dateEvent || '').slice(0, 10);
    if (!home || !away || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { match: null, reason: 'A partida da agenda não tem nomes de times ou data suficientes.' };
    const candidates = asArray(fixtures).filter(item => {
      const fixtureDate = String(item?.fixture?.date || '').slice(0, 10);
      if (fixtureDate !== date) return false;
      return normalizeTeamName(item?.teams?.home?.name) === home && normalizeTeamName(item?.teams?.away?.name) === away;
    });
    if (candidates.length === 1) return { match: candidates[0], reason: '' };
    if (candidates.length > 1) {
      const eventTime = String(event.timeText || '').match(/^(\d{1,2}):(\d{2})/);
      if (eventTime) {
        const targetMinutes = Number(eventTime[1]) * 60 + Number(eventTime[2]);
        const ranked = candidates.map(item => {
          const dateValue = String(item?.fixture?.date || '');
          const timeValue = dateValue.match(/T(\d{2}):(\d{2})/);
          const minutes = timeValue ? Number(timeValue[1]) * 60 + Number(timeValue[2]) : NaN;
          return { item, diff: Number.isFinite(minutes) ? Math.abs(minutes - targetMinutes) : Infinity };
        }).sort((a,b) => a.diff - b.diff);
        if (ranked[0]?.diff <= 180 && (ranked.length === 1 || ranked[0].diff < ranked[1].diff)) return { match: ranked[0].item, reason: '' };
      }
      return { match: null, reason: 'A API-Football retornou mais de uma partida com os mesmos times e data. Não escolhemos um resultado ambíguo.' };
    }
    return { match: null, reason: 'A API-Football não encontrou uma partida com os mesmos times e data. Isso pode ocorrer por diferença de nomes ou porque a temporada não está coberta no plano atual (o Free pode limitar temporadas). A agenda original foi mantida sem alterações.' };
  }

  async resolveMatch(event, options = {}) {
    const date = String(event?.dateEvent || '').slice(0, 10);
    const result = await this.fixturesForDate(date, options);
    const found = this.findFixture(event, result.fixtures);
    if (!found.match) return { matched: false, reason: found.reason, usage: this.getUsage() };
    const item = found.match;
    const fixture = item.fixture || {};
    const league = item.league || {};
    return {
      matched: true,
      fixture: {
        id: Number(fixture.id),
        date: String(fixture.date || ''),
        timezone: String(fixture.timezone || TIME_ZONE),
        status: String(fixture.status?.short || ''),
        statusLong: String(fixture.status?.long || ''),
        elapsed: fixture.status?.elapsed ?? null,
        venue: String(fixture.venue?.name || ''),
        referee: String(fixture.referee || ''),
        league: { id: Number(league.id), name: String(league.name || ''), country: String(league.country || ''), logo: String(league.logo || ''), season: Number(league.season || 0), round: String(league.round || '') },
        home: { id: Number(item.teams?.home?.id || 0), name: String(item.teams?.home?.name || event.home), logo: String(item.teams?.home?.logo || '') },
        away: { id: Number(item.teams?.away?.id || 0), name: String(item.teams?.away?.name || event.away), logo: String(item.teams?.away?.logo || '') },
        goals: { home: item.goals?.home ?? null, away: item.goals?.away ?? null }
      },
      pagesSearched: result.pages,
      cached: result.cached,
      usage: this.getUsage()
    };
  }

  normalizeCombinedLineups(raw, fixtureTeams = {}) {
    if (Array.isArray(raw)) return raw;
    if (!isObject(raw)) return [];
    // Compatibilidade com o formato legado em que lineups vinham como objeto por nome do clube.
    return Object.entries(raw).map(([teamName, value]) => {
      const lineup = isObject(value) ? value : {};
      const convertPlayer = row => {
        const player = row?.player && typeof row.player === 'object' ? row.player : {
          id: row?.player_id ?? row?.id ?? 0,
          name: typeof row?.player === 'string' ? row.player : (row?.name || ''),
          number: row?.number ?? null,
          pos: row?.pos || row?.position || '',
          grid: row?.grid || ''
        };
        return { player };
      };
      const teamId = Number(lineup.team?.id || lineup.team_id || lineup.startXI?.[0]?.team_id || lineup.substitutes?.[0]?.team_id || 0);
      const coach = isObject(lineup.coach) ? lineup.coach : { id: Number(lineup.coach_id || 0), name: String(lineup.coach || '') };
      return {
        team: lineup.team || { id: teamId, name: teamName },
        formation: String(lineup.formation || ''), coach,
        startXI: asArray(lineup.startXI).map(convertPlayer),
        substitutes: asArray(lineup.substitutes).map(convertPlayer)
      };
    });
  }

  normalizeCombinedStatistics(raw, fixtureTeams = {}) {
    if (Array.isArray(raw)) return raw;
    if (!isObject(raw)) return [];
    // Compatibilidade com o formato legado: { "Ball Possession": {home:"...", away:"..."} }.
    const home = []; const away = [];
    for (const [type, values] of Object.entries(raw)) {
      if (!isObject(values)) continue;
      if (Object.prototype.hasOwnProperty.call(values, 'home')) home.push({ type, value: values.home });
      if (Object.prototype.hasOwnProperty.call(values, 'away')) away.push({ type, value: values.away });
    }
    if (!home.length && !away.length) return [];
    return [
      { team: fixtureTeams.home || { name: 'Mandante' }, statistics: home },
      { team: fixtureTeams.away || { name: 'Visitante' }, statistics: away }
    ];
  }

  async getMatchDetails(fixtureId, statusShort = '', options = {}) {
    const id = Number(fixtureId);
    if (!Number.isInteger(id) || id <= 0) throw Object.assign(new Error('ID de partida inválido.'), { status: 400 });
    const live = ['1H','HT','2H','ET','P','LIVE','BT'].includes(String(statusShort || '').toUpperCase());
    const finished = ['FT','AET','PEN','AWD','WO'].includes(String(statusShort || '').toUpperCase());
    // O endpoint combinado /fixtures?id= inclui eventos, escalações, estatísticas e jogadores
    // quando a cobertura do campeonato/temporada fornece esses dados.
    const ttlMs = finished ? 12 * 60 * 60_000 : (live ? 60_000 : 10 * 60_000);
    const errors = [];
    try {
      const result = await this.request(`/fixtures?id=${id}`, {
        cacheKey: `fixture-details:${id}`, ttlMs, force: Boolean(options.force)
      });
      const fixture = asArray(result.data).find(item => Number(item?.fixture?.id || 0) === id) || asArray(result.data)[0] || null;
      if (!fixture) {
        errors.push({ section: 'fixture-details', message: 'A API não disponibilizou detalhes para este jogo. Verifique a cobertura da temporada no seu plano.', code: 'DETAILS_UNAVAILABLE' });
        return { fixtureId: id, fixture: null, lineups: [], statistics: [], players: [], events: [], errors, cached: result.cached, usage: this.getUsage() };
      }
      const latestFixture = fixture.fixture || {};
      const latestLeague = fixture.league || {};
      const latestTeams = fixture.teams || {};
      const fixtureSummary = {
        id, date: String(latestFixture.date || ''), timezone: String(latestFixture.timezone || TIME_ZONE),
        status: String(latestFixture.status?.short || statusShort || ''), statusLong: String(latestFixture.status?.long || ''),
        elapsed: latestFixture.status?.elapsed ?? null, venue: String(latestFixture.venue?.name || ''),
        referee: String(latestFixture.referee || ''),
        league: { id: Number(latestLeague.id || 0), name: String(latestLeague.name || ''), country: String(latestLeague.country || ''), logo: String(latestLeague.logo || ''), season: Number(latestLeague.season || 0), round: String(latestLeague.round || '') },
        home: { id: Number(latestTeams.home?.id || 0), name: String(latestTeams.home?.name || ''), logo: String(latestTeams.home?.logo || '') },
        away: { id: Number(latestTeams.away?.id || 0), name: String(latestTeams.away?.name || ''), logo: String(latestTeams.away?.logo || '') },
        goals: { home: fixture.goals?.home ?? null, away: fixture.goals?.away ?? null }
      };
      const lineups = this.normalizeCombinedLineups(fixture.lineups, fixture.teams || {});
      const statistics = this.normalizeCombinedStatistics(fixture.statistics, fixture.teams || {});
      if (!lineups.length) errors.push({ section: 'lineups', message: 'Escalações ainda não foram publicadas ou não estão cobertas para esta partida/temporada.', code: 'LINEUPS_UNAVAILABLE' });
      if (!statistics.length) errors.push({ section: 'statistics', message: 'Estatísticas ainda não estão disponíveis ou não estão cobertas para esta partida/temporada.', code: 'STATISTICS_UNAVAILABLE' });
      return {
        fixtureId: id,
        fixture: fixtureSummary,
        lineups,
        statistics,
        players: asArray(fixture.players),
        events: asArray(fixture.events),
        errors,
        cached: result.cached,
        usage: this.getUsage()
      };
    } catch (error) {
      errors.push({ section: 'fixture-details', message: error.message, code: error.code || '' });
      return { fixtureId: id, fixture: null, lineups: [], statistics: [], players: [], events: [], errors, cached: false, usage: this.getUsage() };
    }
  }

  async getStandings(leagueId, season) {
    const league = Number(leagueId);
    const year = Number(season);
    if (!Number.isInteger(league) || league <= 0 || !Number.isInteger(year) || year < 1900 || year > 2200) {
      throw Object.assign(new Error('Competição ou temporada inválida para consultar a classificação.'), { status: 400 });
    }
    const result = await this.request(`/standings?league=${league}&season=${year}`, { cacheKey: `standings:${league}:${year}`, ttlMs: 24 * 60 * 60_000 });
    return { leagueId: league, season: year, data: asArray(result.data), cached: result.cached, usage: this.getUsage() };
  }
}

module.exports = { ApiFootballService, normalizeTeamName, DAILY_SOFT_LIMIT, RESERVED_DAILY_QUOTA, MINUTE_SOFT_LIMIT };
