'use strict';

// Integração experimental com os endpoints web observados publicamente em
// implementações comunitárias. Não é uma API oficial documentada pela 365Scores.
// Chamadas são feitas somente sob demanda, com cache e limite local conservador.

const API_BASE = 'https://webws.365scores.com/web';
const TIME_ZONE = 'America/Sao_Paulo';
const DEFAULT_PARAMS = Object.freeze({
  appTypeId: '5',
  langId: '31',
  timezoneName: TIME_ZONE,
  userCountryId: '21'
});

const ENDPOINTS = Object.freeze({
  sports: '/sports/',
  allScores: '/games/allscores/',
  currentGames: '/games/current/',
  results: '/games/results/',
  fixtures: '/games/fixtures/',
  game: '/game/',
  standings: '/standings/',
  brackets: '/brackets/',
  competitionStats: '/stats/'
});

function asObject(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function asArray(value) { return Array.isArray(value) ? value : []; }
function firstText(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
}
function positiveId(value) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}
function isoToBrDate(value) {
  const input = String(value || '').trim();
  const match = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw Object.assign(new Error('Informe uma data válida no formato AAAA-MM-DD.'), { status: 400, code: '365SCORES_INVALID_DATE' });
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() + 1 !== Number(month) || date.getUTCDate() !== Number(day)) {
    throw Object.assign(new Error('A data informada não existe.'), { status: 400, code: '365SCORES_INVALID_DATE' });
  }
  return `${day}/${month}/${year}`;
}
function extractGames(payload) {
  const root = asObject(payload);
  const candidates = [root.games, root.data?.games, root.response?.games, root.scores?.games];
  for (const value of candidates) if (Array.isArray(value)) return value;
  return [];
}
function extractGame(payload) {
  const root = asObject(payload);
  if (root.game && typeof root.game === 'object') return root.game;
  if (root.data?.game && typeof root.data.game === 'object') return root.data.game;
  return root;
}
function competitorName(competitor) {
  return firstText(competitor?.name, competitor?.shortName, competitor?.displayName, competitor?.longName);
}
function competitionOf(game) {
  const list = asArray(game?.competitions);
  const first = asObject(list[0]);
  const nested = asObject(game?.competition);
  return {
    id: positiveId(first.id || nested.id || game?.competitionId),
    name: firstText(first.name, first.displayName, nested.name, game?.competitionDisplayName, game?.competitionName),
    country: firstText(first.countryName, first.country?.name, nested.countryName)
  };
}
function teamsOf(game) {
  const home = asObject(game?.homeCompetitor || game?.homeTeam);
  const away = asObject(game?.awayCompetitor || game?.awayTeam);
  const competitors = asArray(game?.competitors);
  let homeTeam = home;
  let awayTeam = away;
  if ((!competitorName(homeTeam) || !competitorName(awayTeam)) && competitors.length >= 2) {
    const homeCandidate = competitors.find(item => Number(item?.competitorNum) === 1 || item?.isHome === true) || competitors[0];
    const awayCandidate = competitors.find(item => Number(item?.competitorNum) === 2 || item?.isHome === false) || competitors.find(item => item !== homeCandidate) || competitors[1];
    homeTeam = Object.keys(homeTeam).length ? homeTeam : asObject(homeCandidate);
    awayTeam = Object.keys(awayTeam).length ? awayTeam : asObject(awayCandidate);
  }
  return {
    home: { id: positiveId(homeTeam.id || homeTeam.competitorId), name: competitorName(homeTeam), score: homeTeam.score ?? homeTeam.result ?? null },
    away: { id: positiveId(awayTeam.id || awayTeam.competitorId), name: competitorName(awayTeam), score: awayTeam.score ?? awayTeam.result ?? null }
  };
}
function normalizeGame(game) {
  const item = asObject(game);
  const teams = teamsOf(item);
  const competition = competitionOf(item);
  return {
    gameId: positiveId(item.id || item.gameId || item.game?.id),
    startTime: firstText(item.startTime, item.date, item.startDate),
    status: firstText(item.statusText, item.status?.name, item.status?.shortName, item.statusGroupName),
    statusGroup: item.statusGroup ?? item.status?.group ?? null,
    home: teams.home,
    away: teams.away,
    competition,
    round: firstText(item.roundName, item.round?.name),
    venue: firstText(item.venue?.name, item.venueName),
    tvNetworks: asArray(item.tvNetworks).map(x => firstText(x.name, x.displayName, x)).filter(Boolean).slice(0, 20)
  };
}
function buildGameMemberMap(gameMembers) {
  const map = new Map();
  for (const member of asArray(gameMembers)) {
    const item = asObject(member);
    const ids = [positiveId(item.id), positiveId(item.athleteId)].filter(Boolean);
    for (const id of ids) if (!map.has(id)) map.set(id, item);
  }
  return map;
}
function athleteImageUrl(id, isNationalTeam = false) {
  const athleteId = positiveId(id);
  if (!athleteId) return '';
  const base = 'https://imagecache.365scores.com/image/upload/f_png,w_34,h_34,c_limit,q_auto:eco,dpr_2,d_Athletes:default.png,r_max,c_thumb,g_face,z_0.65';
  return `${base}/v1/Athletes/${isNationalTeam ? 'NationalTeam/' : ''}${athleteId}`;
}
function normalizeStatRows(rows) {
  return asArray(rows).map(row => {
    const item = asObject(row);
    const type = item.type;
    const typeId = positiveId(item.typeId || (typeof type === 'number' || typeof type === 'string' ? type : type?.id));
    const value = item.value ?? item.displayValue ?? item.val ?? null;
    return {
      typeId,
      name: firstText(item.name, item.typeName, item.label, typeof type === 'object' ? type?.name : ''),
      value,
      numericValue: typeof value === 'number' ? value : (Number.isFinite(Number(String(value ?? '').replace(',', '.').replace('%', ''))) ? Number(String(value).replace(',', '.').replace('%', '')) : null)
    };
  }).filter(row => row.typeId || row.name || row.value !== null);
}
function positionCode(value) {
  const text = String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/goal|goleir|keeper/.test(text)) return 'G';
  if (/defen|defens|back|zague|lateral/.test(text)) return 'D';
  if (/mid|meio|volant|meia/.test(text)) return 'M';
  if (/attack|atac|forward|wing|striker|ponta/.test(text)) return 'F';
  return String(value || '').slice(0, 2).toUpperCase();
}
function extractLineup(team, memberMap, isNationalTeam = false) {
  const source = asObject(team);
  const lineup = asObject(source.lineups);
  const members = asArray(lineup.members || source.lineup?.members);
  const starters = members.filter(member => Number(member?.status) === 1);
  const coaches = members.filter(member => Number(member?.status) === 4 || member?.isCoach || /coach|t[eé]cnico/i.test(firstText(member?.position?.name, member?.positionName)));
  const normalizedMembers = members.map(member => {
    const athleteId = positiveId(member?.athleteId || member?.id);
    const detail = (athleteId && memberMap?.get(athleteId)) || {};
    const position = asObject(detail.position || member?.position);
    const photoId = positiveId(detail.athleteId || detail.id || athleteId);
    const positionName = firstText(position.name, detail.positionName, member?.position?.name, member?.positionName);
    return {
      id: photoId,
      athleteId: photoId,
      name: firstText(detail.name, detail.displayName, detail.longName, detail.shortName, member?.name, member?.displayName, member?.longName, member?.shortName),
      number: detail.jerseyNumber ?? detail.shirtNumber ?? detail.number ?? member?.jerseyNumber ?? member?.shirtNumber ?? member?.number ?? null,
      position: positionName,
      positionCode: positionCode(positionName),
      status: Number.isFinite(Number(member?.status)) ? Number(member.status) : null,
      formationPosition: asObject(member?.yardFormation || detail.yardFormation),
      photoUrl: athleteImageUrl(photoId, isNationalTeam),
      stats: normalizeStatRows(member?.stats || detail.stats)
    };
  });
  const coachMember = normalizedMembers.find(member => coaches.some(coach => positiveId(coach?.athleteId || coach?.id) === member.id)) || null;
  return {
    formation: firstText(lineup.formation, source.formation),
    total: members.length,
    starters: starters.length,
    substitutes: members.filter(member => Number(member?.status) === 2 && !coaches.includes(member)).length,
    coaches: coaches.length,
    coach: coachMember?.name || firstText(lineup.coach?.name, source.coach?.name),
    members: normalizedMembers.slice(0, 40)
  };
}
function eventTypeLabel(typeId) {
  const labels = { 1: 'Gol', 2: 'Cartão amarelo', 3: 'Cartão vermelho', 12: 'Bola na trave', 1000: 'Substituição' };
  return labels[Number(typeId)] || 'Evento';
}
function normalizeGameEvent(event, memberMap, home, away) {
  const item = asObject(event);
  const athleteId = positiveId(item.athleteId || item.playerId || item.memberId || item.player?.id);
  const player = (athleteId && memberMap.get(athleteId)) || asObject(item.player);
  const secondAthleteId = positiveId(item.assistAthleteId || item.assistPlayerId || item.substituteId || item.inAthleteId || item.assist?.id);
  const secondPlayer = (secondAthleteId && memberMap.get(secondAthleteId)) || asObject(item.assist || item.inPlayer);
  const competitorNum = Number(item.competitorNum ?? item.competitor?.competitorNum);
  return {
    typeId: positiveId(item.typeId || item.type?.id),
    type: eventTypeLabel(item.typeId || item.type?.id),
    minute: firstText(item.gameTime, item.minute, item.time, item.timeLabel, item.displayTime),
    player: firstText(player.name, player.displayName, item.playerName, item.name),
    secondaryPlayer: firstText(secondPlayer.name, secondPlayer.displayName, item.assistName, item.inPlayerName),
    team: competitorNum === 1 ? home.name : competitorNum === 2 ? away.name : firstText(item.competitor?.name, item.team?.name),
    detail: firstText(item.name, item.description, item.comment, item.shortText, item.type?.name),
    score: firstText(item.score, item.scoreText)
  };
}
const LINEUP_STAT_LABELS = Object.freeze({
  19: 'Passes completos', 53: 'Passes longos', 52: 'Cruzamentos', 54: 'Dribles',
  80: 'Passes no último terço', 46: 'Passes decisivos', 42: 'Faltas cometidas',
  37: 'Faltas sofridas', 73: 'Posse perdida', 86: 'Recuperações', 39: 'Desarmes',
  41: 'Interceptações', 40: 'Cortes', 23: 'Defesas', 56: 'Duelos aéreos', 55: 'Duelos no chão'
});
function aggregateLineupStats(lineup, teamName) {
  const totals = new Map();
  for (const player of asArray(lineup?.members)) {
    for (const stat of asArray(player?.stats)) {
      const typeId = positiveId(stat.typeId);
      const numericValue = stat.numericValue;
      if (!typeId || !Object.hasOwn(LINEUP_STAT_LABELS, typeId) || !Number.isFinite(numericValue)) continue;
      const current = totals.get(typeId) || 0;
      totals.set(typeId, current + numericValue);
    }
  }
  return {
    team: teamName,
    stats: [...totals.entries()].map(([typeId, value]) => ({ typeId, name: LINEUP_STAT_LABELS[typeId], value }))
  };
}
function normalizeShotEvent(event, home, away) {
  const item = asObject(event);
  const competitorNum = Number(item.competitorNum);
  const xg = Number(item.xg);
  return {
    xg: Number.isFinite(xg) ? xg : null,
    outcome: firstText(item.outcome?.name, item.outcome?.displayName, item.outcomeName, item.result?.name),
    team: competitorNum === 1 ? home.name : competitorNum === 2 ? away.name : '',
    minute: firstText(item.gameTime, item.minute, item.timeLabel),
    player: firstText(item.athlete?.name, item.player?.name, item.playerName),
    competitorNum: Number.isFinite(competitorNum) ? competitorNum : null
  };
}
function normalizeGameDetails(payload) {
  const game = extractGame(payload);
  const home = asObject(game.homeCompetitor);
  const away = asObject(game.awayCompetitor);
  const members = asArray(game.members);
  const memberMap = buildGameMemberMap(members);
  const isNationalTeam = Boolean(game.isNationalTeam || home.isNationalTeam || away.isNationalTeam);
  const homeLineup = extractLineup(home, memberMap, isNationalTeam);
  const awayLineup = extractLineup(away, memberMap, isNationalTeam);
  const competition = competitionOf(game);
  const teams = teamsOf(game);
  const rawCompetitorStats = asArray(game.stats?.competitorsStats);
  const rawAthleteStats = asArray(game.stats?.athletesStats);
  const lineupPlayersWithStats = [...homeLineup.members, ...awayLineup.members].filter(member => member.stats.length);
  const athleteStatsCount = rawAthleteStats.length || lineupPlayersWithStats.length;
  const aggregatedCompetitors = [aggregateLineupStats(homeLineup, teams.home.name), aggregateLineupStats(awayLineup, teams.away.name)];
  const hasAggregatedCompetitorStats = aggregatedCompetitors.some(row => row.stats.length);
  const gameEvents = asArray(game.events).map(event => normalizeGameEvent(event, memberMap, teams.home, teams.away));
  const shotEvents = asArray(game.chartEvents?.events).map(event => normalizeShotEvent(event, teams.home, teams.away));
  return {
    gameId: positiveId(game.id || game.gameId),
    startTime: firstText(game.startTime),
    status: firstText(game.statusText, game.status?.name),
    statusGroup: game.statusGroup ?? game.status?.group ?? null,
    score: { home: teams.home.score, away: teams.away.score },
    home: teams.home,
    away: teams.away,
    competition,
    round: firstText(game.roundName, Number(game.roundNum) > 0 ? `Rodada ${Number(game.roundNum)}` : '', game.stageName, Number(game.stageNum) > 0 ? `Fase ${Number(game.stageNum)}` : ''),
    roundNum: positiveId(game.roundNum),
    stageNum: positiveId(game.stageNum),
    venue: firstText(game.venue?.name),
    venueCapacity: game.venue?.capacity ?? null,
    referee: firstText(game.officials?.[0]?.name),
    tvNetworks: asArray(game.tvNetworks).map(x => firstText(x.name, x.displayName, x)).filter(Boolean).slice(0, 20),
    lineups: { home: homeLineup, away: awayLineup },
    membersCount: members.length,
    eventsCount: gameEvents.length,
    events: gameEvents,
    chartEventsCount: shotEvents.length,
    shots: shotEvents,
    statsAvailable: Boolean(rawCompetitorStats.length || rawAthleteStats.length || lineupPlayersWithStats.length || hasAggregatedCompetitorStats),
    statistics: {
      competitors: rawCompetitorStats.length || (hasAggregatedCompetitorStats ? aggregatedCompetitors.filter(row => row.stats.length).length : 0),
      athletes: athleteStatsCount,
      lineupPlayers: lineupPlayersWithStats.length,
      competitorRows: rawCompetitorStats.length ? rawCompetitorStats : aggregatedCompetitors,
      athleteRows: rawAthleteStats,
      playerRows: lineupPlayersWithStats.map(player => ({ athleteId: player.athleteId, name: player.name, team: homeLineup.members.includes(player) ? teams.home.name : teams.away.name, stats: player.stats }))
    },
    responseKeys: Object.keys(game).slice(0, 100)
  };
}

