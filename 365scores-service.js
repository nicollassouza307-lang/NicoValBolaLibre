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
    country: firstText(first.countryName, first.country?.name, nested.countryName),
    // Keep the season/stage attached to the game so standings requests cannot
    // accidentally reuse the competition's default season when the game is historical.
    seasonNum: positiveId(game?.seasonNum || first.seasonNum || nested.seasonNum || game?.season?.num || game?.season?.seasonNum || game?.season?.id),
    stageNum: positiveId(game?.stageNum || first.stageNum || nested.stageNum || game?.stage?.num)
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
  const raw = String(value || '').trim().toUpperCase();
  const compact = raw.replace(/[^A-Z]/g, '');
  // A 365Scores frequentemente devolve abreviações curtas (CB, CM, ST).
  // Sem normalizá-las, o campo tratava quase todos os atletas como defensores.
  if (/^(G|GK|GKP|KEEPER)$/.test(compact)) return 'G';
  if (/^(D|DF|DEF|CB|LCB|RCB|LB|RB|LWB|RWB|FB|WB)$/.test(compact)) return 'D';
  if (/^(M|MF|MID|CM|LCM|RCM|CDM|DM|CAM|AM|LM|RM)$/.test(compact)) return 'M';
  if (/^(F|FW|ATT|ST|CF|LW|RW|LF|RF|SS|W)$/.test(compact)) return 'F';
  const text = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/goal|goleir|keeper/.test(text)) return 'G';
  if (/defen|defens|back|zague|lateral/.test(text)) return 'D';
  if (/mid|meio|volant|meia/.test(text)) return 'M';
  if (/attack|atac|forward|wing|striker|ponta/.test(text)) return 'F';
  return raw.slice(0, 2);
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
function isOwnGoalText(value) {
  const text = String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[_-]+/g, ' ').trim();
  return /\bown\s*goal\b|\bautogol\b|\bautogolo\b|\bgol\s+contra\b/.test(text);
}
function isTruthyEventFlag(value) {
  if (value === true || value === 1) return true;
  return ['true', '1', 'yes', 'sim'].includes(String(value ?? '').trim().toLowerCase());
}
function eventTypeLabel(typeId, typeName = '', ownGoal = false) {
  const labels = { 1: 'Gol', 2: 'Cartão amarelo', 3: 'Cartão vermelho', 12: 'Bola na trave', 1000: 'Substituição' };
  const numeric = Number(typeId);
  const hasNumericType = Number.isInteger(numeric) && numeric >= 0;
  const text = String(typeName || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  // Um gol contra também pode chegar com typeId=1 (Gol). A indicação específica
  // do evento deve prevalecer sobre o código genérico.
  if (ownGoal || isOwnGoalText(typeName)) return 'Gol contra';
  if (hasNumericType && labels[numeric]) return labels[numeric];
  if (text) {
    if (/goal|gol|penalty scored/.test(text)) return 'Gol';
    if (/yellow|amarelo/.test(text)) return 'Cartão amarelo';
    if (/red card|cartao vermelho|expulsion|expulsao/.test(text)) return 'Cartão vermelho';
    if (/substitution|substituicao|substituição/.test(text)) return 'Substituição';
    if (/penalty missed|missed penalty|penalti perdido/.test(text)) return 'Pênalti perdido';
    if (/post|woodwork|trave/.test(text)) return 'Bola na trave';
    if (/var/.test(text)) return 'VAR';
    if (/half.?time|intervalo/.test(text)) return 'Intervalo';
    if (/full.?time|fim de jogo|match ended/.test(text)) return 'Fim de jogo';
    return String(typeName).trim();
  }
  return hasNumericType ? `Evento (tipo ${numeric})` : 'Evento';
}
function normalizeGameEvent(event, memberMap, home, away) {
  const item = asObject(event);
  const nestedType = asObject(item.type || item.eventType || item.event?.type || item.EventType);
  const rawTypeId = item.typeId ?? item.TypeId ?? item.eventTypeId ?? item.EventTypeId ?? nestedType.id ?? nestedType.ID ?? nestedType.typeId ?? item.event?.typeId ?? item.eventType ?? (typeof item.type === 'number' ? item.type : null) ?? item.Type ?? null;
  const rawTypeName = firstText(
    item.eventTypeName, item.EventTypeName, item.typeName, item.TypeName,
    item.eventSubTypeName, item.subTypeName, item.goalTypeName,
    nestedType.name, nestedType.displayName, nestedType.description,
    typeof item.type === 'string' ? item.type : '',
    typeof item.eventType === 'string' ? item.eventType : '',
    typeof item.Type === 'string' ? item.Type : ''
  );
  const ownGoalFlag = [
    item.isOwnGoal, item.ownGoal, item.own_goal, item.IsOwnGoal, item.OwnGoal,
    item.isOwnGoalEvent, item.event?.isOwnGoal, item.event?.ownGoal,
    item.goal?.isOwnGoal, item.goal?.ownGoal, nestedType.isOwnGoal, nestedType.ownGoal
  ].some(isTruthyEventFlag);
  const ownGoalText = [
    rawTypeName, item.eventSubType, item.subType, item.subtype, item.goalType,
    item.eventDescription, item.description, item.Description, item.comment,
    item.Comment, item.shortText, item.eventName, item.EventName, item.detail,
    item.Details, item.note, item.message, item.goal?.type, item.goal?.typeName
  ].some(isOwnGoalText);
  const isOwnGoal = ownGoalFlag || ownGoalText;
  const athleteId = positiveId(item.athleteId || item.playerId || item.memberId || item.player?.id || item.athlete?.id || item.PID);
  const rawPlayer = item.player || item.athlete || item.Player;
  const player = (athleteId && memberMap.get(athleteId)) || asObject(rawPlayer);
  const secondAthleteId = positiveId(item.assistAthleteId || item.assistPlayerId || item.substituteId || item.inAthleteId || item.assist?.id || item.PID2 || item.extraPlayerId);
  const rawSecondPlayer = item.assist || item.inPlayer || item.secondaryPlayer || item.ExtraPlayers?.[0];
  const secondPlayer = (secondAthleteId && memberMap.get(secondAthleteId)) || asObject(rawSecondPlayer);
  const competitorRaw = item.competitorNum ?? item.competitor?.competitorNum ?? item.Comp ?? item.side;
  const competitorNum = Number(competitorRaw);
  const type = eventTypeLabel(rawTypeId, rawTypeName, isOwnGoal);
  const rawDetail = firstText(item.description, item.Description, item.comment, item.Comment, item.shortText, item.eventName, item.EventName, item.detail, item.Details, rawTypeName);
  const detail = type === 'Gol contra' && isOwnGoalText(rawDetail) ? '' : rawDetail;
  return {
    typeId: Number.isInteger(Number(rawTypeId)) && rawTypeId !== null && rawTypeId !== undefined ? Number(rawTypeId) : null,
    type,
    minute: firstText(item.gameTime, item.minute, item.time, item.timeLabel, item.displayTime, item.GTD, item.GT),
    player: firstText(player.name, player.displayName, player.longName, player.shortName, typeof rawPlayer === 'string' ? rawPlayer : '', item.playerName, item.PlayerName, item.name, item.Player),
    secondaryPlayer: firstText(secondPlayer.name, secondPlayer.displayName, secondPlayer.longName, secondPlayer.shortName, typeof rawSecondPlayer === 'string' ? rawSecondPlayer : '', item.assistName, item.inPlayerName, item.Player2, item.ExtraPlayers?.[0]),
    team: competitorNum === 1 ? home.name : competitorNum === 2 ? away.name : firstText(item.competitor?.name, item.team?.name, item.teamName, item.TeamName),
    detail: detail && detail !== type ? detail : '',
    score: firstText(item.score, item.scoreText, item.S, item.result?.score)
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
function addShotTotalsToCompetitors(rows, shotEvents, teams) {
  const result = asArray(rows).map(row => ({ ...row, stats: asArray(row?.stats || row?.rows).slice() }));
  for (const [side, team] of [['home', teams.home], ['away', teams.away]]) {
    const teamShots = asArray(shotEvents).filter(shot => shot.team && shot.team === team.name);
    if (!teamShots.length) continue;
    let row = result.find(item => String(item.team || item.competitor?.name || item.name || '') === team.name);
    if (!row) {
      row = { team: team.name, stats: [] };
      result.push(row);
    }
    const names = row.stats.map(stat => String(stat?.name || stat?.typeName || stat?.type?.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase());
    const hasShots = names.some(name => /^(total shots|shots|finalizacoes|finalizacoes totais)$/.test(name));
    if (!hasShots) row.stats.push({ typeId: 0, name: 'Finalizações', value: teamShots.length, source: 'chartEvents' });
  }
  return result;
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
  const gameEvents = asArray(game.events).map(event => normalizeGameEvent(event, memberMap, teams.home, teams.away));
  const shotEvents = asArray(game.chartEvents?.events).map(event => normalizeShotEvent(event, teams.home, teams.away));
  const competitorRows = addShotTotalsToCompetitors(rawCompetitorStats.length ? rawCompetitorStats : aggregatedCompetitors, shotEvents, teams);
  const hasAggregatedCompetitorStats = aggregatedCompetitors.some(row => row.stats.length);
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
      competitors: competitorRows.filter(row => asArray(row.stats).length).length,
      athletes: athleteStatsCount,
      lineupPlayers: lineupPlayersWithStats.length,
      competitorRows,
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
  ['man city', 'manchester city'], ['spurs', 'tottenham'], ['tottenham hotspur', 'tottenham'],
  ['paris saint germain', 'psg'], ['paris sg', 'psg'], ['paris saint-germain', 'psg'],
  ['inter milan', 'inter'], ['internazionale', 'inter'], ['fc internazionale', 'inter'],
  ['atletico de madrid', 'atletico madrid'], ['atleti', 'atletico madrid'], ['athletic club', 'athletic bilbao'],
  ['bayern munchen', 'bayern munich'], ['fc bayern', 'bayern munich'], ['bayern munchen fc', 'bayern munich'],
  ['barca', 'barcelona'], ['fc barcelona', 'barcelona'], ['real madrid cf', 'real madrid'],
  ['sporting cp', 'sporting'], ['sporting clube de portugal', 'sporting'], ['benfica lisbon', 'benfica'], ['porto fc', 'porto'],
  ['junior', 'junior barranquilla'], ['atletico junior', 'junior barranquilla'],
  ['river plate', 'river plate'], ['ca river plate', 'river plate'], ['boca juniors', 'boca juniors'],
  ['nottm forest', 'nottingham forest'], ['nott forest', 'nottingham forest'], ['nottingham forest', 'nottingham forest'],
  ['athletico pr', 'athletico paranaense'], ['athletico paranaense', 'athletico paranaense'], ['atletico pr', 'athletico paranaense'],
  ['atletico go', 'atletico goianiense'], ['atletico goianiense', 'atletico goianiense'],
  ['club atletico boca juniors', 'boca juniors'], ['flamengo crf', 'flamengo'], ['cr flamengo', 'flamengo'],
  ['palmeiras se', 'palmeiras'], ['se palmeiras', 'palmeiras'], ['sao paulo fc', 'sao paulo'], ['spfc', 'sao paulo'],
  ['atletico mg', 'atletico mineiro'], ['atletico mineiro mg', 'atletico mineiro'], ['galo', 'atletico mineiro'],
  ['vasco da gama', 'vasco'], ['cr vasco da gama', 'vasco'], ['gremio fbpa', 'gremio'],
  ['cucuta deportivo', 'cucuta'], ['deportivo cucuta', 'cucuta'], ['cucuta', 'cucuta']
]);
function normalizeMatchTeam(value) {
  let key = foldMatchText(value);
  if (MATCH_TEAM_ALIASES.has(key)) return MATCH_TEAM_ALIASES.get(key);
  key = key.replace(/^(?:fc|cf|ac|as|ssc|ss|sc|cd|ca|afc|rcd|rc|ud|vfb|ec|cr|se)\s+/, '');
  key = key.replace(/\b(?:football club|fc|cf|club|deportivo|futbol club|football|soccer|clube)\b/g, ' ').replace(/\s+/g, ' ').trim();
  // Sufixos comuns de escudos/fontes brasileiras (RJ, MG, SP, RS etc.) não
  // fazem parte do nome principal do clube.
  key = key.replace(/\s+(?:rj|mg|sp|rs|pr|ba|sc|pe|ce|go|mt|ms|df|pb|rn|al|es|se|pi|to|fr|paulista|carioca)$/i, '').trim();
  return MATCH_TEAM_ALIASES.get(key) || key;
}
function editDistance(left, right) {
  const a = String(left), b = String(right);
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length];
}
function teamNameSimilarity(left, right) {
  const a = normalizeMatchTeam(left), b = normalizeMatchTeam(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if ((a.length >= 5 && b.includes(a)) || (b.length >= 5 && a.includes(b))) return Math.min(a.length, b.length) / Math.max(a.length, b.length) * 0.92;
  const aa = new Set(a.split(' ')), bb = new Set(b.split(' '));
  const shared = [...aa].filter(token => bb.has(token));
  if (shared.length) {
    const shorter = aa.size <= bb.size ? aa : bb;
    // Muitos feeds usam nome curto de TV (ex.: Corinthians) e outros o nome
    // oficial (ex.: Corinthians Paulista). Se todos os tokens do nome curto
    // estiverem presentes no longo, isso é uma correspondência forte.
    if ([...shorter].every(token => (aa.size <= bb.size ? bb : aa).has(token))) return 0.92;
    const dice = (2 * shared.length) / (aa.size + bb.size);
    if (dice >= 0.5) return dice;
  }
  // Erros pequenos de grafia e abreviações não devem zerar um par que já está
  // dentro da data consultada. Exige distância relativa razoável para evitar
  // associar nomes curtos e genéricos por acidente.
  const maxLength = Math.max(a.length, b.length);
  const editScore = maxLength >= 7 ? 1 - editDistance(a, b) / maxLength : 0;
  return editScore >= 0.72 ? editScore * 0.9 : 0;
}
function dateValueInSaoPaulo(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number' || (typeof value === 'string' && /^\d{10,13}$/.test(value.trim()))) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    const epochMs = numeric >= 100000000000 ? numeric : numeric >= 1000000000 ? numeric * 1000 : NaN;
    return Number.isFinite(epochMs) ? new Date(epochMs) : null;
  }
  const raw = String(value).trim();
  if (!raw) return null;
  // O endpoint pode devolver somente a data ou uma data/hora local sem offset.
  // Nunca deixe o fuso do servidor (Railway/Windows) decidir o dia da partida.
  const localDateTime = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(raw);
  const normalized = localDateTime ? `${raw.replace(' ', 'T')}-03:00` : raw;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
function localDateInSaoPaulo(value) {
  if (value === null || value === undefined || value === '') return '';
  const raw = typeof value === 'string' ? value.trim() : '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const brDate = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brDate) return `${brDate[3]}-${brDate[2]}-${brDate[1]}`;
  const date = dateValueInSaoPaulo(value);
  if (!date) return '';
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
function localMinutesInSaoPaulo(value) {
  if (!value) return null;
  const date = dateValueInSaoPaulo(value);
  if (!date) return null;
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return Number(values.hour) * 60 + Number(values.minute);
}
function parseAgendaDate(row) {
  const direct = firstText(row.dateEvent, row.date, row.startDate);
  if (/^\d{4}-\d{2}-\d{2}$/.test(direct) || /^\d{2}\/\d{2}\/\d{4}$/.test(direct)) return localDateInSaoPaulo(direct);
  return localDateInSaoPaulo(row.start || row.startTime || row.start_time || '');
}
function calendarDayDistance(left, right) {
  if (!left || !right) return null;
  const a = Date.parse(`${left}T12:00:00Z`), b = Date.parse(`${right}T12:00:00Z`);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.round(Math.abs(a - b) / 86400000) : null;
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
function canonicalCompetitionForAutoMatch(value) {
  const raw = foldMatchText(value).replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  if (/^(?:campeonato )?brasileirao(?: serie a)?$/.test(raw) || /^(?:campeonato )?brasileiro serie a$/.test(raw) || raw === 'serie a do brasil') return 'brasileirao';
  if (/^(?:colombia )?primera a$/.test(raw) || raw === 'colombia primera division' || raw === 'liga colombiana primera a') return 'colombia primera a';
  if (/^(?:english )?premier league$/.test(raw)) return 'premier league';
  if (/^(?:la liga|laliga|liga espanola|primera division espana)$/.test(raw)) return 'laliga';
  if (/^(?:uefa )?champions league$/.test(raw)) return 'champions league';
  if (/^(?:italian )?serie a(?: italy)?$/.test(raw) || raw === 'serie a italia') return 'serie a italy';
  return raw;
}
function competitionAutoMatch(left, right) {
  const a = canonicalCompetitionForAutoMatch(left);
  const b = canonicalCompetitionForAutoMatch(right);
  return Boolean(a && b && a === b);
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
    const diagnostics = { sourceGames: games.length, sameDateGames: 0, adjacentDateGames: 0, gamesWithoutDate: 0, gamesWithoutTeams: 0, bestTeamScore: 0, bestHomeScore: 0, bestAwayScore: 0, bestPairAverage: 0, bestGame: '' };
    if (!home || !away || !date) return { eventId: firstText(event.id), home, away, date, competition, candidates: [], diagnostics, reason: 'Partida da agenda sem times ou data suficientes para comparar.' };
    const candidates = [];
    for (const game of games) {
      const item = asObject(game);
      const gameDate = localDateInSaoPaulo(item.startTime || item.startDate || item.date || item.startTimestamp || item.timestamp);
      if (!gameDate) { diagnostics.gamesWithoutDate++; continue; }
      const dayDistance = calendarDayDistance(date, gameDate);
      if (dayDistance === 0) diagnostics.sameDateGames++;
      else if (dayDistance === 1) diagnostics.adjacentDateGames++;
      else continue;

      const gameHome = firstText(item.home?.name), gameAway = firstText(item.away?.name);
      if (!gameHome || !gameAway) { diagnostics.gamesWithoutTeams++; continue; }
      const directHome = teamNameSimilarity(home, gameHome);
      const directAway = teamNameSimilarity(away, gameAway);
      const reverseHome = teamNameSimilarity(home, gameAway);
      const reverseAway = teamNameSimilarity(away, gameHome);
      const direct = Math.min(directHome, directAway);
      const reversedScore = Math.min(reverseHome, reverseAway);
      const isReversed = reversedScore > direct;
      const teamScore = Math.max(direct, reversedScore);
      const selectedHomeScore = isReversed ? reverseHome : directHome;
      const selectedAwayScore = isReversed ? reverseAway : directAway;
      const pairAverage = (selectedHomeScore + selectedAwayScore) / 2;
      const strongestSide = Math.max(selectedHomeScore, selectedAwayScore);
      if (pairAverage > diagnostics.bestPairAverage / 100) {
        diagnostics.bestTeamScore = Math.round(teamScore * 100);
        diagnostics.bestHomeScore = Math.round(selectedHomeScore * 100);
        diagnostics.bestAwayScore = Math.round(selectedAwayScore * 100);
        diagnostics.bestPairAverage = Math.round(pairAverage * 100);
        diagnostics.bestGame = `${gameHome} x ${gameAway} (${gameDate})`;
      }
      const agendaMinutes = parseAgendaMinutes(event);
      const gameMinutes = localMinutesInSaoPaulo(item.startTime || item.startDate || item.date || item.startTimestamp || item.timestamp);
      const rawTimeDiff = agendaMinutes === null || gameMinutes === null ? null : Math.abs(agendaMinutes - gameMinutes);
      const timeDiffMinutes = rawTimeDiff === null ? null : dayDistance === 1 ? Math.min(rawTimeDiff, 1440 - rawTimeDiff) : rawTimeDiff;
      const gameCompetition = firstText(item.competition?.name);
      const competitionMatch = compareCompetitionNames(competition, gameCompetition);
      const strictCompetitionMatch = competitionAutoMatch(competition, gameCompetition);
      // Para a mesma data, um time reconhecido já pode revelar um candidato
      // útil para revisão. O par fraco nunca é auto-vinculado. Para data vizinha,
      // mantemos a regra estrita de virada da meia-noite.
      const sameLocalDate = dayDistance === 0;
      const broadSameDateCandidate = sameLocalDate && (
        teamScore >= 0.50 ||
        (strongestSide >= 0.68 && pairAverage >= 0.30) ||
        (competitionMatch === true && strongestSide >= 0.50 && pairAverage >= 0.25)
      );
      const midnightCandidate = dayDistance === 1 && teamScore >= 0.88 && rawTimeDiff !== null && rawTimeDiff >= 1380 && timeDiffMinutes <= 90;
      if (!broadSameDateCandidate && !midnightCandidate) continue;
      const rankingTeamScore = Math.max(teamScore, pairAverage * 0.78);
      const timeScore = timeDiffMinutes === null ? 0.45 : timeDiffMinutes <= 15 ? 1 : timeDiffMinutes <= 30 ? 0.9 : timeDiffMinutes <= 60 ? 0.72 : timeDiffMinutes <= 90 ? 0.5 : timeDiffMinutes <= 180 ? 0.2 : 0;
      const competitionScore = competitionMatch === true ? 0.13 : competitionMatch === false ? 0 : 0.07;
      const orientationScore = isReversed ? 0.015 : 0.075;
      const score = Math.max(0, Math.min(100, Math.round(rankingTeamScore * 0.72 * 100 + timeScore * 10 + competitionScore * 100 + orientationScore * 100)));
      const exactOriented = directHome >= 0.98 && directAway >= 0.98 && !isReversed;
      const confidence = exactOriented && sameLocalDate && competitionMatch !== false && (timeDiffMinutes === null || timeDiffMinutes <= 90) ? 'alta' : teamScore >= 0.50 ? 'revisar' : 'baixa';
      const reasons = [exactOriented ? 'times correspondentes' : isReversed ? 'ordem invertida ou nomes aproximados' : 'comparação parcial de nomes', sameLocalDate ? 'mesma data local' : 'data vizinha: conferir virada de dia', competitionMatch === true ? 'competição compatível' : competitionMatch === false ? 'competição diferente: conferir' : 'competição não comparável', timeDiffMinutes === null ? 'horário não comparável' : `${timeDiffMinutes} min de diferença`, `mandante ${Math.round(selectedHomeScore * 100)}%`, `visitante ${Math.round(selectedAwayScore * 100)}%`];
      if (teamScore < 0.50) reasons.push('sugestão fraca: exige confirmação manual');
      candidates.push({
        gameId: positiveId(item.gameId), startTime: item.startTime, home: gameHome, away: gameAway,
        homeId: positiveId(item.home?.id), awayId: positiveId(item.away?.id),
        homeScore: item.home?.score ?? null, awayScore: item.away?.score ?? null,
        status: firstText(item.status), competition: gameCompetition, competitionId: positiveId(item.competition?.id),
        score, confidence, autoEligible: false, reversed: isReversed, exactOriented,
        teamScore: Math.round(teamScore * 100), teamAverageScore: Math.round(pairAverage * 100),
        homeTeamScore: Math.round(selectedHomeScore * 100), awayTeamScore: Math.round(selectedAwayScore * 100),
        competitionMatch, competitionAutoMatch: strictCompetitionMatch, timeDiffMinutes, dateDiffDays: dayDistance, reasons
      });
    }
    candidates.sort((a, b) => b.score - a.score || b.teamScore - a.teamScore);
    const first = candidates[0];
    const runnerUp = candidates[1];
    // Associação automática permanece muito conservadora. Sugestões de data
    // vizinha, nomes aproximados e competição não canônica exigem confirmação.
    if (first) {
      const margin = runnerUp ? first.score - runnerUp.score : 100;
      first.autoEligible = Boolean(
        first.gameId && first.exactOriented && first.dateDiffDays === 0 && first.competitionAutoMatch === true &&
        first.timeDiffMinutes !== null && first.timeDiffMinutes <= 45 &&
        first.score >= 95 && margin >= 12
      );
      first.autoMargin = margin;
      if (first.autoEligible) first.reasons.push('correspondência inequívoca: apta para vínculo automático');
    }
    return { eventId: firstText(event.id), home, away, date, competition, candidates: candidates.slice(0, 3), diagnostics };
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
    const rawGames = extractGames(result.data);
    const normalizedGames = rawGames.map(normalizeGame);
    const games = normalizedGames.filter(game => game.gameId && (game.home.name || game.away.name));
    const normalization = {
      raw: rawGames.length,
      normalized: games.length,
      missingGameId: normalizedGames.filter(game => !game.gameId).length,
      missingHomeName: normalizedGames.filter(game => !game.home.name).length,
      missingAwayName: normalizedGames.filter(game => !game.away.name).length,
      missingBothTeamNames: normalizedGames.filter(game => !game.home.name && !game.away.name).length
    };
    return { date, games, count: games.length, cached: result.cached, record: result.record, rawCount: rawGames.length, normalization };
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
  isoToBrDate, extractGames, normalizeGame, normalizeGameDetails, matchAgendaEvents, normalizeMatchTeam, teamNameSimilarity, positionCode
};
