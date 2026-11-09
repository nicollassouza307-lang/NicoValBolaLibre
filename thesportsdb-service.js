'use strict';

const { URLSearchParams } = require('node:url');

const API_BASE = 'https://www.thesportsdb.com/api/v1/json/123';
const FREE_API_KEY = '123';
const DEFAULT_TTL = Object.freeze({ teamBadge: 30 * 24 * 60 * 60 * 1000, leagueBadge: 30 * 24 * 60 * 60 * 1000, negative: 24 * 60 * 60 * 1000, test: 60 * 60 * 1000 });
const COUNTRY_ALIASES = Object.freeze({
  england: 'england', 'united kingdom': 'england', uk: 'england', gb: 'england', inglaterra: 'england',
  brazil: 'brazil', brasil: 'brazil', spain: 'spain', espana: 'spain', espanha: 'spain',
  germany: 'germany', alemanha: 'germany', italy: 'italy', italia: 'italy', france: 'france', franca: 'france',
  netherlands: 'netherlands', holland: 'netherlands', holanda: 'netherlands', portugal: 'portugal',
  argentina: 'argentina', usa: 'usa', 'united states': 'usa', mexico: 'mexico', scotland: 'scotland'
});
const COUNTRY_API_NAMES = Object.freeze({
  england: 'England', brazil: 'Brazil', spain: 'Spain', germany: 'Germany', italy: 'Italy', france: 'France',
  netherlands: 'Netherlands', portugal: 'Portugal', argentina: 'Argentina', usa: 'United States', mexico: 'Mexico', scotland: 'Scotland'
});
const LEAGUE_API_NAMES = Object.freeze({
  'premier league': 'English Premier League', 'english premier league': 'English Premier League', epl: 'English Premier League',
  laliga: 'Spanish La Liga', 'la liga': 'Spanish La Liga', 'spanish la liga': 'Spanish La Liga',
  bundesliga: 'German Bundesliga', 'german bundesliga': 'German Bundesliga',
  'serie a': 'Italian Serie A', 'italian serie a': 'Italian Serie A',
  'ligue 1': 'French Ligue 1', 'french ligue 1': 'French Ligue 1',
  eredivisie: 'Dutch Eredivisie', 'dutch eredivisie': 'Dutch Eredivisie',
  'primeira liga': 'Portuguese Primeira Liga', 'liga portugal': 'Portuguese Primeira Liga',
  brasileirao: 'Brazilian Serie A', 'brasileirao serie a': 'Brazilian Serie A', 'campeonato brasileiro serie a': 'Brazilian Serie A'
});
// TheSportsDB free V1: confirmed official ID for the English Premier League.
const VERIFIED_LEAGUE_IDS = Object.freeze({ 'english premier league|england': '4328' });
// Juventus team page verified on TheSportsDB: /team/133676-Juventus.
// The free V1 lookup endpoint can fetch a known team ID without using the restricted name-search endpoint.
const VERIFIED_TEAM_IDS = Object.freeze({ 'juventus|italy': '133676', 'juventus fc|italy': '133676', 'juventus turin|italy': '133676', 'juventus torino|italy': '133676' });

