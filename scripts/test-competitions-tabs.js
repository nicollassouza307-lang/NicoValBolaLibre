'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.equal(pkg.version, '0.22.1');
for (const tab of ['livescore','lineups','statistics','standings']) {
  assert.match(html, new RegExp(`data-apifootball-tab="${tab}"`), `A aba ${tab} deve existir no centro da partida.`);
}
assert.match(html, /id="apiFootballMatchDataPanel"/);
assert.match(html, /function renderApiFootballSnapshot\(snapshot, activeTab = 'livescore', event = null\)/);
assert.match(html, /window\.NVBLineupUI\.renderMatchEvents\(snapshot\)/,'Livescore deve mostrar gols, assistências, cartões e substituições.');
assert.match(html, /eventScore=event\?footballDataScoreFor\(event\)/,'O livescore deve aproveitar placar já disponível na agenda/football-data mesmo antes do snapshot API-Football.');
assert.match(html, /window\.NVBLineupUI\.renderLineups\(snapshot\)/);
assert.match(html, /window\.NVBLineupUI\.renderStatistics\(snapshot\)/);
assert.match(html, /renderMatchCenterStandings\(event,snapshot\)/);
assert.match(html, /loadFootballDataStandingsForMatch\(event,code\)/);
assert.doesNotMatch(html, /id="publicCompetitionLivePanel"|id="publicCompetitionStandingsPanel"/);
assert.match(server, /\/api\/apifootball\/livescore/,'O serviço global de livescore pode continuar como fonte de suporte, sem página autônoma.');
console.log('PASSOU: abas Livescore/Escalações/Estatísticas/Classificação integradas à partida.');
