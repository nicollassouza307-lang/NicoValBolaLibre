'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ApiFootballService } = require('../apifootball-service');

(async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'nvb-livescore-'));
  const calls = [];
  const headers = new Headers({ 'x-ratelimit-requests-limit':'100', 'x-ratelimit-requests-remaining':'96' });
  const fetch = async url => {
    const parsed = new URL(url); calls.push(parsed);
    return new Response(JSON.stringify({ response:[
      { fixture:{ id:1, status:{ short:'1H', long:'First Half', elapsed:22 } }, teams:{home:{name:'Palmeiras'},away:{name:'Flamengo'}}, goals:{home:1,away:0} },
      { fixture:{ id:2, status:{ short:'NS', long:'Not Started', elapsed:null } }, teams:{home:{name:'Santos'},away:{name:'Gremio'}}, goals:{home:null,away:null} },
      { fixture:{ id:3, status:{ short:'FT', long:'Match Finished', elapsed:90 } }, teams:{home:{name:'Inter'},away:{name:'Milan'}}, goals:{home:2,away:1} }
    ], results:3 }), { status:200, headers });
  };
  try {
    const service = new ApiFootballService({ dataDir:temp, getApiKey:()=> 'x'.repeat(32), fetch, now:()=>Date.parse('2026-11-09T12:00:00Z') });
    const first = await service.liveFixtures();
    assert.equal(first.count, 1);
    assert.equal(first.fixtures[0].fixture.id, 1);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].pathname, '/fixtures');
    assert.equal(calls[0].searchParams.get('live'), 'all');
    assert.equal(calls[0].searchParams.get('timezone'), 'America/Sao_Paulo');
    const second = await service.liveFixtures();
    assert.equal(second.cached, true);
    assert.equal(calls.length, 1, 'A consulta repetida deve usar o cache de 60 segundos.');
    const forced = await service.liveFixtures({ force:true });
    assert.equal(forced.count, 1);
    assert.equal(calls.length, 2, 'A atualização manual forçada faz uma nova consulta.');
    assert.equal(service.getUsage().requestsUsedByApp, 2);
    console.log('PASSOU: rota fixtures?live=all; apenas estados ao vivo; fuso America/Sao_Paulo; cache de 60 segundos; atualização manual; consumo de cota contabilizado.');
  } finally { fs.rmSync(temp, { recursive:true, force:true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