function fold(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function normalizeTeam(value) {
  return fold(value).replace(/\b(football club|soccer club|fc|cf|sc|afc|ac|ec|club|de|del|the)\b/g, ' ').replace(/\s+/g, ' ').trim();
}
function countryKey(value) {
  const key = fold(value);
  return COUNTRY_ALIASES[key] || key;
}
function diceSimilarity(a, b) {
  const left = normalizeTeam(a), right = normalizeTeam(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.length < 2 || right.length < 2) return 0;
  const pairs = text => { const out = new Map(); for (let i = 0; i < text.length - 1; i++) { const part = text.slice(i, i + 2); out.set(part, (out.get(part) || 0) + 1); } return out; };
  const l = pairs(left), r = pairs(right); let overlap = 0;
  for (const [pair, count] of l) overlap += Math.min(count, r.get(pair) || 0);
  const total = [...l.values()].reduce((sum, n) => sum + n, 0) + [...r.values()].reduce((sum, n) => sum + n, 0);
  return total ? (2 * overlap / total) : 0;
}
function safeImageUrl(value) {
  try {
    const url = new URL(String(value || ''));
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || !(host === 'thesportsdb.com' || host.endsWith('.thesportsdb.com')) || url.username || url.password) return '';
    return url.href;
  } catch { return ''; }
}
function safeQuery(value, max = 100) {
  return String(value || '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}
function leagueApiName(league, country = '') {
  const key = fold(league);
  if (key === 'serie a' && countryKey(country) === 'brazil') return 'Brazilian Serie A';
  return LEAGUE_API_NAMES[key] || safeQuery(league, 100);
}
function countryApiName(country) {
  const key = countryKey(country);
  return COUNTRY_API_NAMES[key] || safeQuery(country, 80);
}
function teamListQuery({ league, country }) {
  const leagueName = leagueApiName(league, country);
  if (leagueName) return { params: { l: leagueName.replace(/\s+/g, '_') }, key: `league:${fold(leagueName)}` };
  const countryName = countryApiName(country);
  if (countryName) return { params: { s: 'Soccer', c: countryName }, key: `country:${countryKey(countryName)}` };
  return null;
}

class TheSportsDBService {
  constructor(options = {}) {
    this.fetchImpl = options.fetchImpl || globalThis.fetch;
    this.engine = options.engine || null;
    this.now = options.now || (() => Date.now());
    this.ttl = { ...DEFAULT_TTL, ...(options.ttl || {}) };
    this.inflight = new Map();
    if (typeof this.fetchImpl !== 'function') throw new Error('Este Node.js não oferece fetch nativo.');
  }

  async request(path, options = {}) {
    const cacheKey = String(options.cacheKey || '').trim();
    if (!options.force && cacheKey && this.engine) {
      const cached = this.engine.get('thesportsdb', cacheKey);
      if (cached !== null && cached !== undefined) return { data: cached, cached: true, record: this.engine.getRecord('thesportsdb', cacheKey) };
    }
    if (!options.force && cacheKey && this.inflight.has(cacheKey)) return this.inflight.get(cacheKey);
    const task = (async () => {
      if (this.engine) this.engine.reserveRequest('thesportsdb', { perMinuteLimit: 25, countDaily: false });
      let response;
      try {
        response = await this.fetchImpl(`${API_BASE}${path}`, {
          method: 'GET', headers: { Accept: 'application/json' },
          signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined,
          cache: 'no-store'
        });
      } catch (error) {
        throw Object.assign(new Error(`Não foi possível alcançar TheSportsDB: ${error.message || 'erro de rede'}`), { status: 502, code: 'THESPORTSDB_NETWORK' });
      }
      let payload;
      try { payload = await response.json(); }
      catch { throw Object.assign(new Error('TheSportsDB retornou uma resposta inválida.'), { status: 502, code: 'THESPORTSDB_INVALID_JSON' }); }
      if (!response.ok) {
        const messages = { 404: 'TheSportsDB não encontrou esse recurso.', 429: 'Limite gratuito de 30 chamadas por minuto da TheSportsDB atingido. Aguarde e tente novamente.' };
        throw Object.assign(new Error(messages[response.status] || `TheSportsDB respondeu HTTP ${response.status}.`), { status: response.status, code: `THESPORTSDB_HTTP_${response.status}` });
      }
      if (cacheKey && this.engine) this.engine.set('thesportsdb', cacheKey, payload, options.ttlMs || this.ttl.negative);
      return { data: payload, cached: false, record: cacheKey && this.engine ? this.engine.getRecord('thesportsdb', cacheKey) : null };
    })();
    if (!options.force && cacheKey) this.inflight.set(cacheKey, task);
    try { return await task; }
    finally { if (this.inflight.get(cacheKey) === task) this.inflight.delete(cacheKey); }
  }

  async testConnection() {
    // The official free-key documentation explicitly uses Arsenal as the free search example.
    const result = await this.request(`/searchteams.php?${new URLSearchParams({ t: 'Arsenal' })}`, { cacheKey: 'test:arsenal:v1', ttlMs: this.ttl.test, force: true });
    const teams = Array.isArray(result.data?.teams) ? result.data.teams : [];
    if (!teams.length) throw Object.assign(new Error('A TheSportsDB respondeu, mas não retornou o clube de teste Arsenal. Verifique a disponibilidade da API gratuita e tente novamente.'), { status: 502, code: 'THESPORTSDB_TEST_DATA_MISSING' });
    return { ok: true, provider: 'TheSportsDB', apiVersion: 'v1-free', freeKeyBuiltIn: true, testTeamFound: true, testTeam: String(teams[0]?.strTeam || 'Arsenal'), message: 'Conexão com TheSportsDB V1 validada. A chave pública gratuita 123 já está integrada; não é necessário criar conta nem cadastrar token.', cached: false };
  }

  async getTeamBadge(input = {}, options = {}) {
    const teamName = safeQuery(input.teamName, 100);
    const country = safeQuery(input.country, 80);
    const league = safeQuery(input.league, 100);
    const apiFootballId = String(Number(input.apiFootballId || 0) || '').slice(0, 16);
    if (!teamName) throw Object.assign(new Error('Informe o nome do clube para procurar o escudo.'), { status: 400, code: 'THESPORTSDB_TEAM_REQUIRED' });
    const normalized = normalizeTeam(teamName);
    const cacheKey = `team-badge:${normalized}:${countryKey(country) || 'any'}:${apiFootballId || 'noid'}:${options.preferTheSportsDb ? 'preferred' : 'standard'}`.slice(0, 190);
    const cachedData = !options.force ? this.engine?.get('thesportsdb', cacheKey) : null;
    if (cachedData && typeof cachedData === 'object') return { ...cachedData, cached:true, record:this.engine?.getRecord('thesportsdb', cacheKey) || null };


    const query = teamListQuery({ league, country });
    const verifiedTeamId = VERIFIED_TEAM_IDS[`${normalized}|${countryKey(country)}`] || '';
    if (!verifiedTeamId && !query) {
      const data = { found:false, teamName, resolvedName:'', country:'', league, badgeUrl:'', source:'TheSportsDB', confidence:0, reason:'Informe a competição ou o país para usar a lista pública de equipes.' };
      if (this.engine) this.engine.set('thesportsdb', cacheKey, data, this.ttl.negative);
      return { ...data, cached:false, record:this.engine?.getRecord('thesportsdb', cacheKey) || null };
    }
    let result;
    let teams;
    let lookupScope;
    if (verifiedTeamId) {
      result = await this.request(`/lookupteam.php?${new URLSearchParams({ id:verifiedTeamId })}`, { cacheKey:`raw:team-id:${verifiedTeamId}`, ttlMs:this.ttl.teamBadge, force:Boolean(options.force) });
      teams = Array.isArray(result.data?.teams) ? result.data.teams : [];
      lookupScope = `team-id:${verifiedTeamId}`;
    } else {
      const path = `/search_all_teams.php?${new URLSearchParams(query.params)}`;
      result = await this.request(path, { cacheKey:`raw:teams:${query.key}`.slice(0, 220), ttlMs:this.ttl.teamBadge, force:Boolean(options.force) });
      teams = Array.isArray(result.data?.teams) ? result.data.teams : [];
      lookupScope = query.key;
    }
    const expectedCountry = countryKey(country);
    const expectedApiId = apiFootballId;
    const candidates = teams.map(team => {
      const actualApiId = String(Number(team?.idAPIfootball || 0) || '');
      const idMatch = Boolean(expectedApiId && actualApiId && actualApiId === expectedApiId);
      const nameScore = Math.max(diceSimilarity(team?.strTeam, teamName), ...String(team?.strTeamAlternate || '').split(/[,;|]/).map(alias => diceSimilarity(alias, teamName)), 0);
      const candidateCountry = countryKey(team?.strCountry || '');
      const countryMatch = !expectedCountry || candidateCountry === expectedCountry;
      const leagueScore = league ? diceSimilarity(team?.strLeague || '', leagueApiName(league, country)) : 0;
      return { team, nameScore, idMatch, countryMatch, leagueScore };
    }).filter(item => item.countryMatch && (item.idMatch || item.nameScore >= 0.90))
      .sort((a, b) => Number(b.idMatch) - Number(a.idMatch) || (b.nameScore - a.nameScore) || (b.leagueScore - a.leagueScore));
    const best = candidates[0] || null;
    const badgeUrl = safeImageUrl(best?.team?.strBadge || best?.team?.strLogo || '');
    const data = {
      found: Boolean(badgeUrl), teamName, resolvedName: String(best?.team?.strTeam || ''),
      country: String(best?.team?.strCountry || ''), league: String(best?.team?.strLeague || ''),
      badgeUrl, source: 'TheSportsDB', confidence: best?.idMatch ? 1 : (best?.nameScore || 0),
      lookupScope, listLimitedByFreeTier: !verifiedTeamId && teams.length >= 10
    };
    if (this.engine) this.engine.set('thesportsdb', cacheKey, data, data.found ? this.ttl.teamBadge : this.ttl.negative);
    return { ...data, cached: result.cached, record: this.engine?.getRecord('thesportsdb', cacheKey) || result.record };
  }

  async getLeagueBadge(input = {}, options = {}) {
    const leagueName = safeQuery(input.leagueName, 100);
    const country = safeQuery(input.country, 80);
    if (!leagueName || !country) return { found: false, leagueName, badgeUrl: '', source: 'TheSportsDB', cached: false };
    const expectedCountry = countryKey(country);
    const cacheKey = `league-badge:${fold(leagueName)}:${expectedCountry}`.slice(0, 190);
    const cachedData = !options.force ? this.engine?.get('thesportsdb', cacheKey) : null;
    if (cachedData && typeof cachedData === 'object') return { ...cachedData, cached:true, record:this.engine?.getRecord('thesportsdb', cacheKey) || null };

    const verifiedId = VERIFIED_LEAGUE_IDS[`${fold(leagueApiName(leagueName, country))}|${expectedCountry}`];
    let result;
    let leagues;
    if (verifiedId) {
      result = await this.request(`/lookupleague.php?${new URLSearchParams({ id: verifiedId })}`, { cacheKey:`raw:league-id:${verifiedId}`, ttlMs:this.ttl.leagueBadge, force:Boolean(options.force) });
      leagues = Array.isArray(result.data?.leagues) ? result.data.leagues : [];
    } else {
      result = await this.request(`/search_all_leagues.php?${new URLSearchParams({ c: countryApiName(country), s: 'Soccer' })}`, { cacheKey:`raw:leagues-country:${expectedCountry}`, ttlMs:this.ttl.leagueBadge, force:Boolean(options.force) });
      leagues = Array.isArray(result.data?.countries) ? result.data.countries : (Array.isArray(result.data?.leagues) ? result.data.leagues : []);
    }
    const candidates = leagues.map(item => {
      const candidateCountry = countryKey(item?.strCountry || '');
      return { item, score: Math.max(diceSimilarity(item?.strLeague || '', leagueName), diceSimilarity(item?.strLeague || '', leagueApiName(leagueName, country)), ...String(item?.strLeagueAlternate || '').split(/[,;|]/).map(alias => diceSimilarity(alias, leagueName)), 0), countryMatch: candidateCountry === expectedCountry };
    }).filter(item => item.countryMatch && item.score >= 0.78).sort((a, b) => b.score - a.score);
    const best = candidates[0] || null;
    const badgeUrl = safeImageUrl(best?.item?.strBadge || best?.item?.strLogo || '');
    const data = { found: Boolean(badgeUrl), leagueName, resolvedName: String(best?.item?.strLeague || ''), country: String(best?.item?.strCountry || ''), badgeUrl, source: 'TheSportsDB', confidence: best?.score || 0 };
    if (this.engine) this.engine.set('thesportsdb', cacheKey, data, data.found ? this.ttl.leagueBadge : this.ttl.negative);
    return { ...data, cached: result.cached, record: this.engine?.getRecord('thesportsdb', cacheKey) || result.record };
  }
}

module.exports = { TheSportsDBService, API_BASE, FREE_API_KEY, DEFAULT_TTL, VERIFIED_TEAM_IDS, fold, normalizeTeam, countryKey, diceSimilarity, safeImageUrl, leagueApiName, countryApiName, teamListQuery };
