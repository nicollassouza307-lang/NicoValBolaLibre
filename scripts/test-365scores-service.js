'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { MultiApiEngine } = require('../multi-api-engine');
const { Scores365Service, isoToBrDate, ENDPOINTS, normalizeGame, normalizeGameDetails, categoryType, validScore } = require('../365scores-service');

(async () => {
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nvb-365scores-'));
let now = Date.parse('2026-11-09T12:00:00Z');
const urls = [];
const responses = new Map();

function response(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(payload) };
}

try {
  assert.equal(isoToBrDate('2026-11-09'), '09/11/2026');
  assert.throws(() => isoToBrDate('2026-02-30'), error => error.code === '365SCORES_INVALID_DATE');

  responses.set('/sports/', { sports: [{ id: 1, name: 'Soccer' }], countries: [], competitions: [{ id: 77, name: 'Brasileirão' }] });
  responses.set('/games/allscores/', { games: [{
    id: 12345, startTime: '2026-11-09T22:00:00Z', statusText: 'Scheduled',
    homeCompetitor: { id: 10, name: 'Flamengo', score: null },
    awayCompetitor: { id: 20, name: 'Palmeiras', score: null },
    competitions: [{ id: 77, name: 'Brasileirão', countryName: 'Brazil' }],
    roundName: 'Rodada 33', venue: { name: 'Maracanã' }, tvNetworks: [{ name: 'Premiere' }]
  }] });
  responses.set('/standings/', { standings: [{ seasonNum: 26, stageNum: 1, rows: [{ position: 1, points: 10, gamePlayed: 4 }] }] });
  responses.set('/game/', { game: {
    id: 12345, startTime: '2026-11-09T22:00:00Z', statusText: 'Scheduled',
    homeCompetitor: { id: 10, name: 'Flamengo', lineups: { formation: '4-3-3', coach: { id: 500, name: 'Técnico Teste', photoUrl: 'https://imagecache.365scores.com/v1/Managers/500.png' }, members: [
      { id: 1, athleteId: 1, status: 1, yardFormation: { line: 1, fieldLine: 1 }, stats: [{ type: 19, name: 'Passes completos', value: 30 }] },
      { id: 2, athleteId: 2, status: 2, stats: [{ type: 54, name: 'Dribles', value: 4 }] }
    ] } },
    awayCompetitor: { id: 20, name: 'Palmeiras', lineups: { formation: '4-2-3-1', members: [
      { id: 3, athleteId: 3, status: 1, stats: [{ type: 39, name: 'Desarmes', value: 5 }] }
    ] } },
    competitions: [{ id: 77, name: 'Brasileirão', seasonNum: 26, stageNum: 1 }], seasonNum: 26, stageNum: 1, roundNum: 33, members: [
      { id: 1, athleteId: 1, name: 'Goleiro Teste', jerseyNumber: 1, position: { name: 'GK' } },
      { id: 2, athleteId: 2, name: 'Atacante Teste', jerseyNumber: 9, position: { name: 'ST' } },
      { id: 3, athleteId: 3, name: 'Zagueiro Teste', jerseyNumber: 4, position: { name: 'CB' } }
    ],
    events: [
      { typeId: 1, playerId: 1, competitorNum: 1, gameTime: '40', description: 'Gol' },
      { typeId: 1000, playerId: 2, assistPlayerId: 3, competitorNum: 2, gameTime: '70' },
      { TypeId: 2, PlayerName: 'Jogador Amarelo', Comp: 1, GTD: '75' },
      { type: 'Substitution', player: 'Saiu', inPlayer: 'Entrou', competitorNum: 2, minute: '80' },
      { type: 3, player: { name: 'Jogador Expulso' }, competitorNum: 2, minute: '90+2' },
      { typeId: 1, eventTypeName: 'Goal', description: 'Own goal', playerName: 'Defensor Teste', competitorNum: 2, gameTime: '48' },
      { typeId: 1, eventTypeName: 'Goal', isOwnGoal: true, playerName: 'Outro Defensor', competitorNum: 2, gameTime: '52' },
      { typeName: 'Substitution', substitution: { out: { id: 1, name: 'Goleiro Teste' }, in: { id: 2, name: 'Atacante Teste' } }, competitorNum: 1, gameTime: '88' }
    ], chartEvents: { events: [{ xg: 0.3, outcome: { name: 'Goal' }, competitorNum: 1, gameTime: '40' }, { xg: 0.1, outcome: { name: 'Saved' }, competitorNum: 2 }] },
    stats: {}, tvNetworks: [{ name: 'Premiere', countryName: 'Brazil' }],
    venue: { name: 'Maracanã', capacity: 78838 }, officials: [{ name: 'Árbitro Teste', role: 'Referee' }]
  } });

  const memberMapGuard = require('../365scores-service').normalizeGameDetails({ game: {
    homeCompetitor: { id: 10, name: 'Clube A', lineups: { members: [{ id: 10, status: 1 }] } },
    awayCompetitor: { id: 20, name: 'Clube B', lineups: { members: [] } },
    members: [{ competitorId: 10, name: 'Não é jogador' }]
  } });
  assert.equal(memberMapGuard.lineups.home.members[0].name, '', 'O competitorId do clube não pode ser confundido com o ID do atleta.');

  const engine = new MultiApiEngine({ dataDir: tempDir, now: () => now });
  const service = new Scores365Service({
    engine, now: () => now, requestGapMs: 100,
    fetch: async (url, options) => {
      urls.push({ url: String(url), options });
      const pathname = new URL(url).pathname.replace(/^\/web/, '');
      const body = responses.get(pathname);
      if (!body) return response({ error: 'not found' }, 404);
      return response(body);
    }
  });

  const connection = await service.testConnection();
  assert.equal(connection.ok, true);
  assert.equal(connection.counts.sports, 1);
  assert.equal(urls[0].url.includes('appTypeId=5'), true);
  assert.equal(urls[0].url.includes('langId=31'), true);
  assert.equal(urls[0].options.headers.Authorization, undefined, 'Não deve inventar nem exigir token.');

  const normalizedSample = normalizeGame({ id:44, startTime:'2026-11-09T22:00:00Z', statusText:'65', homeCompetitor:{id:1,name:'Clube A',score:-1}, awayCompetitor:{id:2,name:'Clube B',score:-1}, competitions:[{name:'Brasileirão Feminino'}] });
  assert.equal(normalizedSample.home.score, null, 'Placar negativo não pode ser tratado como resultado real.');
  assert.equal(normalizedSample.clock, "65'");
  assert.equal(normalizedSample.category, 'women');
  assert.equal(categoryType('Sub-20'), 'youth');
  assert.equal(categoryType('Brasileirão Feminino Sub-20'), 'women_youth');
  assert.equal(validScore(-1), null);

  const games = await service.getGamesForDate('2026-11-09');
  assert.equal(games.count, 1);
  assert.equal(games.games[0].gameId, 12345);
  assert.equal(games.games[0].home.name, 'Flamengo');
  assert.equal(games.games[0].competition.id, 77);
  assert.deepEqual(games.normalization, { raw: 1, normalized: 1, missingGameId: 0, missingHomeName: 0, missingAwayName: 0, missingBothTeamNames: 0 });
  assert.equal(new URL(urls[1].url).searchParams.get('startDate'), '09/11/2026');
  const cachedGames = await service.getGamesForDate('2026-11-09');
  assert.equal(cachedGames.cached, true);
  assert.equal(urls.length, 2, 'A segunda consulta do mesmo dia deve usar cache.');
  const windowStart = urls.length;
  const windowGames = await service.getGamesForDateWindow('2026-11-09', { offsets:[-1,0,1] });
  assert.equal(windowGames.dates.length, 3);
  assert.equal(windowGames.games.length, 1, 'A janela deve deduplicar o mesmo gameId recebido em dias consultados diferentes.');
  assert.equal(urls.length - windowStart, 2, 'O dia já em cache não deve gerar nova chamada; apenas os dias vizinhos devem ser consultados.');


  const game = await service.getGame(12345);
  assert.equal(game.details.gameId, 12345);
  const invalidScoreDetails = normalizeGameDetails({ game:{id:1,statusText:'Half Time',homeCompetitor:{id:1,name:'A',score:-1},awayCompetitor:{id:2,name:'B',score:-1}} });
  assert.equal(invalidScoreDetails.score.home, null);
  assert.equal(invalidScoreDetails.clock, 'INT');
  assert.equal(game.details.lineups.home.formation, '4-3-3');
  assert.equal(game.details.lineups.home.starters, 1);
  assert.equal(game.details.lineups.home.substitutes, 1);
  assert.equal(game.details.lineups.home.coach.name, 'Técnico Teste');
  assert.match(game.details.lineups.home.coach.photoUrl, /imagecache\.365scores\.com/);
  assert.equal(game.details.lineups.home.members[0].name, 'Goleiro Teste', 'Detalhes do atleta devem ser cruzados com game.members por ID.');
  assert.equal(game.details.lineups.home.members[0].number, 1);
  assert.match(game.details.lineups.home.members[0].photoUrl, /imagecache\.365scores\.com.*Athletes\/1$/);
  assert.equal(game.details.lineups.away.members[0].name, 'Zagueiro Teste');
  assert.equal(require('../365scores-service').positionCode('GK'), 'G', 'Abreviação GK deve ser reconhecida como goleiro.');
  assert.equal(require('../365scores-service').positionCode('CB'), 'D', 'Abreviação CB deve ser reconhecida como defensor.');
  assert.equal(require('../365scores-service').positionCode('CM'), 'M', 'Abreviação CM deve ser reconhecida como meio-campista.');
  assert.equal(require('../365scores-service').positionCode('ST'), 'F', 'Abreviação ST deve ser reconhecida como atacante.');
  assert.equal(game.details.statistics.competitorRows.find(row => row.team === 'Flamengo').stats.find(stat => stat.name === 'Finalizações')?.value, 1, 'Finalizações do gráfico devem ser agregadas para o mandante.');
  assert.equal(game.details.statistics.competitorRows.find(row => row.team === 'Palmeiras').stats.find(stat => stat.name === 'Finalizações')?.value, 1, 'Finalizações do gráfico devem ser agregadas para o visitante.');
  assert.equal(game.details.statsAvailable, true);
  assert.equal(game.details.statistics.lineupPlayers, 3);
  assert.equal(game.details.statistics.competitors, 2, 'Estatísticas por equipe devem ser agregadas dos membros da escalação quando não houver bloco de equipe.');
  assert.equal(game.details.statistics.playerRows[0].stats[0].typeId, 19);
  assert.equal(game.details.events[0].type, 'Gol');
  assert.equal(game.details.events[0].player, 'Goleiro Teste');
  assert.equal(game.details.events[1].type, 'Substituição');
  assert.equal(game.details.events[2].type, 'Cartão amarelo');
  assert.equal(game.details.events[2].player, 'Jogador Amarelo');
  assert.equal(game.details.events[3].type, 'Substituição');
  assert.equal(game.details.events[3].secondaryPlayer, 'Entrou');
  assert.equal(game.details.events[4].type, 'Cartão vermelho');
  assert.equal(game.details.events[5].type, 'Gol contra', 'A indicação textual de gol contra deve prevalecer sobre typeId=1.');
  assert.equal(game.details.events[5].detail, '', 'Não deve repetir a indicação de gol contra como detalhe redundante.');
  assert.equal(game.details.events[6].type, 'Gol contra', 'A flag isOwnGoal deve prevalecer sobre typeId=1.');
  assert.equal(game.details.events[7].player, 'Goleiro Teste', 'Substituições devem identificar o jogador que sai por ID aninhado.');
  assert.equal(game.details.events[7].secondaryPlayer, 'Atacante Teste', 'Substituições devem identificar o jogador que entra por ID aninhado.');
  assert.equal(game.details.events[7].team, 'Flamengo', 'O evento deve manter a identificação correta do time.');
  assert.equal(game.details.events[0].type, 'Gol', 'Gols normais continuam classificados como gol.');
  assert.equal(game.details.shots[0].xg, 0.3);
  assert.equal(game.details.round, 'Rodada 33');
  assert.equal(game.details.venueCapacity, 78838);
  assert.equal(game.details.venue, 'Maracanã');
  assert.equal(game.details.referee, 'Árbitro Teste');
  assert.equal(game.details.tvNetworks[0].name, 'Premiere');
  const cachedGame = await service.getGame(12345);
  assert.equal(cachedGame.cached, true);
  assert.equal(urls.length, 5, 'Detalhes do mesmo jogo devem usar cache.');

  const standings = await service.getStandings(77, { seasonNum: 26, stageNum: 1 });
  assert.equal(standings.data.standings[0].seasonNum, 26);
  const standingsUrl = new URL(urls[5].url);
  assert.equal(standingsUrl.searchParams.get('seasonNum'), '26');
  assert.equal(standingsUrl.searchParams.get('stageNum'), '1');

  assert.throws(() => service.gameCacheKey('abc'), error => error.code === '365SCORES_GAME_ID_INVALID');
  await assert.rejects(() => service.getGamesForDate('2026-02-30'), error => error.code === '365SCORES_INVALID_DATE');

  const catalogStatus = engine.status();
  assert.equal(catalogStatus.providers.find(item => item.id === '365scores').state, 'active');
  assert.equal(catalogStatus.providers.find(item => item.id === '365scores').role, 'principal');
  console.log('PASSOU: parâmetros base, descoberta diária, detalhes/escalações, eventos em formatos alternativos, classificação por temporada/fase, validação de IDs e cache 365Scores. (Testes com respostas simuladas; sem chamada externa.)');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

})().catch(error => { console.error(error); process.exitCode = 1; });
