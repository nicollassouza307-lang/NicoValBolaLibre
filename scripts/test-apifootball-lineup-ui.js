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
        { id: 204, name: 'Atacante 1', number: 11, pos: 'F', grid: '4:1' },
        { id: 208, name: 'Atacante que saiu', number: 17, pos: 'F', grid: '4:3' }
      ],
      substitutes: [{ id: 205, name: 'Reserva Visitante', number: 18, pos: 'M' }, { id: 209, name: 'Atacante que entrou', number: 23, pos: 'F' }]
    },
    {
      team: { id: 10, name: 'Palmeiras' }, formation: '4-2-3-1', coach: { name: 'Técnico Mandante' },
      startXI: [
        { id: 101, name: 'Camisa 10', number: 10, pos: 'M', grid: '3:2' },
        { id: 102, name: 'Goleiro Mandante', number: 21, pos: 'G', grid: '1:1' },
        { id: 103, name: 'Centroavante', number: 9, pos: 'F', grid: '4:1' }
      ],
      substitutes: [{ id: 104, name: 'Reserva Mandante', number: 30, pos: 'F' }, { id: 109, name: 'Meia Criador', number: 14, pos: 'M' }]
    }
  ],
  statistics: [
    { team: { id: 20, name: 'Flamengo' }, values: [{ type: 'Ball Possession', value: '42%' }, { type: 'Total Shots', value: 8 }] },
    { team: { id: 10, name: 'Palmeiras' }, values: [{ type: 'Ball Possession', value: '58%' }, { type: 'Total Shots', value: 13 }] }
  ]
};

