#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ui = require('../apifootball-lineup-ui');

const snapshot = {
  home: 'Palmeiras', away: 'Flamengo',
  fixture: {
    home: { id: 10, name: 'Palmeiras', logo: 'https://media.api-sports.io/football/teams/10.png' },
    away: { id: 20, name: 'Flamengo', logo: 'https://media.api-sports.io/football/teams/20.png' }
  },
  lineups: [
    {
      team: { id: 20, name: 'Flamengo' }, formation: '4-3-3', coach: { name: 'Técnico Visitante' },
      startXI: [
        { id: 201, name: 'Atacante 2', number: 9, pos: 'F', grid: '4:2' },
        { id: 202, name: 'Goleiro Visitante', number: 1, pos: 'G', grid: '1:1' },
        { id: 203, name: 'Defensor 1', number: 3, pos: 'D', grid: '2:1' },
        { id: 204, name: 'Atacante 1', number: 11, pos: 'F', grid: '4:1' }
      ],
      substitutes: [{ id: 205, name: 'Reserva Visitante', number: 18, pos: 'M' }]
    },
    {
      team: { id: 10, name: 'Palmeiras' }, formation: '4-2-3-1', coach: { name: 'Técnico Mandante' },
      startXI: [
        { id: 101, name: 'Camisa 10', number: 10, pos: 'M', grid: '3:2' },
        { id: 102, name: 'Goleiro Mandante', number: 21, pos: 'G', grid: '1:1' },
        { id: 103, name: 'Centroavante', number: 9, pos: 'F', grid: '4:1' }
      ],
      substitutes: [{ id: 104, name: 'Reserva Mandante', number: 30, pos: 'F' }]
    }
  ],
  statistics: [
    { team: { id: 20, name: 'Flamengo' }, values: [{ type: 'Ball Possession', value: '42%' }, { type: 'Total Shots', value: 8 }] },
    { team: { id: 10, name: 'Palmeiras' }, values: [{ type: 'Ball Possession', value: '58%' }, { type: 'Total Shots', value: 13 }] }
  ]
};

assert.equal(ui.playerPhotoUrl(1234), 'https://media.api-sports.io/football/players/1234.png');
assert.equal(ui.playerPhotoUrl(0), '');
assert.deepEqual(ui.sortLineupPlayers(snapshot.lineups[0].startXI).map(player => player.name), [
  'Goleiro Visitante', 'Defensor 1', 'Atacante 1', 'Atacante 2'
]);
assert.equal(ui.resolveLineups(snapshot)[0].team.name, 'Palmeiras', 'Mandante deve aparecer primeiro mesmo se a API devolver visitante primeiro.');
assert.equal(ui.resolveLineups(snapshot)[1].team.name, 'Flamengo');

const lineupHtml = ui.renderLineups(snapshot);
assert.match(lineupHtml, /apifootball-pitch/);
assert.doesNotMatch(lineupHtml, /apifootball-pitch-position/, 'O marcador de campo não deve exibir uma etiqueta extra de posição.');
assert.match(lineupHtml, /apifootball-pitch-number/);
const forwardPositions = ui.playerPlacements(snapshot.lineups[1].startXI, 'home').filter(entry => String(entry.player.pos).toUpperCase() === 'F');
assert.ok(forwardPositions.length, 'A formação de teste deve incluir atacantes.');
assert.ok(forwardPositions.every(entry => entry.left > 80), 'Atacantes devem ocupar a zona avançada e manter o desenho de ponta.');
assert.ok(forwardPositions.every(entry => entry.depth > 80), 'A profundidade real também deve estar disponível para a orientação vertical em telas estreitas.');
assert.match(lineupHtml, /Palmeiras/);
assert.match(lineupHtml, /Flamengo/);
assert.match(lineupHtml, /4-2-3-1/);
assert.match(lineupHtml, /4-3-3/);
assert.match(lineupHtml, /media\.api-sports\.io\/football\/players\/101\.png/);
assert.match(lineupHtml, /Camisa 10/);
assert.match(lineupHtml, /Técnico Mandante/);
assert.match(lineupHtml, /Reserva Mandante/);
assert.ok(lineupHtml.indexOf('apifootball-pitch') < lineupHtml.indexOf('apifootball-support-grid'), 'Técnico e banco devem ficar fora e abaixo do campo.');
assert.match(lineupHtml, /apifootball-photo-fallback/);

