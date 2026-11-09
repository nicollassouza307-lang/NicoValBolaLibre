'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { FootballDataService } = require('../football-data-service');
const { MultiApiEngine } = require('../multi-api-engine');

(async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'nvb-football-data-'));
  let now = Date.UTC(2026, 10, 8, 12, 0, 0);
  let calls = [];
  const competitions = [
    { id: 2021, name: 'Premier League', code: 'PL', type: 'LEAGUE', area: { name: 'England', code: 'ENG' }, currentSeason: { startDate: '2026-08-01', endDate: '2027-05-31', currentMatchday: 11 } },
    { id: 2013, name: 'Copa do Brasil', code: 'CDR', type: 'CUP', area: { name: 'Brazil', code: 'BRA' } }
  ];
  const match = {
    id: 555, utcDate: '2026-11-08T19:00:00Z', status: 'FINISHED',
    competition: competitions[0],
    season: { startDate: '2026-08-01', endDate: '2027-05-31', currentMatchday: 11 },
    homeTeam: { id: 65, name: 'Manchester City FC', shortName: 'Man City', tla: 'MCI' },
    awayTeam: { id: 66, name: 'Manchester United FC', shortName: 'Man United', tla: 'MUN' },
    score: { winner: 'HOME_TEAM', duration: 'REGULAR', fullTime: { home: 2, away: 1 }, halfTime: { home: 1, away: 0 }, regularTime: { home: 2, away: 1 }, penalties: { home: null, away: null } },
    matchday: 11, stage: 'REGULAR_SEASON', lastUpdated: '2026-11-08T20:00:00Z'
  };
  const standingPayload = {
    competition: competitions[0],
    season: competitions[0].currentSeason,
    standings: [{ type: 'TOTAL', table: [
      { position: 1, team: { name: 'Manchester City FC' }, playedGames: 11, won: 9, draw: 1, lost: 1, goalsFor: 28, goalsAgainst: 8, goalDifference: 20, points: 28 },
      { position: 2, team: { name: 'Arsenal FC' }, playedGames: 11, won: 8, draw: 2, lost: 1, goalsFor: 24, goalsAgainst: 10, goalDifference: 14, points: 26 }
    ] }]
  };

  const engine = new MultiApiEngine({ dataDir: temp, now: () => now });
  const service = new FootballDataService({
    getToken: () => 'testtoken1234567890', engine, now: () => now,
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      const pathname = new URL(url).pathname;
      let payload;
      if (pathname.endsWith('/competitions')) payload = { count: 2, competitions };
      else if (pathname.endsWith('/matches')) payload = { resultSet: { count: 1 }, matches: [match] };
      else if (pathname.endsWith('/standings')) payload = standingPayload;
      else throw new Error(`Rota inesperada no teste: ${pathname}`);
      return {
        ok: true, status: 200,
        headers: { get: name => name === 'X-Authenticated-Client' ? 'NicoVal Test' : name === 'X-Requests-Available-Minute' ? '9' : null },
        json: async () => payload
      };
    }
  });

  assert.equal(service.isConfigured(), true);
  const test = await service.testConnection();
  assert.equal(test.competitionsCount, 2);
  assert.equal(test.competitions[0].code, 'PL');
  assert.equal(test.authenticatedClient, 'NicoVal Test');
  assert.equal(calls[0].options.headers['X-Auth-Token'], 'testtoken1234567890');
  assert.equal(JSON.stringify(test).includes('testtoken1234567890'), false, 'A resposta nunca pode expor o token.');

  const dateResult = await service.getMatchesForDate('2026-11-08');
  assert.equal(dateResult.count, 1);
  assert.match(calls[1].url, /dateFrom=2026-11-07/);
  assert.match(calls[1].url, /dateTo=2026-11-09/);
  assert.equal(dateResult.matches[0].score.fullTime.home, 2);
  assert.equal(dateResult.matches[0].score.penalties.home, null, 'Pontuação de pênaltis ausente deve permanecer null, não virar zero.');
  const repeated = await service.getMatchesForDate('2026-11-08');
  assert.equal(repeated.cached, true);
  assert.equal(calls.length, 2, 'A segunda consulta da mesma data deve usar cache local.');

  const mapped = FootballDataService.matchesForAgenda([
    { id: 'agenda-1', dateEvent: '2026-11-08', home: 'Man City', away: 'Manchester United' },
    { id: 'agenda-wrong-date', dateEvent: '2026-11-09', home: 'Manchester City', away: 'Manchester United' },
    { id: 'agenda-reversed', dateEvent: '2026-11-08', home: 'Manchester United', away: 'Manchester City' },
    { id: 'agenda-not-in-provider', dateEvent: '2026-11-08', home: 'Liverpool', away: 'Chelsea' }
  ], dateResult.matches);
  assert.equal(mapped.length, 1, 'Só deve cruzar data e mandante/visitante exatos.');
  assert.equal(mapped[0].eventId, 'agenda-1');
  assert.equal(mapped[0].match.id, 555);
  const ambiguous = FootballDataService.matchesForAgenda([
    { id: 'agenda-ambiguous', dateEvent: '2026-11-08', home: 'Manchester City', away: 'Manchester United' }
  ], [dateResult.matches[0], { ...dateResult.matches[0], id: 556, competition: { id: 99, name: 'Outra competição', code: 'OTH', type: 'LEAGUE' } }]);
  assert.equal(ambiguous.length, 0, 'O app não deve escolher arbitrariamente quando há dois confrontos indistinguíveis no mesmo dia.');

  const standing = await service.getStandings('PL');
  assert.equal(standing.table.length, 2);
  assert.equal(standing.table[0].points, 28);
  assert.equal(standing.table[0].team, 'Manchester City FC');
  await assert.rejects(() => service.getStandings('CDR'), error => error.code === 'FOOTBALL_DATA_STANDINGS_UNAVAILABLE');
  assert.equal(calls.length, 3, 'Competições são reaproveitadas do cache; copa não consulta standings.');

  await assert.rejects(() => service.getMatchesForDate('08/11/2026'), error => error.code === 'FOOTBALL_DATA_INVALID_DATE');
  const cachedReadOnly = new FootballDataService({ getToken: () => '', engine, fetchImpl: async () => { throw new Error('cache compartilhado/local não deve exigir chave'); } });
  const readOnlyResult = await cachedReadOnly.getMatchesForDate('2026-11-08');
  assert.equal(readOnlyResult.cached, true, 'Um computador em modo de leitura deve poder reutilizar o cache sem token local.');

  const missing = new FootballDataService({ getToken: () => '', fetchImpl: async () => { throw new Error('não deveria consultar'); } });
  assert.equal(missing.isConfigured(), false);
  await assert.rejects(() => missing.testConnection(), error => error.code === 'FOOTBALL_DATA_NOT_CONFIGURED');
  const rejected = new FootballDataService({
    getToken: () => 'badtoken1234567890',
    fetchImpl: async () => ({ ok: false, status: 401, headers: { get: () => null }, json: async () => ({ message: 'unauthorized' }) })
  });
  await assert.rejects(() => rejected.testConnection(), error => error.status === 401 && /Token não reconhecido/.test(error.message));
  const throttled = new FootballDataService({
    getToken: () => 'testtoken1234567890',
    fetchImpl: async () => ({ ok: false, status: 429, headers: { get: () => null }, json: async () => ({ message: 'too many requests' }) })
  });
  await assert.rejects(() => throttled.getMatchesForDate('2026-11-08'), error => error.status === 429 && /10 chamadas por minuto/.test(error.message));

  fs.rmSync(temp, { recursive: true, force: true });
  console.log('PASSOU: autenticação; competições disponíveis; resultados por data; cache; cruzamento estrito com agenda; classificação; exclusão de copas; token oculto; validação de datas e tratamento 401/429.');
})().catch(error => { console.error(error); process.exitCode = 1; });
