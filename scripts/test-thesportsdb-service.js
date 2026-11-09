'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { TheSportsDBService, FREE_API_KEY, teamListQuery, safeImageUrl } = require('../thesportsdb-service');
const { MultiApiEngine } = require('../multi-api-engine');

(async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'nvb-thesportsdb-'));
  const calls = [];
  let now = Date.parse('2026-11-09T12:00:00Z');
  const premierTeams = [
    { idTeam:'1', idAPIfootball:'40', strTeam:'Liverpool', strTeamAlternate:'Liverpool FC, The Reds', strCountry:'England', strLeague:'English Premier League', strBadge:'https://r2.thesportsdb.com/images/media/team/badge/liverpool.png' },
    { idTeam:'2', idAPIfootball:'42', strTeam:'Arsenal', strCountry:'England', strLeague:'English Premier League', strBadge:'https://r2.thesportsdb.com/images/media/team/badge/arsenal.png' }
  ];
  const fetchImpl = async url => {
    const parsed = new URL(url); calls.push(parsed.pathname + parsed.search);
    if (parsed.pathname.endsWith('/searchteams.php')) {
      return new Response(JSON.stringify({ teams:[{ strTeam:'Arsenal', strCountry:'England', strBadge:'https://r2.thesportsdb.com/images/media/team/badge/arsenal.png' }] }), { status:200 });
    }
    if (parsed.pathname.endsWith('/search_all_teams.php')) return new Response(JSON.stringify({ teams:premierTeams }), { status:200 });
    if (parsed.pathname.endsWith('/lookupleague.php')) return new Response(JSON.stringify({ leagues:[{ idLeague:'4328', strLeague:'English Premier League', strLeagueAlternate:'Premier League, EPL, England', strCountry:'England', strBadge:'https://r2.thesportsdb.com/images/media/league/badge/epl.png' }] }), { status:200 });
    if (parsed.pathname.endsWith('/search_all_leagues.php')) return new Response(JSON.stringify({ countries:[] }), { status:200 });
    return new Response('{}', { status:404 });
  };
  try {
    const engine = new MultiApiEngine({ dataDir:temp, now:()=>now });
    const service = new TheSportsDBService({ engine, fetchImpl, now:()=>now });
    assert.equal(FREE_API_KEY, '123');
    assert.equal(teamListQuery({ league:'Premier League', country:'England' }).params.l, 'English_Premier_League');
    assert.equal(safeImageUrl('http://r2.thesportsdb.com/badge.png'), '');

    const test = await service.testConnection();
    assert.equal(test.ok, true);
    assert.equal(test.freeKeyBuiltIn, true);
    assert.equal(test.testTeam, 'Arsenal');
    assert.equal(JSON.stringify(test).includes('YOUR_API_KEY'), false);

    const [liverpool, arsenal] = await Promise.all([
      service.getTeamBadge({ teamName:'Liverpool FC', country:'England', league:'Premier League', apiFootballId:40 }),
      service.getTeamBadge({ teamName:'Arsenal', country:'England', league:'Premier League', apiFootballId:42 })
    ]);
    assert.equal(liverpool.found, true, 'O ID API-Football deve resolver o clube dentro da lista gratuita da liga.');
    assert.equal(liverpool.resolvedName, 'Liverpool');
    assert.equal(liverpool.confidence, 1);
    assert.equal(arsenal.found, true);
    assert.equal(arsenal.resolvedName, 'Arsenal');
    assert.ok(calls.some(call => call.includes('/search_all_teams.php?l=English_Premier_League')));

    const cached = await service.getTeamBadge({ teamName:'Liverpool FC', country:'England', league:'Premier League', apiFootballId:40 });
    assert.equal(cached.cached, true);
    const teamListCalls = calls.filter(call => call.includes('/search_all_teams.php')).length;
    assert.equal(teamListCalls, 1, 'A lista da liga deve ser compartilhada em cache e requisições simultâneas devem ser deduplicadas.');

    const wrongCountry = await service.getTeamBadge({ teamName:'Liverpool FC', country:'Brazil', league:'Premier League', apiFootballId:40 });
    assert.equal(wrongCountry.found, false, 'Nunca aceitar um clube de outro país apenas por semelhança do nome.');

    const leagueBadge = await service.getLeagueBadge({ leagueName:'Premier League', country:'England' });
    assert.equal(leagueBadge.found, true);
    assert.equal(leagueBadge.resolvedName, 'English Premier League');
    assert.ok(calls.some(call => call.includes('/lookupleague.php?id=4328')));

    const juventusCalls = [];
    const juventusService = new TheSportsDBService({ fetchImpl:async url => {
      const parsed = new URL(url); juventusCalls.push(parsed.pathname + parsed.search);
      if (parsed.pathname.endsWith('/lookupteam.php')) return new Response(JSON.stringify({ teams:[{ idTeam:'133676', idAPIfootball:'496', strTeam:'Juventus', strCountry:'Italy', strLeague:'Italian Serie A', strBadge:'https://r2.thesportsdb.com/images/media/team/badge/juventus-black.png' }] }), { status:200 });
      return new Response(JSON.stringify({ leagues:[] }), { status:200 });
    }});
    const juventus = await juventusService.getTeamBadge({ teamName:'Juventus', country:'Italy', league:'Serie A', apiFootballId:496 }, { preferTheSportsDb:true });
    assert.equal(juventus.found, true, 'Juventus deve ser resolvida pela lista da liga quando o ID/API-Football e o país coincidirem.');
    assert.equal(juventus.source, 'TheSportsDB');
    assert.equal(juventus.lookupScope, 'team-id:133676');
    assert.ok(juventusCalls.some(call => call.includes('/lookupteam.php?id=133676')), 'Juventus deve usar o ID de equipe verificado da TheSportsDB para obter o escudo preto sem busca nominal limitada.');
    assert.equal(juventusCalls.some(call => call.includes('/searchteams.php')), false, 'A busca nominal livre da V1 é limitada a Arsenal; não usar para Juventus.');

    const badImageService = new TheSportsDBService({ fetchImpl:async url => {
      const parsed = new URL(url);
      if (parsed.pathname.endsWith('/search_all_teams.php')) return new Response(JSON.stringify({ teams:[{ strTeam:'Liverpool', strCountry:'England', strBadge:'https://bad.example/badge.png' }] }), { status:200 });
      return new Response(JSON.stringify({}), { status:200 });
    } });
    const bad = await badImageService.getTeamBadge({ teamName:'Liverpool', country:'England', league:'Premier League' });
    assert.equal(bad.found, false, 'URLs de imagem fora do domínio oficial devem ser recusadas.');

    const count = calls.length;
    now += 1000;
    await service.getLeagueBadge({ leagueName:'Premier League', country:'England' });
    assert.equal(calls.length, count, 'O escudo da liga deve usar cache.');
    console.log('PASSOU: chave V1 gratuita integrada; teste de conexão; lista de equipes por competição; correspondência por ID API-Football/nome/país; cache compartilhado; escudo de liga verificado; URLs de imagem seguras.');
  } finally { fs.rmSync(temp, { recursive:true, force:true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
