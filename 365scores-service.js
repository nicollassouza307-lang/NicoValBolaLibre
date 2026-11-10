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
function validScore(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
function categoryType(...values) {
  const text = values.map(value => String(value || '')).join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const women = /\b(women|woman|feminine|feminino|feminina|ladies|womens|female)\b/.test(text);
  const youth = /\b(u[- ]?1[56789]|u[- ]?20|u[- ]?21|u[- ]?23|sub[- ]?1[56789]|sub[- ]?20|sub[- ]?21|sub[- ]?23|youth|junior|juvenil|juniores|reserves|reserva)\b/.test(text);
  if (women && youth) return 'women_youth';
  if (women) return 'women';
  if (youth) return 'youth';
  if (/\b(men|masculine|masculino|masculina)\b/.test(text)) return 'men';
  return text ? 'men' : '';
}
function extractLiveClock(game) {
  const item = asObject(game);
  const statusText = firstText(item.statusText, item.status?.name, item.status?.shortName);
  if (/^(?:ht|half time|halftime|intervalo|interval)$/i.test(statusText)) return 'INT';
  const candidates = [item.gameTimeDisplay, item.gameTime, item.clock, item.timer, item.elapsed, item.minute, item.status?.gameTime, item.status?.time, statusText];
  for (const value of candidates) {
    const text = firstText(value);
    if (!text) continue;
    if (/^(?:ht|half time|halftime|intervalo|interval)$/i.test(text)) return 'INT';
    const match = text.match(/^(\d{1,3})(?:\s*\+\s*(\d{1,2}))?\s*'?$/);
    if (match) return `${match[1]}${match[2] ? `+${match[2]}` : ''}'`;
  }
  return '';
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
function roundLabelOf(game) {
  const item=asObject(game);
  const round=asObject(item.round);
  const raw=firstText(item.roundName,item.roundDisplayName,item.roundLabel,item.matchRound,round.name,round.displayName,round.roundName,round.label,typeof item.round==='string'?item.round:'');
  const roundValue=(typeof item.round==='number'||/^\d+$/.test(String(item.round??'').trim()))?item.round:null;
  const numeric=positiveId(item.roundNum||item.roundNumber||item.matchdayNumber||item.matchday||round.num||round.number||roundValue||item.weekNumber||item.week);
  if(raw){
    if(/^\d+$/.test(raw))return `Rodada ${Number(raw)}`;
    if(/^(?:round|rodada|matchday|jornada|fecha)\s*\d+/i.test(raw))return raw.replace(/^round\s*/i,'Rodada ').replace(/^matchday\s*/i,'Rodada ').replace(/^jornada\s*/i,'Rodada ').replace(/^fecha\s*/i,'Rodada ');
    if(/round of 16|group|stage|regular season|playoff|quarter|semi.?final|final|fase/i.test(raw))return /^fase\b/i.test(raw)?raw:`Fase: ${raw}`;
    return raw;
  }
  if(numeric)return `Rodada ${numeric}`;
  const stage=firstText(item.stageName,item.stage?.name,item.stage?.displayName);
  const stageNum=positiveId(item.stageNum||item.stage?.num);
  if(stage)return /^fase\b/i.test(stage)?stage:`Fase: ${stage}`;
  if(stageNum)return `Fase ${stageNum}`;
  return '';
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
    home: { id: positiveId(homeTeam.id || homeTeam.competitorId), name: competitorName(homeTeam), score: validScore(homeTeam.score ?? homeTeam.result), logo: firstText(homeTeam.imageUrl, homeTeam.logoUrl, homeTeam.logo, homeTeam.image?.url, homeTeam.logo?.url) },
    away: { id: positiveId(awayTeam.id || awayTeam.competitorId), name: competitorName(awayTeam), score: validScore(awayTeam.score ?? awayTeam.result), logo: firstText(awayTeam.imageUrl, awayTeam.logoUrl, awayTeam.logo, awayTeam.image?.url, awayTeam.logo?.url) }
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
    clock: extractLiveClock(item),
    category: categoryType(item.categoryName, item.gender, item.competitorType, competition.name, item.competitionDisplayName, item.competitionName),
    home: teams.home,
    away: teams.away,
    competition,
    round: roundLabelOf(item),
    venue: firstText(item.venue?.name, item.venueName),
    tvNetworks: asArray(item.tvNetworks).map(x => firstText(x.name, x.displayName, x)).filter(Boolean).slice(0, 20)
  };
}
function buildGameMemberMap(gameMembers, homeLineup = [], awayLineup = []) {
  const map = new Map();
  const all = [...asArray(gameMembers), ...asArray(homeLineup), ...asArray(awayLineup)];
  for (const member of all) {
    const item = asObject(member);
    const ids = [positiveId(item.id), positiveId(item.athleteId), positiveId(item.playerId) ].filter(Boolean);
    for (const id of ids) {
      const current=map.get(id)||{};
      // Dados completos de game.members têm prioridade, mas não descarte um
      // nome/ID que só exista no objeto da escalação.
      map.set(id,{...item,...current,...Object.fromEntries(Object.entries(item).filter(([key,value])=>value!==null&&value!==undefined&&value!==''))});
    }
  }
  return map;
}
function athleteImageUrl(id, isNationalTeam = false) {
  const athleteId = positiveId(id);
  if (!athleteId) return '';
  const base = 'https://imagecache.365scores.com/image/upload/f_png,w_34,h_34,c_limit,q_auto:eco,dpr_2,d_Athletes:default.png,r_max,c_thumb,g_face,z_0.65';
  return `${base}/v1/Athletes/${isNationalTeam ? 'NationalTeam/' : ''}${athleteId}`;
}
function firstImageUrl(...values) {
  for (const value of values) {
    const candidate = typeof value === 'string' ? value : firstText(value?.url, value?.imageUrl, value?.photoUrl, value?.src);
    if (!candidate) continue;
    try {
      const url = new URL(candidate);
      if (url.protocol === 'https:') return url.toString();
    } catch {}
  }
  return '';
}
function normalizeStatRows(rows) {
  return asArray(rows).map(row => {
    const item = asObject(row);
    const type = item.type;
    const typeId = positiveId(item.typeId || (typeof type === 'number' || typeof type === 'string' ? type : type?.id));
    const value = item.value ?? item.displayValue ?? item.val ?? null;
    const raw=String(value??'').trim().replace(/,/g,'.');
    const ratio=raw.match(/(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)(?:\s*\(\s*(-?\d+(?:\.\d+)?)\s*%\s*\))?/);
    const simple=raw!==''?Number(raw.replace('%','')):NaN;
    const success=ratio?Number(ratio[1]):(Number.isFinite(simple)?simple:null);
    const attempts=ratio?Number(ratio[2]):null;
    const percentage=ratio?(ratio[3]!==undefined?Number(ratio[3]):(attempts>0?success/attempts*100:null)):(/%$/.test(raw)&&Number.isFinite(simple)?simple:null);
    return {
      typeId,
      name: firstText(item.name, item.typeName, item.label, typeof type === 'object' ? type?.name : ''),
      value,
      numericValue:typeof value==='number'?value:(ratio?success:(Number.isFinite(simple)?simple:null)),
      successValue:Number.isFinite(success)?success:null,
      attemptsValue:Number.isFinite(attempts)?attempts:null,
      percentageValue:Number.isFinite(percentage)?percentage:null
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
    // A posição do integrante da escalação é mais específica que o perfil
    // global do atleta, que pode vir genérico/desatualizado em algumas partidas.
    const position = asObject(member?.position || detail.position);
    const photoId = positiveId(detail.athleteId || detail.id || athleteId);
    const positionName = firstText(member?.position?.name, member?.positionName, member?.positionNameShort, member?.positionCode, position.name, position.displayName, position.shortName, position.code, detail.positionName);
    return {
      id: photoId,
      athleteId: photoId,
      name: firstText(detail.name, detail.displayName, detail.longName, detail.shortName, member?.name, member?.displayName, member?.longName, member?.shortName),
      number: detail.jerseyNumber ?? detail.shirtNumber ?? detail.number ?? member?.jerseyNumber ?? member?.shirtNumber ?? member?.number ?? null,
      position: positionName,
      positionCode: positionCode(positionName),
      rating: detail.rating ?? detail.performanceScore ?? member?.rating ?? member?.performanceScore ?? null,
      status: Number.isFinite(Number(member?.status)) ? Number(member.status) : null,
      formationPosition: asObject(member?.yardFormation || detail.yardFormation),
      photoUrl: athleteImageUrl(photoId, isNationalTeam),
      stats: normalizeStatRows([...asArray(detail.stats), ...asArray(member?.stats)])
    };
  });
  const coachSource = asObject(lineup.coach || source.coach || lineup.manager || source.manager);
  const coachRaw = coaches[0] || coachSource;
  const coachId = positiveId(coachRaw?.athleteId || coachRaw?.id || coachSource.athleteId || coachSource.id || coachSource.coachId || coachSource.managerId);
  const coachMember = normalizedMembers.find(member => coachId && member.id === coachId) || null;
  const coachName = firstText(coachMember?.name, coachSource.name, coachSource.displayName, coachSource.longName, coachSource.shortName, coachRaw?.name, coachRaw?.displayName, coachRaw?.longName, coachRaw?.shortName);
  const coachPhotoUrl = firstImageUrl(
    coachSource.imageUrl, coachSource.photoUrl, coachSource.photo, coachSource.picture, coachSource.image, coachSource.photoPath,
    coachRaw?.imageUrl, coachRaw?.photoUrl, coachRaw?.photo, coachRaw?.picture, coachRaw?.image, coachRaw?.photoPath,
    coachMember?.photoUrl
  ) || (coachId ? `https://imagecache.365scores.com/image/upload/f_png,w_96,h_96,c_limit,q_auto:eco,dpr_2,d_Managers:default.png/v1/Managers/${coachId}` : '');
  return {
    formation: firstText(lineup.formation, source.formation),
    total: members.length,
    starters: starters.length,
    substitutes: members.filter(member => Number(member?.status) === 2 && !coaches.includes(member)).length,
    coaches: coaches.length,
    coach: { id: coachId, name: coachName, photoUrl: coachPhotoUrl },
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
  if (/second yellow|double yellow|2nd yellow|duplo amarelo|segundo amarelo/.test(text)) return 'Duplo amarelo';
  if (/penalty missed|missed penalty|penalti perdido/.test(text)) return 'Pênalti perdido';
  if (/penalty saved|saved penalty|penalti defendido|defended penalty/.test(text)) return 'Pênalti defendido';
  if (hasNumericType && labels[numeric]) return labels[numeric];
  if (text) {
    if (/goal|gol|penalty scored/.test(text)) return 'Gol';
    if (/yellow|amarelo/.test(text)) return 'Cartão amarelo';
    if (/red card|cartao vermelho|expulsion|expulsao/.test(text)) return 'Cartão vermelho';
    if (/substitution|substituicao|substituição/.test(text)) return 'Substituição';
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
  const rawTypeName = firstText(item.eventTypeName,item.EventTypeName,item.typeName,item.TypeName,item.eventSubTypeName,item.subTypeName,item.goalTypeName,nestedType.name,nestedType.displayName,nestedType.description,typeof item.type==='string'?item.type:'',typeof item.eventType==='string'?item.eventType:'',typeof item.Type==='string'?item.Type:'');
  const periodText = firstText(item.period?.name,item.period?.displayName,item.period?.shortName,item.periodName,item.periodDisplayName,item.phase?.name,item.phase?.displayName,item.phase,item.stage?.name,item.stageName,item.eventPhase,item.periodType);
  const shootoutFlag = [item.isPenaltyShootout,item.penaltyShootout,item.isShootout,item.shootout,item.isPenaltyShootoutEvent,item.isShootoutEvent].some(isTruthyEventFlag);
  const shootoutText = [periodText,item.subType,item.subtype,item.eventSubType,item.eventSubTypeName,item.description,item.detail,item.comment,rawTypeName,item.gameTimeDisplay,item.gameTime,item.minute,item.timeLabel].join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const isPenaltyShootout = shootoutFlag || /penalty\s*shoot.?out|shoot.?out|disputa\s+de\s+penaltis|disputa\s+por\s+penaltis|serie\s+de\s+penaltis|cobrancas?\s+de\s+penaltis|\b(?:pens?|penalties)\s*#?\d*\b/i.test(shootoutText);
  const ownGoalFlag=[item.isOwnGoal,item.ownGoal,item.own_goal,item.IsOwnGoal,item.OwnGoal,item.isOwnGoalEvent,item.event?.isOwnGoal,item.event?.ownGoal,item.goal?.isOwnGoal,item.goal?.ownGoal,nestedType.isOwnGoal,nestedType.ownGoal].some(isTruthyEventFlag);
  const ownGoalText=[rawTypeName,item.eventSubType,item.subType,item.subtype,item.goalType,item.eventDescription,item.description,item.Description,item.comment,item.Comment,item.shortText,item.eventName,item.EventName,item.detail,item.Details,item.note,item.message,item.goal?.type,item.goal?.typeName].some(isOwnGoalText);
  const isOwnGoal=ownGoalFlag||ownGoalText;
  const isSubstitution=/substitution|substitu/i.test(rawTypeName)||Number(rawTypeId)===1000;
  const substitution=asObject(item.substitution||item.substitutionData||item.Substitution||item.substitutionDetails);
  const outObject=asObject(item.outPlayer||item.playerOut||item.outAthlete||item.playerOff||item.playerOffData||item.subOut||item.substitutedPlayer||substitution.out||substitution.playerOut||substitution.outgoingPlayer||substitution.playerOff||substitution.outgoing);
  const inObject=asObject(item.inPlayer||item.playerIn||item.inAthlete||item.playerOn||item.player2||item.athlete2||item.secondPlayer||item.subIn||item.substitutePlayer||substitution.in||substitution.playerIn||substitution.incomingPlayer||substitution.playerOn||substitution.incoming);
  const athleteId=positiveId((isSubstitution?(item.outAthleteId||item.outPlayerId||item.playerOutId||item.exitingAthleteId||item.substitutedAthleteId||item.playerOffId||item.outgoingPlayerId||item.subOutId||outObject.id||outObject.athleteId||outObject.playerId):null)||item.athleteId||item.playerId||item.memberId||item.player?.id||item.athlete?.id||item.Player?.id||item.PID);
  const rawPlayer=item.outPlayer||item.playerOut||item.outAthlete||item.playerOff||item.playerOffData||item.subOut||item.substitutedPlayer||substitution.out||substitution.playerOut||substitution.outgoingPlayer||substitution.playerOff||item.player||item.athlete||item.Player||item.P;
  const player=(athleteId&&memberMap.get(athleteId))||outObject||asObject(rawPlayer);
  const secondAthleteId=positiveId((isSubstitution?(item.inAthleteId||item.inPlayerId||item.playerInId||item.enteringAthleteId||item.substituteId||item.playerOnId||item.incomingPlayerId||item.subInId||inObject.id||inObject.athleteId||inObject.playerId):null)||item.assistAthleteId||item.assistPlayerId||item.assist?.id||item.PID2||item.extraPlayerId||item.secondaryPlayer?.id||item.ExtraPlayers?.[0]?.id);
  const rawSecondPlayer=item.inPlayer||item.playerIn||item.inAthlete||item.playerOn||item.player2||item.athlete2||item.secondPlayer||item.subIn||item.substitutePlayer||substitution.in||substitution.playerIn||substitution.incomingPlayer||substitution.playerOn||item.assist||item.secondaryPlayer||item.ExtraPlayers?.[0]||item.P2||item.player2Name||item.secondPlayerName;
  const secondPlayer=(secondAthleteId&&memberMap.get(secondAthleteId))||inObject||asObject(rawSecondPlayer);
  const stringPlayer=typeof rawPlayer==='string'?rawPlayer:'';
  const stringSecond=typeof rawSecondPlayer==='string'?rawSecondPlayer:'';
  const outName=firstText(player.name,player.displayName,player.longName,player.shortName,stringPlayer,item.outPlayerName,item.playerOutName,item.exitingPlayerName,item.exitingPlayer,item.PlayerOutName,item.playerOffName,item.PlayerOffName,substitution.outName,substitution.playerOutName,substitution.outgoingName,item.substitutedPlayerName,item.playerName,item.P,item.p);
  const inName=firstText(secondPlayer.name,secondPlayer.displayName,secondPlayer.longName,secondPlayer.shortName,stringSecond,item.inPlayerName,item.playerInName,item.enteringPlayerName,item.enteringPlayer,item.PlayerInName,item.playerOnName,item.PlayerOnName,substitution.inName,substitution.playerInName,substitution.enteringPlayerName,substitution.incomingName,item.substituteName,item.SubstituteName,item.playerName2,item.PlayerName2,item.athleteName2,item.P2,item.p2,item.player2Name,item.secondPlayerName,item.incomingName);
  const competitorRaw=item.competitorNum??item.competitor?.competitorNum??item.CompetitorNum??item.Comp??item.side??item.competitorSide??item.teamSide;
  const explicitHome=item.isHome===true||item.isHomeCompetitor===true||String(item.homeAway||item.side||item.teamSide||'').toLowerCase()==='home';
  const explicitAway=item.isHome===false||item.isAway===true||item.isAwayCompetitor===true||String(item.homeAway||item.side||item.teamSide||'').toLowerCase()==='away';
  const competitorNum=Number(competitorRaw);
  const nestedTeam=asObject(item.team||item.competitor||item.competitorData||item.Team);
  const teamId=positiveId(item.teamId||item.competitorId||item.competitor?.id||item.team?.id||item.TeamId||item.CompetitorId||nestedTeam.teamId);
  const rawTeamName=firstText(nestedTeam.name,nestedTeam.shortName,item.teamName,item.TeamName,item.competitorName,item.CompetitorName);
  const memberTeamNum=Number(player.competitorNum||player.teamNum||player.competitor?.competitorNum||player.team?.competitorNum);
  const memberTeamId=positiveId(player.competitorId||player.teamId||player.competitor?.id||player.team?.id);
  const team=(teamId&&teamId===home.id)||(memberTeamId&&memberTeamId===home.id)||competitorNum===1||explicitHome||memberTeamNum===1?home.name:(teamId&&teamId===away.id)||(memberTeamId&&memberTeamId===away.id)||competitorNum===2||explicitAway||memberTeamNum===2?away.name:rawTeamName;
  const resolvedTeamId=teamId||memberTeamId||(team===home.name?home.id:team===away.name?away.id:null);
  const type=eventTypeLabel(rawTypeId,rawTypeName,isOwnGoal);
  const rawDetail=firstText(item.description,item.Description,item.comment,item.Comment,item.shortText,item.eventName,item.EventName,item.detail,item.Details,rawTypeName);
  const detail=type==='Gol contra'&&isOwnGoalText(rawDetail)?'':rawDetail;
  return {
    typeId:Number.isInteger(Number(rawTypeId))&&rawTypeId!==null&&rawTypeId!==undefined?Number(rawTypeId):null,
    type,
    minute:firstText(item.gameTime,item.minute,item.time,item.timeLabel,item.displayTime,item.GTD,item.GT,item.gameTimeDisplay),
    playerId:athleteId,
    player:outName||firstText(item.playerName,item.PlayerName,item.name,typeof item.Player==='string'?item.Player:''),
    secondaryPlayerId:secondAthleteId,
    secondaryPlayer:inName||firstText(item.assistName,item.inPlayerName,item.Player2,item.P2,item.player2Name,item.secondPlayerName,typeof item.ExtraPlayers?.[0]==='string'?item.ExtraPlayers[0]:''),
    team,teamId:resolvedTeamId,
    competitorNum:Number.isFinite(competitorNum)&&[1,2].includes(competitorNum)?competitorNum:(team===home.name?1:team===away.name?2:null),
    detail:detail&&detail!==type?detail:'',
    score:firstText(item.score,item.scoreText,item.S,item.result?.score),
    period:periodText,
    isPenaltyShootout,
    eventGroup:isPenaltyShootout?'penalty-shootout':'match'
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
  const homeRawMembers=asArray(game.homeCompetitor?.lineups?.members||game.homeCompetitor?.lineup?.members);
  const awayRawMembers=asArray(game.awayCompetitor?.lineups?.members||game.awayCompetitor?.lineup?.members);
  const memberMap = buildGameMemberMap(members,homeRawMembers,awayRawMembers);
  const isNationalTeam = Boolean(game.isNationalTeam || home.isNationalTeam || away.isNationalTeam);
  const homeLineup = extractLineup(home, memberMap, isNationalTeam);
  const awayLineup = extractLineup(away, memberMap, isNationalTeam);
  const competition = competitionOf(game);
  const teams = teamsOf(game);
  const rawCompetitorStats = asArray(game.stats?.competitorsStats);
  const rawAthleteStats = asArray(game.stats?.athletesStats);
  const athleteStatsById = new Map();
  for (const raw of rawAthleteStats) {
    const item = asObject(raw);
    const id = positiveId(item.athleteId || item.playerId || item.id || item.athlete?.id);
    if (id) athleteStatsById.set(id, normalizeStatRows(item.stats || item.values || item.statistics));
  }
  for (const lineup of [homeLineup, awayLineup]) {
    for (const member of lineup.members) {
      const externalStats = athleteStatsById.get(member.athleteId) || [];
      const merged = new Map([...member.stats, ...externalStats].map(stat => [String(stat.typeId || stat.name).toLowerCase(), stat]));
      member.stats = [...merged.values()];
      const rating = member.stats.find(stat => /rating|nota|performance score/i.test(String(stat.name || '')));
      if (rating && rating.value !== null && rating.value !== undefined) member.rating = rating.value;
    }
  }
  const lineupPlayersWithStats = [...homeLineup.members, ...awayLineup.members].filter(member => member.stats.length);
  const athleteStatsCount = rawAthleteStats.length || lineupPlayersWithStats.length;
  const aggregatedCompetitors = [aggregateLineupStats(homeLineup, teams.home.name), aggregateLineupStats(awayLineup, teams.away.name)];
  const rawEvents = asArray(game.events).length ? asArray(game.events) : asArray(game.events?.events || game.gameEvents || game.incidents || game.timeline);
  const gameEvents = rawEvents.map(event => normalizeGameEvent(event, memberMap, teams.home, teams.away));
  const shotEvents = asArray(game.chartEvents?.events).map(event => normalizeShotEvent(event, teams.home, teams.away));
  const competitorRows = addShotTotalsToCompetitors(rawCompetitorStats.length ? rawCompetitorStats : aggregatedCompetitors, shotEvents, teams);
  const hasAggregatedCompetitorStats = aggregatedCompetitors.some(row => row.stats.length);
  const rawPenaltyScore = asObject(game.penaltyScore || game.penalty_score || game.penalties || game.score?.penalties || game.score?.penalty || game.shootout?.score || game.shootoutScore);
  const homePenaltyScore = validScore(rawPenaltyScore.home ?? rawPenaltyScore.homeScore ?? home.penaltyScore ?? home.penalties ?? home.shootoutScore);
  const awayPenaltyScore = validScore(rawPenaltyScore.away ?? rawPenaltyScore.awayScore ?? away.penaltyScore ?? away.penalties ?? away.shootoutScore);
  return {
    gameId: positiveId(game.id || game.gameId),
    startTime: firstText(game.startTime),
    status: firstText(game.statusText, game.status?.name),
    statusGroup: game.statusGroup ?? game.status?.group ?? null,
    clock: extractLiveClock(game),
    category: categoryType(game.categoryName, game.gender, game.competitorType, competition.name, game.competitionDisplayName, game.competitionName),
    score: { home: validScore(teams.home.score), away: validScore(teams.away.score), penalties: { home: homePenaltyScore, away: awayPenaltyScore } },
    home: teams.home,
    away: teams.away,
    competition,
    round: roundLabelOf(game),
    roundNum: positiveId(game.roundNum),
    stageNum: positiveId(game.stageNum),
    venue: firstText(game.venue?.name, game.venue?.stadium?.name, game.venueName, game.stadium?.name, game.ground?.name, game.stadiumName),
    venueAddress: firstText(game.venue?.address, game.venue?.city, game.venue?.location, game.venue?.countryName, game.stadium?.address, game.stadium?.city, game.ground?.address, game.location?.name),
    venueCapacity: game.venue?.capacity ?? game.venue?.stadium?.capacity ?? game.stadium?.capacity ?? game.ground?.capacity ?? game.stadiumCapacity ?? game.venueCapacity ?? null,
    referee: firstText(...asArray(game.officials).filter(x => /referee|arbitro|árbitro/i.test(firstText(x.role, x.type, x.position))).map(x => firstText(x.name,x.displayName)), game.referee?.name, game.refereeName, game.mainReferee?.name),
    officials: asArray(game.officials || game.referees || game.matchOfficials).map(x => ({ name:firstText(x.name, x.displayName), role:firstText(x.role, x.type, x.position) })).filter(x => x.name).slice(0, 12),
    tvNetworks: asArray(game.tvNetworks || game.broadcasts || game.tvChannels || game.broadcasters).map(x => ({ name:firstText(x.name, x.displayName, x.channelName, x), displayName:firstText(x.displayName, x.name, x.channelName, x), country:firstText(x.countryName, x.country?.name), logo:firstText(x.imageUrl, x.logoUrl, x.logo) })).filter(x => x.name).slice(0, 20),
    attendance: game.attendance ?? game.attendanceCount ?? null,
    weather: firstText(game.weather?.description, game.weather?.name),
    refereeCount: asArray(game.officials).length,
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
      rawCompetitorStats,
      rawAthleteStats,
      playerRows: (() => {
        const rows = new Map();
        for (const player of lineupPlayersWithStats) rows.set(String(player.athleteId || player.id || player.name), { athleteId:player.athleteId, name:player.name, team:homeLineup.members.includes(player)?teams.home.name:teams.away.name, stats:player.stats });
        for (const raw of rawAthleteStats) {
          const item=asObject(raw); const id=positiveId(item.athleteId||item.playerId||item.id||item.athlete?.id);
          const member=id?memberMap.get(id):null;
          const name=firstText(item.name,item.athlete?.name,item.player?.name,member?.name);
          const stats=normalizeStatRows(item.stats||item.values||item.statistics);
          if(!name||!stats.length)continue;
          const side=Number(item.competitorNum||item.competitor?.competitorNum);
          const key=String(id||name);
          const existing=rows.get(key);
          rows.set(key,{athleteId:id||existing?.athleteId||null,name,team:side===1?teams.home.name:side===2?teams.away.name:(existing?.team||''),stats:stats.length?stats:(existing?.stats||[])});
        }
        return [...rows.values()];
      })()
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
  // Não cortar a lista por posição: o AllScores agrega jogos de várias datas,
  // e a ordem da resposta pode colocar centenas de partidas de ontem antes
  // das partidas da data solicitada. Cada agenda deve avaliar toda a janela.
  const games = asArray(scoresGames);
  const matches = events.map(eventValue => {
    const event = asObject(eventValue);
    const home = firstText(event.home, event.homeName, event.homeTeam?.name, event.teams?.home?.name);
    const away = firstText(event.away, event.awayName, event.awayTeam?.name, event.teams?.away?.name);
    const date = parseAgendaDate(event);
    const competition = firstText(event.league, event.competition, event.competitionName);
    const agendaCategory = categoryType(event.category, event.gender, event.competitionCategory, competition);
    const agendaHomeId = positiveId(event.scores365HomeId || event.home365Id || event.homeTeam365Id);
    const agendaAwayId = positiveId(event.scores365AwayId || event.away365Id || event.awayTeam365Id);
    const diagnostics = { sourceGames: games.length, sameDateGames: 0, adjacentDateGames: 0, gamesWithoutDate: 0, gamesWithoutTeams: 0, bestTeamScore: 0, bestHomeScore: 0, bestAwayScore: 0, bestPairAverage: 0, bestGame: '' };
    if (!home || !away || !date) return { eventId: firstText(event.id), home, away, date, competition, candidates: [], diagnostics, reason: 'Partida da agenda sem times ou data suficientes para comparar.' };
    const candidates = [];
    let bestDiagnostic = null;
    const diagnosticGames = [];
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
      const gameCategory = categoryType(item.category, item.competition?.category, item.competition?.gender, item.competition?.name);
      const categoryMismatch = Boolean(agendaCategory && gameCategory && agendaCategory !== gameCategory);
      const directHomeName = teamNameSimilarity(home, gameHome);
      const directAwayName = teamNameSimilarity(away, gameAway);
      const reverseHomeName = teamNameSimilarity(home, gameAway);
      const reverseAwayName = teamNameSimilarity(away, gameHome);
      const directHome = agendaHomeId && positiveId(item.home?.id) === agendaHomeId ? 1 : directHomeName;
      const directAway = agendaAwayId && positiveId(item.away?.id) === agendaAwayId ? 1 : directAwayName;
      const reverseHome = agendaHomeId && positiveId(item.away?.id) === agendaHomeId ? 1 : reverseHomeName;
      const reverseAway = agendaAwayId && positiveId(item.home?.id) === agendaAwayId ? 1 : reverseAwayName;
      const direct = Math.min(directHome, directAway);
      const reversedScore = Math.min(reverseHome, reverseAway);
      const isReversed = reversedScore > direct;
      const teamScore = Math.max(direct, reversedScore);
      const selectedHomeScore = isReversed ? reverseHome : directHome;
      const selectedAwayScore = isReversed ? reverseAway : directAway;
      const pairAverage = (selectedHomeScore + selectedAwayScore) / 2;
      const strongestSide = Math.max(selectedHomeScore, selectedAwayScore);
      const gameCompetition = firstText(item.competition?.name);
      const competitionMatch = compareCompetitionNames(competition, gameCompetition);
      const diagnostic = {
        gameId: positiveId(item.gameId), home: gameHome, away: gameAway,
        date: gameDate, competition: gameCompetition,
        teamScore: Math.round(teamScore * 100),
        homeScore: Math.round(selectedHomeScore * 100),
        awayScore: Math.round(selectedAwayScore * 100),
        pairAverage: Math.round(pairAverage * 100),
        dateDiffDays: dayDistance,
        competitionMatch
      };
      // O diagnóstico também precisa mostrar os melhores nomes quando a
      // similaridade é zero. Antes, bestGame ficava vazio e escondia os dados
      // que de fato passaram pelo comparador.
      diagnosticGames.push(diagnostic);
      diagnosticGames.sort((a, b) => b.teamScore - a.teamScore || b.pairAverage - a.pairAverage || Number(b.competitionMatch === true) - Number(a.competitionMatch === true) || a.dateDiffDays - b.dateDiffDays);
      if (diagnosticGames.length > 3) diagnosticGames.pop();
      const diagnosticIsBetter = !bestDiagnostic ||
        diagnostic.teamScore > bestDiagnostic.teamScore ||
        (diagnostic.teamScore === bestDiagnostic.teamScore && diagnostic.pairAverage > bestDiagnostic.pairAverage) ||
        (diagnostic.teamScore === bestDiagnostic.teamScore && diagnostic.pairAverage === bestDiagnostic.pairAverage && Number(diagnostic.competitionMatch === true) > Number(bestDiagnostic.competitionMatch === true)) ||
        (diagnostic.teamScore === bestDiagnostic.teamScore && diagnostic.pairAverage === bestDiagnostic.pairAverage && diagnostic.competitionMatch === bestDiagnostic.competitionMatch && diagnostic.dateDiffDays < bestDiagnostic.dateDiffDays);
      if (diagnosticIsBetter) {
        bestDiagnostic = diagnostic;
        diagnostics.bestTeamScore = diagnostic.teamScore;
        diagnostics.bestHomeScore = diagnostic.homeScore;
        diagnostics.bestAwayScore = diagnostic.awayScore;
        diagnostics.bestPairAverage = diagnostic.pairAverage;
        diagnostics.bestGame = `${gameHome} x ${gameAway} (${gameDate})`;
      }
      const agendaMinutes = parseAgendaMinutes(event);
      const gameMinutes = localMinutesInSaoPaulo(item.startTime || item.startDate || item.date || item.startTimestamp || item.timestamp);
      const rawTimeDiff = agendaMinutes === null || gameMinutes === null ? null : Math.abs(agendaMinutes - gameMinutes);
      const timeDiffMinutes = rawTimeDiff === null ? null : dayDistance === 1 ? Math.min(rawTimeDiff, 1440 - rawTimeDiff) : rawTimeDiff;
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
      const idBonus = (agendaHomeId && ((isReversed ? positiveId(item.away?.id) : positiveId(item.home?.id)) === agendaHomeId) ? 0.08 : 0) + (agendaAwayId && ((isReversed ? positiveId(item.home?.id) : positiveId(item.away?.id)) === agendaAwayId) ? 0.08 : 0);
      const orientationScore = isReversed ? 0.015 : 0.075;
      const score = Math.max(0, Math.min(100, Math.round(rankingTeamScore * 0.72 * 100 + timeScore * 3 + competitionScore * 100 + orientationScore * 100 + idBonus * 100)));
      if (categoryMismatch) { /* Mantém a sugestão visível para diagnóstico, mas bloqueia qualquer associação automática. */ }
      const exactOriented = directHome >= 0.98 && directAway >= 0.98 && !isReversed;
      const confidence = exactOriented && sameLocalDate && competitionMatch !== false && !categoryMismatch ? 'alta' : teamScore >= 0.50 ? 'revisar' : 'baixa';
      const reasons = [exactOriented ? 'times correspondentes' : isReversed ? 'ordem invertida ou nomes aproximados' : 'comparação parcial de nomes', sameLocalDate ? 'mesma data local' : 'data vizinha: conferir virada de dia', competitionMatch === true ? 'competição compatível' : competitionMatch === false ? 'competição diferente: conferir' : 'competição não comparável', timeDiffMinutes === null ? 'horário não comparável' : `${timeDiffMinutes} min de diferença (peso auxiliar)`, `mandante ${Math.round(selectedHomeScore * 100)}%`, `visitante ${Math.round(selectedAwayScore * 100)}%`];
      if (agendaHomeId || agendaAwayId) reasons.push(`IDs 365Scores: ${Number(Boolean(agendaHomeId && ((isReversed ? positiveId(item.away?.id) : positiveId(item.home?.id)) === agendaHomeId))) + Number(Boolean(agendaAwayId && ((isReversed ? positiveId(item.home?.id) : positiveId(item.away?.id)) === agendaAwayId)))} correspondência(s)`);
      if (categoryMismatch) reasons.push(`categoria incompatível: agenda ${agendaCategory} x 365Scores ${gameCategory}`);
      if (teamScore < 0.50) reasons.push('sugestão fraca: exige confirmação manual');
      candidates.push({
        gameId: positiveId(item.gameId), startTime: item.startTime, home: gameHome, away: gameAway,
        homeId: positiveId(item.home?.id), awayId: positiveId(item.away?.id),
        homeScore: item.home?.score ?? null, awayScore: item.away?.score ?? null,
        status: firstText(item.status), category: gameCategory, categoryCompatible: !categoryMismatch, competition: gameCompetition, competitionId: positiveId(item.competition?.id),
        score, confidence, autoEligible: false, reversed: isReversed, exactOriented,
        teamScore: Math.round(teamScore * 100), teamAverageScore: Math.round(pairAverage * 100),
        homeTeamScore: Math.round(selectedHomeScore * 100), awayTeamScore: Math.round(selectedAwayScore * 100),
        competitionMatch, competitionAutoMatch: strictCompetitionMatch, timeDiffMinutes, dateDiffDays: dayDistance, reasons
      });
    }
    candidates.sort((a, b) => b.score - a.score || b.teamScore - a.teamScore);
    diagnostics.bestGames = diagnosticGames;
    const first = candidates[0];
    const runnerUp = candidates[1];
    // Associação automática permanece muito conservadora. Sugestões de data
    // vizinha, nomes aproximados e competição não canônica exigem confirmação.
    if (first) {
      const margin = runnerUp ? first.score - runnerUp.score : 100;
      first.autoEligible = Boolean(
        first.gameId && first.exactOriented && first.dateDiffDays === 0 && first.competitionAutoMatch === true &&
        first.categoryCompatible !== false && first.score >= 90 && margin >= 12
      );
      first.autoMargin = margin;
      if (first.autoEligible) first.reasons.push('correspondência inequívoca: apta para vínculo automático');
      else if (first.categoryCompatible === false) first.reasons.push('vínculo automático bloqueado por categoria incompatível');
    }
    return { eventId: firstText(event.id), home, away, date, competition, candidates: candidates.slice(0, 3), diagnostics };
  });
  // Um jogo do 365Scores só pode pertencer a uma partida da agenda. Quando duas
  // entradas disputam o mesmo gameId, mantém a proposta mais forte e rebaixa
  // a outra para revisão manual, sem apagar a sugestão.
  const claims = new Map();
  for (const match of matches) {
    const candidate=match.candidates?.[0];
    if(!candidate?.autoEligible||!candidate.gameId)continue;
    const key=String(candidate.gameId);
    const current=claims.get(key);
    const strength=(item)=>Number(item.score||0)*10000+Number(item.teamScore||0)*100+Number(item.homeTeamScore||0)+Number(item.awayTeamScore||0);
    if(!current||strength(candidate)>strength(current.candidate))claims.set(key,{match,candidate});
  }
  for (const match of matches) {
    const candidate=match.candidates?.[0];
    if(!candidate?.autoEligible||!candidate.gameId)continue;
    const winner=claims.get(String(candidate.gameId));
    if(winner&&winner.match!==match){candidate.autoEligible=false;candidate.confidence='revisar';candidate.reasons.push('vínculo automático bloqueado: este gameId já foi reivindicado por outra partida da agenda');}
  }
  return matches;
}

class Scores365Service {
  constructor(options = {}) {
    this.baseUrl = String(options.baseUrl || API_BASE).replace(/\/$/, '');
    this.fetchImpl = options.fetch || globalThis.fetch;
    this.engine = options.engine || null;
    this.now = options.now || (() => Date.now());
    this.timeoutMs = Math.max(3000, Number(options.timeoutMs) || 12000);
    this.requestGapMs = Math.max(100, Number(options.requestGapMs) || 250);
    // Não impor uma quota diária/minutal inventada pelo aplicativo. A proteção
    // reage somente a respostas reais do serviço (HTTP 429/403), além do cache
    // e da fila que evita rajadas de chamadas simultâneas.
    this.perMinuteLimit = 0;
    this.dailySoftLimit = 0;
    this.pauseUntil = 0;
    this.pauseStatus = 0;
    this.pauseReason = '';
    this.rateLimitStrikes = 0;
    this.forbiddenStrikes = 0;
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

  parseRetryAfterMs(value) {
    const raw = String(value || '').trim();
    if (!raw) return 0;
    const seconds = Number(raw);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
    const date = Date.parse(raw);
    return Number.isFinite(date) ? Math.max(0, date - this.now()) : 0;
  }

  registerUpstreamPause(status, retryAfterHeader = '') {
    let delay;
    if (Number(status) === 429) {
      this.rateLimitStrikes = Math.min(8, this.rateLimitStrikes + 1);
      const exponential = Math.min(15 * 60_000, 60_000 * (2 ** (this.rateLimitStrikes - 1)));
      const requested = this.parseRetryAfterMs(retryAfterHeader);
      delay = Math.max(exponential, requested);
      this.pauseReason = 'A 365Scores sinalizou excesso de consultas (HTTP 429).';
    } else {
      this.forbiddenStrikes = Math.min(4, this.forbiddenStrikes + 1);
      delay = Math.min(60 * 60_000, 15 * 60_000 * (2 ** (this.forbiddenStrikes - 1)));
      this.pauseReason = 'A 365Scores recusou o acesso (HTTP 403).';
    }
    this.pauseStatus = Number(status) || 0;
    this.pauseUntil = Math.max(this.pauseUntil, this.now() + delay);
    return this.getPauseInfo();
  }

  getPauseInfo() {
    const remainingMs = Math.max(0, this.pauseUntil - this.now());
    return {
      paused: remainingMs > 0,
      status: remainingMs > 0 ? this.pauseStatus : 0,
      reason: remainingMs > 0 ? this.pauseReason : '',
      remainingMs,
      retryAt: remainingMs > 0 ? new Date(this.pauseUntil).toISOString() : null
    };
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

    const pause = this.getPauseInfo();
    if (pause.paused) {
      const minutes = Math.max(1, Math.ceil(pause.remainingMs / 60_000));
      throw Object.assign(new Error(`${pause.reason} Novas consultas pausadas por aproximadamente ${minutes} min.`), {
        status: pause.status || 429,
        code: pause.status === 403 ? '365SCORES_ACCESS_PAUSED' : '365SCORES_RATE_PAUSED',
        retryAfterMs: pause.remainingMs
      });
    }

    const task = (async () => {
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
        if (response.status === 403 || response.status === 429) {
          const pauseInfo = this.registerUpstreamPause(response.status, response.headers?.get?.('retry-after') || '');
          const minutes = Math.max(1, Math.ceil(pauseInfo.remainingMs / 60_000));
          const message = response.status === 403
            ? `A 365Scores recusou o acesso (HTTP 403). Consultas pausadas por aproximadamente ${minutes} min. Não tente contornar o bloqueio.`
            : `A 365Scores limitou temporariamente as consultas (HTTP 429). Nova tentativa após aproximadamente ${minutes} min.`;
          throw Object.assign(new Error(message), {
            status: response.status,
            code: `365SCORES_HTTP_${response.status}`,
            retryAfterMs: pauseInfo.remainingMs
          });
        }
        const text = await response.text();
        let payload;
        try { payload = JSON.parse(text || '{}'); }
        catch { throw Object.assign(new Error(`A 365Scores retornou conteúdo que não é JSON (HTTP ${response.status}).`), { status: response.status || 502, code: '365SCORES_INVALID_JSON' }); }
        if (!response.ok) {
          const messages = {
            401: 'A 365Scores não autorizou a consulta.',
            404: 'A 365Scores não encontrou esse recurso.'
          };
          throw Object.assign(new Error(messages[response.status] || `A 365Scores respondeu HTTP ${response.status}.`), { status: response.status, code: `365SCORES_HTTP_${response.status}` });
        }
        this.rateLimitStrikes = 0;
        if (this.pauseUntil <= this.now()) {
          this.pauseStatus = 0;
          this.pauseReason = '';
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

  async getGamesForDateWindow(date, options = {}) {
    const offsets = Array.isArray(options.offsets) ? options.offsets : [-1, 0, 1];
    isoToBrDate(date);
    const [year, month, day] = String(date).split('-').map(Number);
    const base = new Date(Date.UTC(year, month - 1, day, 12));
    if (!Number.isFinite(base.getTime())) throw Object.assign(new Error('Informe uma data válida.'), { status: 400, code: '365SCORES_INVALID_DATE' });
    const dates = [...new Set(offsets.map(offset => {
      const value = new Date(base); value.setUTCDate(value.getUTCDate() + Number(offset || 0));
      return value.toISOString().slice(0, 10);
    }))];
    const results = [];
    for (const targetDate of dates) results.push(await this.getGamesForDate(targetDate, options));
    const byId = new Map();
    for (const result of results) for (const game of result.games) if (game.gameId && !byId.has(game.gameId)) byId.set(game.gameId, game);
    const games = [...byId.values()];
    return {
      date, dates, games, count: games.length,
      rawCount: results.reduce((sum, item) => sum + Number(item.rawCount || 0), 0),
      normalization: {
        raw: results.reduce((sum, item) => sum + Number(item.normalization?.raw || 0), 0),
        normalized: games.length,
        missingGameId: results.reduce((sum, item) => sum + Number(item.normalization?.missingGameId || 0), 0),
        missingHomeName: results.reduce((sum, item) => sum + Number(item.normalization?.missingHomeName || 0), 0),
        missingAwayName: results.reduce((sum, item) => sum + Number(item.normalization?.missingAwayName || 0), 0),
        missingBothTeamNames: results.reduce((sum, item) => sum + Number(item.normalization?.missingBothTeamNames || 0), 0)
      },
      cached: results.every(item => item.cached), records: results.map(item => item.record).filter(Boolean)
    };
  }

  async getGame(gameId, options = {}) {
    const id = positiveId(gameId);
    if (!id) throw Object.assign(new Error('Informe um gameId numérico válido.'), { status: 400, code: '365SCORES_GAME_ID_INVALID' });
    const params = { gameId: String(id), showOdds: 'false' };
    if (options.matchupId && /^\d+-\d+-\d+$/.test(String(options.matchupId))) params.matchupId = String(options.matchupId);
    const result = await this.request(ENDPOINTS.game, params, { cacheKey: this.gameCacheKey(id, params.matchupId || ''), ttlMs: 90_000, force: Boolean(options.force) });
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
    return this.request(ENDPOINTS.standings, params, { cacheKey: this.standingsCacheKey(id, options), ttlMs: 10 * 60_000, force: Boolean(options.force) });
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
  isoToBrDate, extractGames, normalizeGame, normalizeGameDetails, matchAgendaEvents, normalizeMatchTeam, teamNameSimilarity, positionCode, categoryType, validScore, extractLiveClock
};
