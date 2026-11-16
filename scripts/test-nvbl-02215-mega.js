'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const serviceSource=fs.readFileSync(path.join(root,'365scores-service.js'),'utf8');
const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
const engine=fs.readFileSync(path.join(root,'multi-api-engine.js'),'utf8');
const pkg=require('../package.json');
const service=require('../365scores-service');

assert.equal(pkg.version,'0.22.15');
assert.match(html,/V0\.22\.15/);
// The bulky old browser caches are removed, while the agenda link store is preserved.
assert.match(html,/nvb_365scores_match_cache_v2/);
assert.match(html,/nvb_365scores_standings_cache_v2/);
assert.match(html,/localStorage\.removeItem\('nvb_365scores_match_cache_v1'\)/);
assert.match(html,/trimScores365ObjectCache\(scores365MatchCache,10\)/);
assert.match(html,/trimScores365ObjectCache\(scores365MatchCache,6\)/);
const matchPersist = html.slice(html.indexOf('  function persistScores365MatchCache('), html.indexOf('  const SCORES365_AUTO_MATCH_STORE_KEY='));
assert.match(matchPersist,/writeStore\(SCORES365_MATCH_CACHE_KEY,scores365MatchCache\)/);
assert.match(matchPersist,/writeStore\(SCORES365_STANDINGS_CACHE_KEY,scores365StandingsCache\)/);
assert.doesNotMatch(matchPersist,/persistScores365MatchCache\(\{silent\}\);/);
assert.doesNotMatch(matchPersist,/persistScores365StandingsCache\(\);/);
assert.match(html,/scores365LastSilentMatchPersistAt<300000/);
assert.match(html,/writeStore\(SCORES365_MATCH_CACHE_KEY,scores365MatchCache\)/);

// Do not pull standings during every match details poll. Additional competition data is lazy.
assert.doesNotMatch(html,/void loadScores365Standings\(event,\{silent:true\}\);\s*if\(!silent\)startScores365LivePolling/);
assert.match(html,/\['brackets','Chaveamento'\]/);
assert.match(html,/\['rankings','Rankings'\]/);
assert.match(html,/\/api\/365scores\/brackets/);
assert.match(html,/\/api\/365scores\/competition-stats/);
assert.match(html,/ensureScores365TabData\(event,scores365PanelActiveTab/);
assert.match(html,/if\(!options\.force&&existing\?\.data&&Date\.now\(\)-\(Number\(existing\.fetchedAt\)\|\|0\)<ttl\)return;/);
assert.match(html,/statsRoot\?\.\[kind\]/);
assert.match(html,/root\.brackets/);

// Automatic search is deferred and uses a same-day-first strategy; manual Admin can request all dates.
assert.match(html,/scheduleScores365AutoAgendaMatching\(requestedDate\)/);
assert.match(html,/setTimeout\(\(\)=>\{\s*scores365AutoMatchScheduleTimer=null/);
assert.match(html,/searchWindow:'fallback'/);
assert.match(html,/searchWindow:'all'/);
assert.match(html,/scores365AgendaClockInitialTimer=setTimeout[\s\S]*?20000/);
assert.match(server,/shouldSearchNeighborDates\(matches\)/);
assert.match(server,/shared:sharedCount===dateResults\.length/);
assert.doesNotMatch(server,/shared:sharedCount===queryDates\.length/);

// Prefer local provider cache before remote shared-cache I/O and avoid re-publishing cache hits.
const gamesRoute=server.slice(server.indexOf("pathname === '/api/365scores/games-for-date'"),server.indexOf("pathname === '/api/365scores/match-agenda'"));
assert.ok(gamesRoute.indexOf('hasFreshLocal365Cache(cacheKey)')<gamesRoute.indexOf('readSharedProviderCache'));
assert.match(gamesRoute,/!result\.cached\s*&&\s*result\.record/);
const gameRoute=server.slice(server.indexOf("pathname === '/api/365scores/game'"),server.indexOf("pathname === '/api/365scores/standings'"));
assert.ok(gameRoute.indexOf('hasFreshLocal365Cache(cacheKey)')<gameRoute.indexOf('readSharedProviderCache'));
assert.match(gameRoute,/!result\.cached\s*&&\s*result\.record/);
assert.match(gameRoute,/void writeSharedProviderCache/);

// The normalized match object no longer carries redundant raw response arrays.
const normalized=service.normalizeGameDetails({game:{id:42,homeCompetitor:{id:1,name:'Home'},awayCompetitor:{id:2,name:'Away'},members:[],events:[]}});
assert.equal(Object.hasOwn(normalized.statistics,'rawAthleteStats'),false);
assert.equal(Object.hasOwn(normalized.statistics,'rawCompetitorStats'),false);
assert.equal(Object.hasOwn(normalized.statistics,'athleteRows'),false);
assert.ok(Array.isArray(normalized.statistics.playerRows));
assert.match(serviceSource,/Keep only normalized fields consumed by the UI/);

// Strong same-day suggestions avoid the extra-day query; weak/missing ones trigger fallback.
assert.equal(service.shouldSearchNeighborDates([{candidates:[{score:96,exactOriented:true,dateDiffDays:0}]}]),false);
assert.equal(service.shouldSearchNeighborDates([{candidates:[{score:80,exactOriented:true,dateDiffDays:0}]}]),true);
assert.equal(service.shouldSearchNeighborDates([{candidates:[]}]),true);

// Provider-cache persistence is debounced and asynchronous, not a synchronous file rewrite per set().
assert.match(engine,/cachePersistTimer\s*=\s*setTimeout/);
assert.match(engine,/async flushCache\(\)/);
assert.match(engine,/fs\.promises\.writeFile/);
const cachePersist=engine.slice(engine.indexOf('  persistCache()'),engine.indexOf('  recordUsage('));
assert.doesNotMatch(cachePersist,/fs\.writeFileSync\(temporary/);

console.log('PASSOU: V0.22.15, cache 365Scores limitado/debounced sem timer recursivo, consultas lazy, novos rankings/chaveamento, associação same-day-first, cache server local-first e persistência assíncrona.');
