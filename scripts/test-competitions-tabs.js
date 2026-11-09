'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.equal(pkg.version, '0.18.11');
for (const [tab, panel] of [['games','publicCompetitionGamesPanel'],['standings','publicCompetitionStandingsPanel'],['live','publicCompetitionLivePanel']]) {
  assert.match(html, new RegExp(`data-competition-tab="${tab}"`), `A aba ${tab} deve existir.`);
  assert.match(html, new RegExp(`id="${panel}"`), `O painel ${panel} deve existir.`);
}
assert.match(html, /function setCompetitionActiveTab/);
assert.match(html, /COMPETITION_ACTIVE_TAB_KEY/);
assert.match(html, /renderCompetitionGames\(\)/);
assert.match(html, /renderFootballDataStandings\(result\)/);
assert.match(html, /Atualizar ao vivo/);
assert.match(html, /O livescore é consultado somente quando você solicitar/);
assert.match(html, /data-apifootball-id=/);
assert.match(html, /hydrateTheSportsDbBadge/);
assert.match(html, /TheSportsDB/);
assert.match(server, /\/api\/apifootball\/livescore/);
assert.match(server, /\/api\/thesportsdb\/team-badge/);
assert.match(server, /apiFootballId/);
assert.match(server, /\/api\/thesportsdb\/league-badge/);
console.log('PASSOU: abas públicas Jogos/Classificação/Ao vivo; estado da aba; livescore sob demanda; escudos TheSportsDB com país, competição e ID API-Football; rotas do servidor.');