function foldMatchText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}
const MATCH_TEAM_ALIASES = new Map([
  ['man utd', 'manchester united'], ['man united', 'manchester united'], ['manchester utd', 'manchester united'],
  ['man city', 'manchester city'], ['spurs', 'tottenham'], ['paris saint germain', 'psg'],
  ['inter milan', 'inter'], ['internazionale', 'inter'], ['atletico de madrid', 'atletico madrid'],
  ['athletic club', 'athletic bilbao'], ['bayern munchen', 'bayern munich'],
  ['sporting cp', 'sporting'], ['benfica lisbon', 'benfica'], ['porto fc', 'porto'],
  ['junior', 'junior barranquilla'], ['atletico junior', 'junior barranquilla']
]);
function normalizeMatchTeam(value) {
  let key = foldMatchText(value);
  if (MATCH_TEAM_ALIASES.has(key)) return MATCH_TEAM_ALIASES.get(key);
  key = key.replace(/^(?:fc|cf|ac|as|ssc|ss|sc|cd|ca|afc|rcd|rc|ud|vfb|ec)\s+/, '');
  key = key.replace(/\b(?:football club|fc|cf|club|deportivo|futbol club)\b/g, ' ').replace(/\s+/g, ' ').trim();
  return MATCH_TEAM_ALIASES.get(key) || key;
}
function teamNameSimilarity(left, right) {
  const a = normalizeMatchTeam(left), b = normalizeMatchTeam(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if ((a.length >= 5 && b.includes(a)) || (b.length >= 5 && a.includes(b))) return Math.min(a.length, b.length) / Math.max(a.length, b.length) * 0.92;
  const aa = new Set(a.split(' ')), bb = new Set(b.split(' '));
  const intersection = [...aa].filter(token => bb.has(token)).length;
  return intersection ? (2 * intersection) / (aa.size + bb.size) : 0;
}
function localDateInSaoPaulo(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
function localMinutesInSaoPaulo(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return Number(values.hour) * 60 + Number(values.minute);
}
function parseAgendaDate(row) {
  const direct = firstText(row.dateEvent, row.date, row.startDate);
  if (/^\d{4}-\d{2}-\d{2}$/.test(direct)) return direct;
  return localDateInSaoPaulo(row.start || row.startTime || row.start_time || '');
}
function parseAgendaMinutes(row) {
  const direct = firstText(row.timeText, row.time, row.horario, row.start_time);
  const match = direct.match(/(?:T|\s)?(\d{1,2}):(\d{2})/);
  if (match && Number(match[1]) < 24 && Number(match[2]) < 60) return Number(match[1]) * 60 + Number(match[2]);
  return localMinutesInSaoPaulo(row.start || row.startTime || '');
}
function compareCompetitionNames(left, right) {
  const a = foldMatchText(left).replace(/\b(?:league|liga|championship|campeonato|division|divisao|serie|series)\b/g, ' ').replace(/\s+/g, ' ').trim();
  const b = foldMatchText(right).replace(/\b(?:league|liga|championship|campeonato|division|divisao|serie|series)\b/g, ' ').replace(/\s+/g, ' ').trim();
  if (!a || !b) return null;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  return teamNameSimilarity(a, b) >= 0.72;
}
function matchAgendaEvents(agendaEvents, scoresGames) {
  const events = asArray(agendaEvents).slice(0, 250);
  const games = asArray(scoresGames).slice(0, 500);
  return events.map(eventValue => {
    const event = asObject(eventValue);
    const home = firstText(event.home, event.homeName, event.homeTeam?.name, event.teams?.home?.name);
    const away = firstText(event.away, event.awayName, event.awayTeam?.name, event.teams?.away?.name);
    const date = parseAgendaDate(event);
    const competition = firstText(event.league, event.competition, event.competitionName);
    if (!home || !away || !date) return { eventId: firstText(event.id), home, away, date, competition, candidates: [], reason: 'Partida da agenda sem times ou data suficientes para comparar.' };
    const candidates = [];
    for (const game of games) {
      const item = asObject(game);
      const gameDate = localDateInSaoPaulo(item.startTime);
      if (!gameDate || gameDate !== date) continue;
      const gameHome = firstText(item.home?.name), gameAway = firstText(item.away?.name);
      const directHome = teamNameSimilarity(home, gameHome);
      const directAway = teamNameSimilarity(away, gameAway);
      const reverseHome = teamNameSimilarity(home, gameAway);
      const reverseAway = teamNameSimilarity(away, gameHome);
      const direct = Math.min(directHome, directAway);
      const reversed = Math.min(reverseHome, reverseAway);
      const isReversed = reversed > direct;
      const teamScore = Math.max(direct, reversed);
      if (teamScore < 0.68) continue;
      const gameCompetition = firstText(item.competition?.name);
      const competitionMatch = compareCompetitionNames(competition, gameCompetition);
      const agendaMinutes = parseAgendaMinutes(event);
      const gameMinutes = localMinutesInSaoPaulo(item.startTime);
      const timeDiffMinutes = agendaMinutes === null || gameMinutes === null ? null : Math.abs(agendaMinutes - gameMinutes);
      const timeScore = timeDiffMinutes === null ? 0.5 : timeDiffMinutes <= 15 ? 1 : timeDiffMinutes <= 45 ? 0.8 : timeDiffMinutes <= 90 ? 0.55 : timeDiffMinutes <= 180 ? 0.25 : 0;
      const score = Math.round((teamScore * 0.72 + 0.15 + (competitionMatch === true ? 0.08 : competitionMatch === false ? 0 : 0.04) + timeScore * 0.05) * 100);
      const exactOriented = directHome === 1 && directAway === 1;
      const confidence = exactOriented && competitionMatch !== false && (timeDiffMinutes === null || timeDiffMinutes <= 90) ? 'alta' : 'revisar';
      candidates.push({
        gameId: positiveId(item.gameId), startTime: item.startTime, home: gameHome, away: gameAway,
        competition: gameCompetition, competitionId: positiveId(item.competition?.id),
        score, confidence, reversed: isReversed, teamScore: Math.round(teamScore * 100),
        competitionMatch, timeDiffMinutes,
        reasons: [exactOriented ? 'times idênticos' : isReversed ? 'ordem dos times invertida ou nomes aproximados' : 'nomes aproximados', 'mesma data', competitionMatch === true ? 'competição compatível' : competitionMatch === false ? 'competição diferente: conferir' : 'competição não comparável', timeDiffMinutes === null ? 'horário não comparável' : `${timeDiffMinutes} min de diferença`]
      });
    }
    candidates.sort((a, b) => b.score - a.score);
    return { eventId: firstText(event.id), home, away, date, competition, candidates: candidates.slice(0, 3) };
  });
}

class Scores365Service {
  constructor(options = {}) {
    this.baseUrl = String(options.baseUrl || API_BASE).replace(/\/$/, '');
    this.fetchImpl = options.fetch || globalThis.fetch;
    this.engine = options.engine || null;
    this.now = options.now || (() => Date.now());
    this.timeoutMs = Math.max(3000, Number(options.timeoutMs) || 12000);
    this.requestGapMs = Math.max(100, Number(options.requestGapMs) || 250);
    this.perMinuteLimit = Math.max(1, Number(options.perMinuteLimit) || 12);
    this.dailySoftLimit = Math.max(1, Number(options.dailySoftLimit) || 200);
    this.lastRequestAt = 0;
    this.requestQueue = Promise.resolve();
    this.inflight = new Map();
    if (typeof this.fetchImpl !== 'function') throw new Error('Este Node.js não oferece fetch nativo.');
  }

  cacheKey(endpoint, params) {
    const query = new URLSearchParams({ ...DEFAULT_PARAMS, ...(params || {}) });
    return `${String(endpoint).replace(/^\//, '')}?${query.toString()}`.slice(0, 215);
  }

  async waitForRequestSlot() {
    const turn = this.requestQueue.then(async () => {
      const waitMs = Math.max(0, this.lastRequestAt + this.requestGapMs - this.now());
      if (waitMs) await new Promise(resolve => setTimeout(resolve, waitMs));
      this.lastRequestAt = this.now();
    });
    this.requestQueue = turn.catch(() => {});
    await turn;
  }

  async request(endpoint, params = {}, options = {}) {
    const route = String(endpoint || '');
    if (!Object.values(ENDPOINTS).includes(route)) throw Object.assign(new Error('Endpoint 365Scores não permitido pelo adaptador.'), { status: 400, code: '365SCORES_ENDPOINT_INVALID' });
    const url = new URL(`${this.baseUrl}${route}`);
    for (const [key, value] of Object.entries({ ...DEFAULT_PARAMS, ...params })) {
      if (value !== undefined && value !== null && String(value) !== '') url.searchParams.set(key, String(value));
    }
    const cacheKey = String(options.cacheKey || this.cacheKey(route, params));
    if (!options.force && this.engine) {
      const cached = this.engine.get('365scores', cacheKey);
      if (cached !== null && cached !== undefined) return { data: cached, cached: true, record: this.engine.getRecord('365scores', cacheKey) };
    }
    if (!options.force && this.inflight.has(cacheKey)) return this.inflight.get(cacheKey);

    const task = (async () => {
      if (this.engine) {
        this.engine.reserveRequest('365scores', { perMinuteLimit: this.perMinuteLimit, dailySoftLimit: this.dailySoftLimit, reserve: 0 });
      }
      await this.waitForRequestSlot();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await this.fetchImpl(url.toString(), {
          method: 'GET',
          headers: { Accept: 'application/json', 'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.7' },
          signal: controller.signal,
          cache: 'no-store'
        });
        const text = await response.text();
        let payload;
        try { payload = JSON.parse(text || '{}'); }
        catch { throw Object.assign(new Error(`A 365Scores retornou conteúdo que não é JSON (HTTP ${response.status}).`), { status: response.status || 502, code: '365SCORES_INVALID_JSON' }); }
        if (!response.ok) {
          const messages = {
            401: 'A 365Scores não autorizou a consulta.',
            403: 'A 365Scores recusou a consulta. Não tente contornar o bloqueio.',
            404: 'A 365Scores não encontrou esse recurso.',
            429: 'A 365Scores limitou temporariamente as consultas. Aguarde antes de tentar novamente.'
          };
          throw Object.assign(new Error(messages[response.status] || `A 365Scores respondeu HTTP ${response.status}.`), { status: response.status, code: `365SCORES_HTTP_${response.status}` });
        }
        if (payload && payload.error) throw Object.assign(new Error(String(payload.error.message || payload.error)), { status: 502, code: '365SCORES_UPSTREAM_ERROR' });
        const ttlMs = Math.max(1000, Math.min(Number(options.ttlMs) || 60_000, 30 * 24 * 60 * 60_000));
        if (this.engine) this.engine.set('365scores', cacheKey, payload, ttlMs);
        return { data: payload, cached: false, record: this.engine?.getRecord('365scores', cacheKey) || null };
      } catch (error) {
        if (error.name === 'AbortError') throw Object.assign(new Error('A consulta à 365Scores excedeu o tempo limite.'), { status: 504, code: '365SCORES_TIMEOUT' });
        if (error.code) throw error;
        throw Object.assign(new Error(`Não foi possível consultar a 365Scores: ${error.message || 'falha de rede'}`), { status: 502, code: '365SCORES_NETWORK' });
      } finally { clearTimeout(timer); }
    })();
    if (!options.force) this.inflight.set(cacheKey, task);
    try { return await task; }
    finally { if (this.inflight.get(cacheKey) === task) this.inflight.delete(cacheKey); }
  }

  connectionCacheKey() { return this.cacheKey(ENDPOINTS.sports, {}); }
  gamesForDateCacheKey(date) {
    const formattedDate = isoToBrDate(date);
    return this.cacheKey(ENDPOINTS.allScores, { sports: '1', startDate: formattedDate, endDate: formattedDate, showOdds: 'false', onlyMajorGames: 'false', withTop: 'false' });
  }
  gameCacheKey(gameId, matchupId = '') {
    const id = positiveId(gameId);
    if (!id) throw Object.assign(new Error('Informe um gameId numérico válido.'), { status: 400, code: '365SCORES_GAME_ID_INVALID' });
    return this.cacheKey(ENDPOINTS.game, { gameId: String(id), showOdds: 'false', matchupId: /^\d+-\d+-\d+$/.test(String(matchupId)) ? String(matchupId) : '' });
  }
  standingsCacheKey(competitionId, options = {}) {
    const id = positiveId(competitionId);
    if (!id) throw Object.assign(new Error('Informe um competitionId numérico válido.'), { status: 400, code: '365SCORES_COMPETITION_ID_INVALID' });
    return this.cacheKey(ENDPOINTS.standings, { competitions: String(id), live: 'false', withSeasonsFilter: 'true', seasonNum: options.seasonNum || '', stageNum: options.stageNum || '' });
  }
  async testConnection(options = {}) {
    const result = await this.request(ENDPOINTS.sports, {}, { cacheKey: 'connection-test:v1', ttlMs: 10 * 60_000, force: Boolean(options.force) });
    const data = asObject(result.data);
    const hasRecognizableCatalog = ['sports', 'countries', 'competitions'].some(key => Array.isArray(data[key]));
    if (!hasRecognizableCatalog) throw Object.assign(new Error('A 365Scores respondeu, mas o catálogo esperado não foi encontrado. O formato pode ter mudado.'), { status: 502, code: '365SCORES_UNEXPECTED_SHAPE' });
    return {
      ok: true, provider: '365Scores', experimental: true, cached: result.cached,
      counts: { sports: asArray(data.sports).length, countries: asArray(data.countries).length, competitions: asArray(data.competitions).length },
      message: 'A resposta da 365Scores foi recebida e o formato básico foi reconhecido. Isso não valida cobertura de todas as competições nem autorização de reutilização.'
    };
  }

  async getGamesForDate(date, options = {}) {
    const formattedDate = isoToBrDate(date);
    const params = { sports: '1', startDate: formattedDate, endDate: formattedDate, showOdds: 'false', onlyMajorGames: 'false', withTop: 'false' };
    const result = await this.request(ENDPOINTS.allScores, params, { cacheKey: this.gamesForDateCacheKey(date), ttlMs: 60_000, force: Boolean(options.force) });
    const games = extractGames(result.data).map(normalizeGame).filter(game => game.gameId && (game.home.name || game.away.name));
    return { date, games, count: games.length, cached: result.cached, record: result.record, rawCount: extractGames(result.data).length };
  }

  async getGame(gameId, options = {}) {
    const id = positiveId(gameId);
    if (!id) throw Object.assign(new Error('Informe um gameId numérico válido.'), { status: 400, code: '365SCORES_GAME_ID_INVALID' });
    const params = { gameId: String(id), showOdds: 'false' };
    if (options.matchupId && /^\d+-\d+-\d+$/.test(String(options.matchupId))) params.matchupId = String(options.matchupId);
    const result = await this.request(ENDPOINTS.game, params, { cacheKey: this.gameCacheKey(id, params.matchupId || ''), ttlMs: 30_000, force: Boolean(options.force) });
    const details = normalizeGameDetails(result.data);
    if (!details.gameId) details.gameId = id;
    return { details, cached: result.cached, record: result.record };
  }

  async getStandings(competitionId, options = {}) {
    const id = positiveId(competitionId);
    if (!id) throw Object.assign(new Error('Informe um competitionId numérico válido.'), { status: 400, code: '365SCORES_COMPETITION_ID_INVALID' });
    const params = { competitions: String(id), live: 'false', withSeasonsFilter: 'true' };
    if (options.seasonNum) params.seasonNum = String(options.seasonNum);
    if (options.stageNum) params.stageNum = String(options.stageNum);
    return this.request(ENDPOINTS.standings, params, { cacheKey: this.standingsCacheKey(id, options), ttlMs: 180_000, force: Boolean(options.force) });
  }

  async getBrackets(competitionId, options = {}) {
    const id = positiveId(competitionId);
    if (!id) throw Object.assign(new Error('Informe um competitionId numérico válido.'), { status: 400, code: '365SCORES_COMPETITION_ID_INVALID' });
    return this.request(ENDPOINTS.brackets, { competitions: String(id), live: 'false' }, { ttlMs: 60 * 60_000, force: Boolean(options.force) });
  }

  async getCompetitionStats(competitionId, options = {}) {
    const id = positiveId(competitionId);
    if (!id) throw Object.assign(new Error('Informe um competitionId numérico válido.'), { status: 400, code: '365SCORES_COMPETITION_ID_INVALID' });
    return this.request(ENDPOINTS.competitionStats, { competitions: String(id), competitors: '', withSeasons: 'true' }, { ttlMs: 180_000, force: Boolean(options.force) });
  }
}

module.exports = {
  Scores365Service, API_BASE, DEFAULT_PARAMS, ENDPOINTS,
  isoToBrDate, extractGames, normalizeGame, normalizeGameDetails, matchAgendaEvents, normalizeMatchTeam, teamNameSimilarity
};
