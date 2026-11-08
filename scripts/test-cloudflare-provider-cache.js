'use strict';

const assert = require('node:assert/strict');

class MemoryD1 {
  constructor() { this.rows = new Map(); }
  prepare(query) {
    let bound = [];
    const db = this;
    return {
      bind(...values) { bound = values; return this; },
      async first() {
        if (/SELECT payload_json, expires_at, updated_at FROM provider_cache/i.test(query)) {
          const [provider, key] = bound;
          const row = db.rows.get(`${provider}:${key}`);
          return row ? { ...row } : null;
        }
        if (/SELECT COUNT\(\*\) AS entries FROM provider_cache/i.test(query)) {
          return { entries: [...db.rows.values()].filter(row => Number(row.expires_at) > Number(bound[0])).length };
        }
        return null;
      },
      async run() {
        if (/INSERT INTO provider_cache/i.test(query)) {
          const [provider, key, payload_json, expires_at, updated_at] = bound;
          db.rows.set(`${provider}:${key}`, { payload_json, expires_at, updated_at });
          return { success: true };
        }
        if (/DELETE FROM provider_cache WHERE expires_at <=/i.test(query)) {
          for (const [key, row] of db.rows) if (Number(row.expires_at) <= Number(bound[0])) db.rows.delete(key);
          return { success: true };
        }
        if (/DELETE FROM provider_cache/i.test(query)) {
          db.rows.delete(`${bound[0]}:${bound[1]}`);
          return { success: true };
        }
        throw new Error('SQL não simulada no teste: ' + query);
      }
    };
  }
}

(async () => {
  const worker = (await import('../cloudflare-sync/worker.js')).default;
  const DB = new MemoryD1();
  const env = { DB, SYNC_READ_TOKEN: 'r'.repeat(40), SYNC_ADMIN_TOKEN: 'a'.repeat(40) };
  const request = (path, method = 'GET', body = null, token = '') => new Request(`https://sync.example${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });

  let response = await worker.fetch(request('/v1/provider-cache?provider=api-football&key=fixture%3A123'), env);
  assert.equal(response.status, 401, 'Leitura sem token deve ser recusada.');

  response = await worker.fetch(request('/v1/provider-cache', 'POST', { provider: 'api-football', key: 'fixture:123', ttlSeconds: 300, data: { goals: { home: 2, away: 1 } } }), env);
  assert.equal(response.status, 401, 'Escrita sem token admin deve ser recusada.');

  response = await worker.fetch(request('/v1/provider-cache', 'POST', { provider: 'api-football', key: 'fixture:123', ttlSeconds: 300, data: { goals: { home: 2, away: 1 } } }, env.SYNC_ADMIN_TOKEN), env);
  assert.equal(response.status, 200);

  response = await worker.fetch(request('/v1/provider-cache?provider=api-football&key=fixture%3A123', 'GET', null, env.SYNC_READ_TOKEN), env);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.hit, true);
  assert.equal(body.record.data.goals.home, 2);

  response = await worker.fetch(request('/v1/provider-cache?provider=football-data&key=fixture%3A123', 'GET', null, env.SYNC_READ_TOKEN), env);
  const miss = await response.json();
  assert.equal(response.status, 200);
  assert.equal(miss.hit, false, 'Cache de provedores diferentes não pode se misturar.');

  response = await worker.fetch(request('/v1/provider-cache/status', 'GET', null, env.SYNC_READ_TOKEN), env);
  const status = await response.json();
  assert.equal(response.status, 200);
  assert.equal(status.entries, 1);

  response = await worker.fetch(request('/v1/provider-cache', 'POST', { provider: 'api-football', key: 'invalid', ttlSeconds: 31 * 24 * 60 * 60, data: {} }, env.SYNC_ADMIN_TOKEN), env);
  assert.equal(response.status, 400, 'Validade acima de 30 dias deve ser rejeitada.');
  console.log('PASSOU: cache Cloudflare protegido por tokens, isolado por provedor, leitura/escrita, status e validação de TTL.');
})().catch(error => { console.error(error); process.exitCode = 1; });
