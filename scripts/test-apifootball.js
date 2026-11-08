'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ApiFootballService } = require('../apifootball-service');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nvb-apifootball-test-'));
let now = Date.parse('2026-11-08T12:00:00Z');
const calls = [];
const fixture = {
  fixture: { id: 900001, date: '2026-11-08T15:00:00-03:00', timezone: 'America/Sao_Paulo', status: { short: 'NS', long: 'Not Started', elapsed: null }, venue: { name: 'Estádio Teste' }, referee: null },
  league: { id: 71, name: 'Brasileirão', country: 'Brazil', logo: 'https://media.api-sports.io/football/leagues/71.png', season: 2026, round: 'Regular Season - 30' },
  teams: { home: { id: 123, name: 'Palmeiras', logo: 'https://example.test/pal.png' }, away: { id: 456, name: 'Remo', logo: 'https://example.test/rem.png' } },
  goals: { home: null, away: null },
  score: { halftime: { home: null, away: null }, fulltime: { home: null, away: null }, extratime: { home: null, away: null }, penalty: { home: null, away: null } }
};

async function fakeFetch(url, options = {}) {
  const parsed = new URL(url);
  calls.push(parsed.pathname + parsed.search);
  if (parsed.pathname === '/fixtures' && parsed.searchParams.has('page')) {
    return new Response(JSON.stringify({ errors: { page: 'The page field does not exist' }, response: [] }), { status: 200, headers });
  }
  const headers = new Headers({ 'x-ratelimit-requests-limit': '100', 'x-ratelimit-requests-remaining': String(Math.max(0, 100 - calls.filter(item => item !== '/status').length)) });
  if (parsed.pathname === '/status') {
    return new Response(JSON.stringify({ response: [{ account: { firstname: 'Nico', lastname: 'Test', email: 'private@example.test' }, subscription: { plan: 'Free', active: true, end: '2027-01-01' } }] }), { status: 200, headers });
  }
  if (parsed.pathname === '/fixtures' && parsed.searchParams.has('date')) {
    return new Response(JSON.stringify({ response: [fixture], paging: { current: 1, total: 1 }, results: 1 }), { status: 200, headers });
  }
  if (parsed.pathname === '/fixtures' && parsed.searchParams.has('id')) {
    const combined = structuredClone(fixture);
    combined.fixture.status = { short: '1H', long: 'First Half', elapsed: 12 };
    combined.goals = { home: 1, away: 0 };
    combined.score = { halftime: { home: 1, away: 0 }, fulltime: { home: 1, away: 1 }, extratime: { home: 1, away: 1 }, penalty: { home: 4, away: 3 } };
    combined.lineups = [
      { team: { id: 123, name: 'Palmeiras' }, formation: '4-2-3-1', coach: { id: 9, name: 'Técnico A' }, startXI: [{ player: { id: 1, name: 'Jogador A', number: 10, pos: 'M', grid: '2:3' } }], substitutes: [] },
      { team: { id: 456, name: 'Remo' }, formation: '4-4-2', coach: { id: 10, name: 'Técnico B' }, startXI: [], substitutes: [] }
    ];
    combined.statistics = [
      { team: { id: 123, name: 'Palmeiras' }, statistics: [{ type: 'Ball Possession', value: '62%' }, { type: 'Total Shots', value: 12 }] },
      { team: { id: 456, name: 'Remo' }, statistics: [{ type: 'Ball Possession', value: '38%' }, { type: 'Total Shots', value: 4 }] }
    ];
    combined.players = [{ player: { id: 1, name: 'Jogador A', photo: 'https://media.api-sports.io/football/players/1.png' } }];
    combined.events = [{ time: { elapsed: 65, extra: null }, team: { id: 123, name: 'Palmeiras' }, player: { id: 20, name: 'Atacante A' }, assist: { id: 21, name: 'Meia A' }, type: 'Goal', detail: 'Normal Goal' }, { time: { elapsed: 90, extra: null }, team: { id: 456, name: 'Remo' }, player: { id: 31, name: 'Jogador que saiu' }, assist: { id: 32, name: 'Jogador que entrou' }, type: 'subst', detail: 'Substitution 1' }];
    return new Response(JSON.stringify({ response: [combined], paging: { current: 1, total: 1 }, results: 1 }), { status: 200, headers });
  }
  if (parsed.pathname === '/standings') {
    return new Response(JSON.stringify({ response: [{ league: { id: 71, name: 'Brasileirão', standings: [[{ rank: 1, team: { name: 'Palmeiras' }, points: 60, goalsDiff: 20, all: { played: 30 }, form: 'VVEVV' }]] } }] }), { status: 200, headers });
  }
  return new Response(JSON.stringify({ errors: { endpoint: 'unknown' }, response: [] }), { status: 404, headers });
}

