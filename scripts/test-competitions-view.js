'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

assert.equal(pkg.version, '0.18.10');
for (const id of [
  'competitionsBtn', 'competitionsView', 'publicLoadCompetitions',
  'publicCompetitionSelect', 'publicLoadStandings', 'publicCompetitionStatus',
  'publicStandingsResult', 'footballDataStandingsResult'
]) assert.match(html, new RegExp(`id=["']${id}["']`), `O controle ${id} precisa existir.`);

assert.match(html, /state\.view==='competitions'/, 'A área Competições precisa ser uma view independente.');
assert.match(html, /setView\(state\.view==='competitions'\?'all':'competitions'\)/, 'O botão superior precisa abrir/fechar a área Competições.');
assert.match(html, /FOOTBALL_DATA_COMPETITIONS_CACHE_KEY/);
assert.match(html, /FOOTBALL_DATA_STANDINGS_CACHE_KEY/);
assert.match(html, /FOOTBALL_DATA_SELECTED_COMPETITION_KEY/);
assert.match(html, /footballDataStandingMarkup\(snapshot,true\)/, 'A tabela precisa ter uma apresentação pública própria.');
assert.match(html, /renderFootballDataStandings\(result\)/, 'A classificação carregada deve atualizar a vista pública e o Admin.');
assert.match(html, /loadFootballDataStandings\(\{publicView:true\}\)/);
assert.match(html, /loadFootballDataCompetitions\(\{publicView:true\}\)/);
assert.match(html, /readCloudSyncSettings\(\)/, 'A consulta pública também precisa usar cache compartilhado.');
assert.match(html, /Football-Data\.org/, 'A atribuição ao provedor precisa permanecer visível.');
assert.match(server, /\/api\/football-data\/standings/);
assert.match(server, /readSharedProviderCache\(cloudSync, cacheKey, 'football-data'\)/);

console.log('PASSOU: navegação pública Competições; cache local de ligas e tabelas; consulta pública; renderização da classificação; cache compartilhado; Admin preservado.');