assert.equal(ui.playerPhotoUrl(1234), 'https://media.api-sports.io/football/players/1234.png');
assert.equal(ui.playerPhotoUrl(0), '');
assert.equal(ui.playerPhotoUrl({ id: 321, photoUrl: 'https://imagecache.365scores.com/image/upload/v1/Athletes/321' }), 'https://imagecache.365scores.com/image/upload/v1/Athletes/321', 'A foto fornecida pela 365Scores deve ter prioridade sobre o fallback API-Football.');
assert.equal(ui.playerPhotoUrl({ id: 321, photoUrl: 'javascript:alert(1)' }), 'https://media.api-sports.io/football/players/321.png', 'URLs de foto fora dos hosts permitidos devem ser rejeitadas.');
assert.deepEqual(ui.sortLineupPlayers(snapshot.lineups[0].startXI).map(player => player.name), [
  'Goleiro Visitante', 'Defensor 1', 'Atacante 1', 'Atacante 2', 'Atacante que saiu'
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
const fallbackFormation = ui.playerPlacements([
  { player: { name: 'GK', pos: 'G' } },
  { player: { name: 'CB', pos: 'D' } },
  { player: { name: 'CM', pos: 'M' } },
  { player: { name: 'ST', pos: 'F' } }
], 'home');
assert.equal(new Set(fallbackFormation.map(entry => entry.depth)).size, 4, 'Sem coordenadas válidas, goleiro, defesa, meio e ataque devem ocupar linhas diferentes.');
assert.ok(fallbackFormation.every(entry => entry.left >= 0 && entry.left <= 100 && entry.top >= 0 && entry.top <= 100), 'Todos os marcadores devem permanecer dentro do campo.');
const tacticalRoster = [
  { name: 'GK', number: 1, pos: 'G' },
  ...['D1','D2','D3'].map((name, index) => ({ name, number: index + 2, pos: 'D' })),
  ...['M1','M2','M3','M4','AM1','AM2'].map((name, index) => ({ name, number: index + 5, pos: 'M' })),
  { name: 'ST', number: 9, pos: 'F' }
].map(player => ({ player }));
const tacticalHome = ui.playerPlacements(tacticalRoster, 'home', '3-4-2-1');
const tacticalLayers = new Map();
for (const entry of tacticalHome) tacticalLayers.set(entry.depth, (tacticalLayers.get(entry.depth) || 0) + 1);
assert.deepEqual([...tacticalLayers.values()], [1, 3, 4, 2, 1], 'A formação 3-4-2-1 deve distribuir os 11 jogadores em cinco linhas táticas.');
const tacticalAway = ui.playerPlacements(tacticalRoster, 'away', '3-4-2-1');
assert.ok(tacticalHome[0].left < tacticalAway[0].left, 'Os dois times devem atacar em direções opostas no campo horizontal.');
assert.match(lineupHtml, /Palmeiras/);
assert.match(lineupHtml, /Flamengo/);
assert.match(lineupHtml, /4-2-3-1/);
assert.match(lineupHtml, /4-3-3/);
assert.match(lineupHtml, /media\.api-sports\.io\/football\/players\/101\.png/);
const scores365LineupSnapshot = { ...snapshot, lineups: [{ team:{id:10,name:'Palmeiras'},formation:'4-3-3',coach:{name:'Técnico 365'},startXI:[{player:{id:4321,name:'Atleta 365',number:8,pos:'M',photoUrl:'https://imagecache.365scores.com/image/upload/v1/Athletes/4321'},grid:'3:1'}],substitutes:[] }] };
const scores365LineupHtml = ui.renderLineups(scores365LineupSnapshot);
assert.match(scores365LineupHtml, /imagecache\.365scores\.com\/image\/upload\/v1\/Athletes\/4321/, 'O campo deve aceitar fotos da CDN 365Scores.');
assert.match(scores365LineupHtml, /Atleta 365/);
assert.match(lineupHtml, /Camisa 10/);
assert.match(lineupHtml, /Técnico Mandante/);
assert.match(lineupHtml, /Reserva Mandante/);
assert.ok(lineupHtml.indexOf('apifootball-pitch') < lineupHtml.indexOf('apifootball-support-grid'), 'Técnico e banco devem ficar fora e abaixo do campo.');
assert.match(lineupHtml, /apifootball-photo-fallback/);
assert.match(lineupHtml, /apifootball-player-event-badge/, 'Eventos da partida devem aparecer como marcadores ao redor das fotos dos titulares.');
assert.match(lineupHtml, /substitution-out|substitution-in/, 'Substituições devem identificar atletas que saíram ou entraram.');
assert.match(lineupHtml, /apifootball-player-event-badge assist/, 'O autor da assistência também deve receber um marcador na foto.');

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
assert.match(statsHtml, /--stat-home-color:#007a33/, 'Palmeiras deve usar sua cor principal nas estatísticas.');
assert.match(statsHtml, /--stat-away-color:#c8102e/, 'Flamengo deve usar sua cor principal nas estatísticas.');
assert.equal(ui.teamPrimaryColor('Liverpool'), '#c8102e');
assert.equal(ui.teamPrimaryColor('Borussia Dortmund'), '#f7d417');

const escapedHtml = ui.renderLineups({ ...snapshot, lineups: [{ ...snapshot.lineups[1], team: { id: 10, name: '<script>alert(1)<\/script>' } }] });
assert.doesNotMatch(escapedHtml, /<script>alert\(1\)<\/script>/);

const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
assert.match(index, /apifootball-lineup-ui\.js/);
assert.match(index, /data-apifootball-tab="lineups"/);
assert.match(index, /data-apifootball-tab="statistics"/);
assert.match(index, /data-apifootball-tab="livescore"/);
assert.match(index, /data-apifootball-tab="standings"/);
assert.match(index, /img\.crest:not\(\.crest-github\),\s*img\.competition-divider-logo,\s*\.apifootball-team-head-crest\s*\{\s*background-color:\s*#fff/, 'Placas brancas ficam atrás de logos raster/competições, preservando o tile escuro dos SVGs GitHub.');
assert.match(index, /img\.crest\.crest-github\s*\{\s*background-color:\s*#0c1b27/, 'SVGs brancos do GitHub devem permanecer visíveis em fundo escuro.');
assert.doesNotMatch(index, /\.match-scoreboard \.match-team-home[^}]*background:\s*#fff/, 'O cartão do time na central não deve ficar branco.');
assert.doesNotMatch(index, /\.match-center-panel\s*\{[^}]*background:\s*#(?:fff|f[0-9a-f]{3,6})/i, 'O painel inferior da partida deve manter o tema escuro.');
assert.match(index, /\.match-center-panel \.apifootball-stat-card \.home \{\s*background:\s*var\(--stat-home-color/, 'A barra de estatísticas do mandante deve usar a cor do clube.');
assert.match(index, /\.match-center-panel \.apifootball-stat-card \.away \{\s*background:\s*var\(--stat-away-color/, 'A barra de estatísticas do visitante deve usar a cor do clube.');
assert.doesNotMatch(index, /id="competitionsView"|id="competitionsBtn"/, 'A página isolada de Competições deve sair da navegação.');
assert.ok(index.indexOf('${renderApiFootballMatchPanel(e)}') > index.indexOf('class="player-shell match-player-card"'), 'Painel esportivo deve aparecer depois do player.');
assert.match(index, /bindApiFootballPanelEvents\(e\)/);
assert.match(index, /renderScores365MatchPanel\(e\)/, 'Partidas com vínculo confirmado devem exibir o painel da 365Scores.');
assert.match(index, /scores365LineupAsApiSnapshot/, 'Escalações 365Scores devem ser adaptadas ao campo tático existente.');
assert.match(index, /grid:''/, 'Coordenadas brutas inconsistentes da 365Scores não devem empurrar todos os atletas para o mesmo canto.');
const lineupUiSource = fs.readFileSync(path.join(__dirname, '..', 'apifootball-lineup-ui.js'), 'utf8');
assert.match(lineupUiSource, /playerPlacements\(players, side, lineup\.formation\)/, 'O posicionamento deve usar a formação como fallback quando faltarem coordenadas confiáveis.');
assert.match(lineupUiSource, /formationFallback/, 'A formação deve substituir coordenadas ausentes ou inválidas.');
assert.match(lineupUiSource, /playerEventMarkers/, 'Gols, cartões e substituições devem ser associados às fotos dos atletas.');
assert.match(index, /scores365CanonicalStatName/, 'As estatísticas coletivas devem ser normalizadas para nomes consistentes.');
assert.match(index, /Finalizações.*No gol.*Para fora.*Bloqueadas/, 'Finalizações e seus desdobramentos devem aparecer na categoria de ataque.');
assert.match(index, /scores365-stat-category/, 'As estatísticas devem ser agrupadas em categorias visuais.');
assert.match(index, /scores365LoadStandings/, 'A classificação 365Scores deve poder ser solicitada na central da partida.');
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
assert.match(index, /position:absolute;left:0;width:100%;height:50%/, 'No celular, as duas metades do campo devem ficar alinhadas em uma quadra vertical contínua.');
assert.match(index, /match-facts-enriched/, 'O cabeçalho deve apresentar os detalhes de estádio, rodada e árbitro recebidos pela fonte.');
assert.match(index, /scores365Details\?\.venue/, 'O local do 365Scores deve alimentar o cabeçalho da partida.');

console.log('PASSOU: escalações; wrappers originais da API; fotos; campo ampliado/compactado; gols, assistências, substituições e pênaltis; placar na agenda e central; estatísticas; escape HTML.');
