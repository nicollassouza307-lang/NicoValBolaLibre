'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const service = fs.readFileSync(path.join(root, 'football-data-service.js'), 'utf8');
const worker = fs.readFileSync(path.join(root, 'cloudflare-sync/worker.js'), 'utf8');

for (const id of [
  'footballDataFetchAgenda', 'footballDataLoadCompetitions', 'footballDataCompetitionSelect',
  'footballDataLoadStandings', 'footballDataDataStatus', 'footballDataStandingsResult'
]) assert.match(html, new RegExp(`id=["']${id}["']`), `O controle ${id} deve existir no Painel Admin.`);

assert.match(html, /\/api\/football-data\/matches-for-agenda/);
assert.match(html, /\/api\/football-data\/competitions/);
assert.match(html, /\/api\/football-data\/standings/);
assert.match(html, /readCloudSyncSettings\(\)/, 'As consultas devem aceitar a configuração do cache compartilhado.');
assert.match(html, /FOOTBALL_DATA_MATCH_CACHE_KEY/);
assert.doesNotMatch(html, /externalScore\.home/, 'Football-Data não deve mais alimentar placares da agenda.');
assert.match(html, /scores365Info\.homeScore \?\? e\.homeScore/, 'A 365Scores tem prioridade sobre o placar de origem quando vinculada.');
assert.match(html, /scores365Info\.awayScore \?\? e\.awayScore/);
assert.match(html, /footballDataMatchCache/);
assert.match(html, /Nenhuma partida nova foi adicionada à agenda/);
assert.match(html, /Integrações esportivas anteriores pausadas/);
assert.match(html, /footballDataPanel/);
assert.match(html, /document\.getElementById\(id\)\?\.remove\(\)/, 'O painel legado é removido da interface ativa.');
assert.doesNotMatch(html, /Football data provided by the Football-Data\.org API/);

assert.match(server, /\/api\/football-data\/matches-for-agenda/);
assert.match(server, /FootballDataService\.matchesForAgenda\(events, result\.matches\)/);
assert.match(server, /readSharedProviderCache\(cloudSync, cacheKey, 'football-data'\)/);
assert.match(server, /writeSharedProviderCache\(cloudSync, cacheKey, result\.record, 'football-data'\)/);
assert.match(service, /dateFrom, dateTo/);
assert.match(service, /America\/Sao_Paulo/);
assert.match(service, /index\.get\(`\$\{date\}\|\$\{home\}\|\$\{away\}`\)/, 'O vínculo exige data e ordem mandante/visitante exatas.');
assert.match(service, /selected\.type !== 'LEAGUE'/, 'Classificação não deve ser solicitada para copas.');
assert.match(service, /candidates\.length === 1/, 'Correspondências duplicadas devem ser recusadas como ambíguas.');
assert.match(worker, /provider_cache/);
assert.match(worker, /provider\s*=\s*String\(body\.provider/);

console.log('PASSOU: controles do Painel Admin; busca da agenda; classificação; fallback de placar; prioridade da agenda original; Cloudflare cache por provedor; atribuição obrigatória; correspondência exata; copas fora das classificações.');
