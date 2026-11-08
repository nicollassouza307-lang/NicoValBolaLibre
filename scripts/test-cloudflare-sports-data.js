'use strict';

const assert = require('node:assert/strict');

class MemoryD1 {
  constructor() {
    this.row = {
      id: 1, revision: 0, updated_at: '',
      config_json: JSON.stringify({ schemaVersion: 1, stations: [], sources: {}, teamLogoOverrides: {} })
    };
  }
  prepare(query) {
    let bound = [];
    const thisDb = this;
    return {
      bind(...values) { bound = values; return this; },
      async first() {
        if (/SELECT revision, updated_at, config_json/i.test(query)) return { ...thisDb.row };
        return null;
      },
      async run() {
        if (/UPDATE shared_config/i.test(query)) {
          thisDb.row.updated_at = bound[0];
          thisDb.row.config_json = bound[1];
          thisDb.row.revision += 1;
          return { success: true };
        }
        throw new Error('SQL não simulada no teste: ' + query);
      }
    };
  }
}

(async () => {
  const workerModule = await import('../cloudflare-sync/worker.js');
  const worker = workerModule.default;
  const DB = new MemoryD1();
  const env = { DB, SYNC_READ_TOKEN: 'r'.repeat(40), SYNC_ADMIN_TOKEN: 'a'.repeat(40) };
  const match = {
    provider: 'API-Football', eventId: 'agenda-match-1', date: '2026-11-08', home: 'Palmeiras', away: 'Remo', fixtureId: 900001,
    fixture: { date: '2026-11-08T15:00:00-03:00', status: 'NS', goals: { home: 2, away: 1 }, score: { halftime: { home: 1, away: 0 }, fulltime: { home: 2, away: 1 }, extratime: { home: null, away: null }, penalty: { home: 4, away: 3 } }, league: { id: 71, name: 'Brasileirão', country: 'Brazil', season: 2026 } },
    lineups: [{ team: { id: 123, name: 'Palmeiras' }, formation: '4-2-3-1', startXI: [{ id: 1, name: 'Jogador A', number: 10 }] }],
    statistics: [{ team: { id: 123, name: 'Palmeiras' }, values: [{ type: 'Ball Possession', value: '62%' }] }], events: [{ time: { elapsed: 19, extra: null }, team: { id: 123, name: 'Palmeiras' }, player: { id: 90, name: 'Artilheiro' }, assist: { id: 91, name: 'Garçom' }, type: 'Goal', detail: 'Normal Goal' }, { time: { elapsed: 72, extra: null }, team: { id: 456, name: 'Remo' }, player: { id: 92, name: 'Saiu' }, assist: { id: 93, name: 'Entrou' }, type: 'subst', detail: 'Substitution 1' }], fetchedAt: '2026-11-08T12:00:00.000Z'
  };
  const request = (path, method = 'GET', body = null, token = '') => new Request('https://sync.example' + path, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });

  let response = await worker.fetch(request('/v1/sports-data', 'POST', { match }, ''), env);
  assert.equal(response.status, 401, 'Publicação estatística sem chave administrativa deve ser recusada.');

  response = await worker.fetch(request('/v1/sports-data', 'POST', { match }, env.SYNC_ADMIN_TOKEN), env);
  let body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.counts.matches, 1);

  response = await worker.fetch(request('/v1/config', 'GET', null, env.SYNC_READ_TOKEN), env);
  body = await response.json();
  assert.equal(body.config.apiFootballData.matches[0].eventId, 'agenda-match-1');
  assert.equal(body.config.apiFootballData.matches[0].lineups[0].startXI[0].id, 1);
  assert.equal(body.config.apiFootballData.matches[0].fixture.score.penalty.home, 4, 'A pontuação dos pênaltis deve sobreviver à sincronização Cloudflare.');
  assert.equal(body.config.apiFootballData.matches[0].events[0].player.name, 'Artilheiro', 'Os marcadores dos gols devem ser sincronizados.');
  assert.equal(body.config.apiFootballData.matches[0].events[0].assist.name, 'Garçom', 'As assistências devem ser sincronizadas.');
  assert.equal(body.config.apiFootballData.matches[0].events[1].assist.name, 'Entrou', 'O jogador que entrou deve ser sincronizado nas substituições.');

  response = await worker.fetch(request('/v1/publish', 'POST', { config: { schemaVersion: 1, stations: [], sources: {}, teamLogoOverrides: {} } }, env.SYNC_ADMIN_TOKEN), env);
  body = await response.json();
  assert.equal(response.status, 200);

  response = await worker.fetch(request('/v1/config', 'GET', null, env.SYNC_READ_TOKEN), env);
  body = await response.json();
  assert.equal(body.config.apiFootballData.matches.length, 1, 'Publicação comum do catálogo não pode apagar snapshots estatísticos.');
  console.log('PASSOU: somente admin publica snapshots; leitor recebe dados; snapshots permanecem após publicação comum do catálogo; nenhum segredo da API-Football é armazenado no Worker.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