(async () => {
  const service = new ApiFootballService({
    dataDir: tempDir,
    getApiKey: () => 'a'.repeat(32),
    fetch: fakeFetch,
    now: () => now
  });

  const status = await service.testConnection();
  assert.equal(status.ok, true);
  assert.equal(status.subscription.plan, 'Free');
  assert.equal(service.getUsage().requestsUsedByApp, 0, '/status não pode consumir a cota diária.');

  const resolved = await service.resolveMatch({ id: 'agenda-1', home: 'Palmeiras', away: 'Remo', dateEvent: '2026-11-08', timeText: '15:00' });
  assert.equal(resolved.matched, true, 'A partida existente na agenda deve ser identificada.');
  assert.equal(resolved.fixture.id, 900001);
  assert.equal(resolved.fixture.score.penalty.home, null, 'O placar de pênaltis deve acompanhar o fixture inicial, mesmo vazio.');
  assert.equal(resolved.fixture.league.logo, 'https://media.api-sports.io/football/leagues/71.png', 'O logo da competição deve acompanhar o fixture encontrado.');
  assert.equal(resolved.fixture.league.logo, 'https://media.api-sports.io/football/leagues/71.png', 'O logo da competição precisa acompanhar o snapshot da partida.');
  const beforeDetails = service.getUsage().requestsUsedByApp;
  assert.equal(beforeDetails, 1, 'A lista de partidas por data deve consumir uma chamada.');
  assert.equal(calls.filter(item => item.startsWith('/fixtures?date=')).length, 1, 'A lista diária deve ser consultada uma única vez.');
  assert.equal(calls.some(item => item.startsWith('/fixtures?') && item.includes('page=')), false, 'O endpoint /fixtures não deve receber o parâmetro page.');

  const details = await service.getMatchDetails(900001, 'NS');
  assert.equal(details.lineups.length, 2);
  assert.equal(details.fixture.status, '1H');
  assert.equal(details.fixture.league.logo, 'https://media.api-sports.io/football/leagues/71.png');
  assert.equal(details.fixture.league.logo, 'https://media.api-sports.io/football/leagues/71.png');
  assert.equal(details.fixture.goals.home, 1, 'O endpoint combinado deve atualizar o placar/status mais recente.');
  assert.equal(details.fixture.score.penalty.home, 4, 'O placar da disputa de pênaltis deve ser preservado.');
  assert.equal(details.events.length, 2, 'Gols e substituições devem permanecer no snapshot detalhado.');
  assert.equal(details.events[0].assist.name, 'Meia A', 'O assistente do gol deve ser preservado.');
  assert.equal(details.lineups[0].startXI[0].player.id, 1);
  assert.equal(details.statistics[0].statistics[0].value, '62%');
  assert.equal(service.getUsage().requestsUsedByApp, 2, 'O endpoint combinado /fixtures?id busca escalações e estatísticas em uma única chamada adicional.');

  const cachedFixtures = await service.resolveMatch({ id: 'agenda-1', home: 'Palmeiras', away: 'Remo', dateEvent: '2026-11-08', timeText: '15:00' });
  assert.equal(cachedFixtures.cached, true);
  const cachedDetails = await service.getMatchDetails(900001, 'NS');
  assert.equal(cachedDetails.cached, true);
  assert.equal(service.getUsage().requestsUsedByApp, 2, 'O cache não deve gastar requisições adicionais.');

  const unmatched = await service.resolveMatch({ id: 'agenda-2', home: 'Clube que não existe', away: 'Outro clube', dateEvent: '2026-11-08' });
  assert.equal(unmatched.matched, false, 'O enriquecimento nunca deve inventar ou adicionar partidas à agenda.');

  const standings = await service.getStandings(71, 2026);
  assert.equal(standings.data[0].league.standings[0][0].points, 60);
  assert.equal(service.getUsage().requestsUsedByApp, 3);

  // O teto interno é aplicado antes de uma nova chamada sair para a internet.
  service.usage.used = 70;
  service.persistUsage();
  await assert.rejects(() => service.request('/fixtures?date=2026-11-09', { force: true }), error => error.code === 'LOCAL_DAILY_LIMIT');

  const storedUsage = JSON.parse(fs.readFileSync(path.join(tempDir, 'apifootball-usage.json'), 'utf8'));
  assert.equal(storedUsage.used, 70);
  console.log('PASSOU: /status sem consumo diário; /fixtures por data sem parâmetro page; identificação exata da partida da agenda; /fixtures?id combinado para lineups/statistics; cache; classificação; limite interno de 70; partida não encontrada permanece fora da agenda.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
});
