'use strict';
const assert = require('node:assert/strict');
const { FootballDataService } = require('../football-data-service');

(async () => {
  let capturedUrl = '';
  let capturedOptions = null;
  const service = new FootballDataService({
    getToken: () => 'testtoken1234567890',
    fetchImpl: async (url, options) => {
      capturedUrl = url;
      capturedOptions = options;
      return {
        ok: true,
        status: 200,
        headers: { get: name => name === 'X-Authenticated-Client' ? 'NicoVal Test' : name === 'X-Requests-Available-Minute' ? '9' : null },
        json: async () => ({ count: 12, competitions: Array.from({ length: 12 }, (_, index) => ({ id: index + 1 })) })
      };
    }
  });
  assert.equal(service.isConfigured(), true);
  const result = await service.testConnection();
  assert.equal(capturedUrl, 'https://api.football-data.org/v4/competitions');
  assert.equal(capturedOptions.headers['X-Auth-Token'], 'testtoken1234567890');
  assert.equal(result.competitionsCount, 12);
  assert.equal(result.authenticatedClient, 'NicoVal Test');
  assert.equal(result.keyNeverSentToBrowser, true);
  assert.equal(JSON.stringify(result).includes('testtoken1234567890'), false, 'A resposta nunca pode expor o token.');

  const missing = new FootballDataService({ getToken: () => '', fetchImpl: async () => { throw new Error('não deveria consultar'); } });
  assert.equal(missing.isConfigured(), false);
  await assert.rejects(() => missing.testConnection(), error => error.code === 'FOOTBALL_DATA_NOT_CONFIGURED');

  const rejected = new FootballDataService({
    getToken: () => 'badtoken1234567890',
    fetchImpl: async () => ({ ok: false, status: 401, headers: { get: () => null }, json: async () => ({ message: 'unauthorized' }) })
  });
  await assert.rejects(() => rejected.testConnection(), error => error.status === 401 && /Token não reconhecido/.test(error.message));
  console.log('PASSOU: autenticação football-data.org, teste de conexão, token oculto e tratamento de falhas.');
})().catch(error => { console.error(error); process.exitCode = 1; });