const statsHtml = ui.renderStatistics(snapshot);
assert.match(statsHtml, /Estatísticas|Posse de bola/);
assert.match(statsHtml, /58%/);
assert.match(statsHtml, /42%/);
assert.match(statsHtml, /apifootball-stat-bar/);

const escapedHtml = ui.renderLineups({ ...snapshot, lineups: [{ ...snapshot.lineups[1], team: { id: 10, name: '<script>alert(1)<\/script>' } }] });
assert.doesNotMatch(escapedHtml, /<script>alert\(1\)<\/script>/);

const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
assert.match(index, /apifootball-lineup-ui\.js/);
assert.match(index, /data-apifootball-tab="lineups"/);
assert.match(index, /data-apifootball-tab="statistics"/);
assert.ok(index.indexOf('${renderApiFootballMatchPanel(e)}') > index.indexOf('class="player-shell match-player-card"'), 'Painel esportivo deve aparecer depois do player.');
assert.match(index, /bindApiFootballPanelEvents\(e\)/);
// O nome do parâmetro, a indentação e funções auxiliares próximas podem variar.
// Encontramos a declaração pelo nome e isolamos o trecho até emptyMarkup.
const cardMarkupPosition = index.search(/\bfunction\s+cardMarkup\s*\(/);
const emptyMarkupPosition = index.search(/\bfunction\s+emptyMarkup\s*\(/);
assert.ok(cardMarkupPosition >= 0, 'A função dos cards da agenda deve existir.');
assert.ok(emptyMarkupPosition > cardMarkupPosition, 'A função dos cards deve estar antes de emptyMarkup.');
const cardMarkupBodyPosition = index.indexOf('{', cardMarkupPosition);
assert.ok(cardMarkupBodyPosition > cardMarkupPosition && cardMarkupBodyPosition < emptyMarkupPosition, 'A função dos cards deve ter um corpo válido.');
const cardMarkupSource = index.slice(cardMarkupBodyPosition + 1, emptyMarkupPosition);
assert.doesNotMatch(cardMarkupSource, /homeScore|awayScore/, 'O placar não deve aparecer na agenda inicial.');
assert.doesNotMatch(cardMarkupSource, /goals|substitution|scorer|marcador/i, 'Gols e substituições não devem ser renderizados nos cards da agenda.');
assert.match(cardMarkupSource, /class=\"versus\">VS<\/div>/, 'O centro do card permanece apenas como VS.');
assert.match(index, /id="scheduleUpdateNotice"/, 'O aviso de nova atualização deve aparecer na tela de agendas.');
assert.match(index, /scheduleDownloadUpdate/, 'O aviso deve permitir baixar a nova versão.');
assert.match(index, /data-competition-logo/, 'A agenda deve aceitar o logo da competição quando disponível.');
assert.match(index, /competition-divider-mark/, 'Se o logo da competição falhar, a agenda deve voltar ao ícone de troféu.');
assert.match(index, /--pitch-depth/, 'O campo deve adaptar a profundidade dos jogadores quando a tela fica estreita.');
assert.match(index, /apifootball-pitch-half\.away \.apifootball-pitch-player/, 'O time visitante deve atacar na direção oposta no campo vertical.');

console.log('PASSOU: abas Escalações/Estatísticas; campo com mandante/visitante; ordem por grid; fotos por ID; fallback de imagem; técnico e reservas abaixo do campo; estatísticas comparativas; escape HTML; painel abaixo do player.');
