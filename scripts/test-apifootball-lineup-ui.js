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
    away: { id: 20, name: 'Flamengo', logo: 'https://media.api-sports.io/football/teams/20.png' },
    goals: { home: 2, away: 1 },
    score: { penalty: { home: 4, away: 3 } }
  },
  events: [
    { time: { elapsed: 18, extra: null }, team: { id: 10, name: 'Palmeiras' }, player: { id: 101, name: 'Camisa 10' }, assist: { id: 109, name: 'Meia Criador' }, type: 'Goal', detail: 'Normal Goal' },
    { time: { elapsed: 64, extra: 2 }, team: { id: 20, name: 'Flamengo' }, player: { id: 208, name: 'Atacante que saiu' }, assist: { id: 209, name: 'Atacante que entrou' }, type: 'subst', detail: 'Substitution 1' },
    { time: { elapsed: 90, extra: null }, team: { id: 10, name: 'Palmeiras' }, player: { id: 101, name: 'Camisa 10' }, assist: { id: 109, name: 'Meia Criador' }, type: 'Goal', detail: 'Penalty' }
  ],
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
assert.ok(forwardPositions.every(entry => entry.left >= 79), 'Atacantes devem ocupar a zona avançada e manter o desenho de ponta.');
assert.ok(forwardPositions.every(entry => entry.depth >= 79), 'A profundidade real também deve estar disponível para a orientação vertical em telas estreitas.');
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

const apiShapeLineups = {
  ...snapshot,
  lineups: [{
    team: { id: 10, name: 'Palmeiras' }, formation: '4-3-3', coach: { name: 'Técnico' },
    startXI: [{ player: { id: 777, name: 'Ponta Aberto', number: 7, pos: 'F', grid: '4:1' } }],
    substitutes: [{ player: { id: 778, name: 'Reserva API', number: 19, pos: 'M' } }]
  }]
};
const wrappedLineupHtml = ui.renderLineups(apiShapeLineups);
assert.match(wrappedLineupHtml, /Ponta Aberto/, 'Formato original da API-Football com player aninhado deve renderizar o nome.');
assert.match(wrappedLineupHtml, /players\/777\.png/, 'Formato original da API-Football deve manter o ID da foto.');
assert.match(wrappedLineupHtml, /Reserva API/, 'Reservas com player aninhado também devem renderizar.');

const eventsHtml = ui.renderMatchEvents(snapshot);
assert.match(eventsHtml, /Camisa 10/);
assert.match(eventsHtml, /Assistência: Meia Criador/);
assert.match(eventsHtml, /Entrou: Atacante que entrou/);
assert.match(eventsHtml, /Saiu: Atacante que saiu/);
assert.match(eventsHtml, /4/);
assert.match(eventsHtml, /3/);
assert.doesNotMatch(eventsHtml, /DECISÃO POR PÊNALTIS/, 'O resultado dos pênaltis aparece uma única vez no placar da central da partida.');

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
assert.match(cardMarkupSource, /cardHomeScore|cardAwayScore/, 'A agenda deve exibir o placar quando os dados existirem.');
assert.match(cardMarkupSource, /agenda-score-wrap/, 'O placar deve ter marcação própria nos cards da agenda.');
assert.doesNotMatch(cardMarkupSource, /scorer|substitution|Assistência/i, 'Autores de gols, assistências e substituições ficam nos detalhes da partida, não no card da agenda.');
assert.match(cardMarkupSource, /class=\"versus\">VS<\/div>/, 'Partidas sem placar continuam exibindo VS.');
assert.match(index, /renderMatchEvents\(snapshot\)/, 'A central da partida deve exibir gols, assistências e substituições.');
assert.match(index, /match-penalty-score/, 'A central da partida deve destacar o placar nos pênaltis.');
assert.match(index, /e\.teams\?\.home\?\.score/, 'A agenda deve reconhecer o placar nas equipes aninhadas da fonte.');
assert.match(index, /apifootball-pitch-player \.apifootball-photo-frame\{width:52px;height:52px/, 'As fotos dos titulares devem ter tamanho ampliado.');
assert.match(index, /id="scheduleUpdateNotice"/, 'O aviso de nova atualização deve aparecer na tela de agendas.');
assert.match(index, /scheduleDownloadUpdate/, 'O aviso deve permitir baixar a nova versão.');
assert.match(index, /data-competition-logo/, 'A agenda deve aceitar o logo da competição quando disponível.');
assert.match(index, /competition-divider-mark/, 'Se o logo da competição falhar, a agenda deve voltar ao ícone de troféu.');
assert.match(index, /--pitch-depth/, 'O campo deve adaptar a profundidade dos jogadores quando a tela fica estreita.');
assert.match(index, /apifootball-pitch-half\.away \.apifootball-pitch-player/, 'O time visitante deve atacar na direção oposta no campo vertical.');

console.log('PASSOU: escalações; wrappers originais da API; fotos; campo ampliado/compactado; gols, assistências, substituições e pênaltis; placar na agenda e central; estatísticas; escape HTML.');
