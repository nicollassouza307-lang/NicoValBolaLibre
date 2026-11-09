'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { MultiApiEngine } = require('../multi-api-engine');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nvb-multi-api-'));
let now = Date.parse('2026-11-08T16:00:00Z');

try {
  const engine = new MultiApiEngine({ dataDir: tempDir, now: () => now });
  assert.equal(engine.set('api-football', 'fixture:123', { score: '2-1' }, 60_000), true);
  assert.deepEqual(engine.get('api-football', 'fixture:123'), { score: '2-1' });
  assert.equal(engine.get('football-data', 'fixture:123'), null, 'O cache de provedores diferentes precisa ficar isolado.');

  const record = engine.getRecord('api-football', 'fixture:123');
  assert.equal(record.expiresAt, now + 60_000);
  assert.equal(engine.importRecord('football-data', 'same-key', { data: { result: '1-0' }, expiresAt: now + 120_000 }), true);
  assert.deepEqual(engine.get('football-data', 'same-key'), { result: '1-0' });

  engine.recordUsage('api-football', { requestsUsedByApp: 12, appSoftLimit: 70, effectiveRemaining: 58 });
  const quota = engine.reserveRequest('football-data', { dailyLimit: 1000, dailySoftLimit: 900, reserve: 100, perMinuteLimit: 2 });
  assert.equal(quota.requestsUsed, 1);
  engine.reserveRequest('football-data', { dailyLimit: 1000, dailySoftLimit: 900, reserve: 100, perMinuteLimit: 2 });
  assert.throws(() => engine.reserveRequest('football-data', { dailyLimit: 1000, dailySoftLimit: 900, reserve: 100, perMinuteLimit: 2 }), error => error.code === 'PROVIDER_MINUTE_LIMIT');
  const restored = new MultiApiEngine({ dataDir: tempDir, now: () => now });
  assert.deepEqual(restored.get('api-football', 'fixture:123'), { score: '2-1' }, 'O cache precisa sobreviver ao reinício do aplicativo.');
  assert.equal(restored.getProviderUsage('api-football').requestsUsedByApp, 12);
  const status = restored.status();
  assert.equal(status.engine, 'NicoVal Multi-API Engine');
  assert.equal(status.activeProviders, 1);
  assert.equal(status.plannedProviders, 0, 'A 365Scores já é a fonte principal ativa.');
  assert.equal(status.providers.find(item => item.id === '365scores').state, 'active');
  assert.equal(status.providers.find(item => item.id === 'api-football').state, 'paused');
  assert.equal(status.providers.find(item => item.id === 'football-data').state, 'paused');
  assert.equal(status.providers.find(item => item.id === 'api-football').cacheEntries, 1);

  now += 61_000;
  assert.equal(restored.get('api-football', 'fixture:123'), null, 'Itens expirados não devem ser reaproveitados.');
  assert.equal(restored.status().cacheEntries, 1, 'A limpeza mantém apenas entradas ainda válidas.');
  console.log('PASSOU: cache persistente e isolado por provedor, importação de cache remoto, uso por provedor, catálogo de integrações e expiração.');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
