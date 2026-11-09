'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

assert.equal(pkg.version, '0.19.0');
assert.doesNotMatch(html, /id=["']competitionsBtn["']/,'O botão de Competições não deve mais existir na navegação principal.');
assert.doesNotMatch(html, /id=["']competitionsView["']/,'A página independente de Competições deve ser removida.');
assert.match(html, /id="footballDataCompetitionSelect"/,'O Admin continua podendo carregar e escolher competições.');
assert.match(html, /id="footballDataStandingsResult"/,'O Admin continua podendo visualizar a tabela administrativa.');
assert.match(html, /function footballDataCompetitionForEvent\(event\)/,'A competição deve ser identificada pela partida aberta.');
assert.match(html, /function renderMatchCenterStandings\(event, snapshot\)/,'A classificação deve ser renderizada no centro da partida.');
assert.match(html, /loadFootballDataStandingsForMatch\(event,code\)/,'A tabela deve poder ser carregada a partir da partida.');
assert.match(html, /footballDataStandingsCache\[selectedCode\]/,'A classificação deve aproveitar o cache existente.');
assert.match(html, /readCloudSyncSettings\(\)/,'A consulta da classificação na partida deve usar o cache compartilhado.');
assert.match(html, /Football-Data\.org/,'A atribuição ao provedor precisa permanecer visível.');
assert.match(server, /\/api\/football-data\/standings/);
assert.match(server, /readSharedProviderCache\(cloudSync, cacheKey, 'football-data'\)/);

console.log('PASSOU: classificação dentro da partida; correspondência de competição; cache local/Cloudflare; Admin preservado; página Competições removida.');
