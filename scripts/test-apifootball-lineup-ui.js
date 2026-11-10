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
assert.equal(ui.playerPhotoUrl({ id: 321, photoUrl: 'https://imagecache.365scores.com/image/upload/v1/Athletes/321' }), 'https://imagecache.365scores.com/image/upload/v1/Athletes/321', 'A foto fornecida pela 365Scores deve ter prioridade sobre o fallback API-Football.');
assert.equal(ui.playerPhotoUrl({ id: 321, photoUrl: 'javascript:alert(1)' }), 'https://media.api-sports.io/football/players/321.png', 'URLs de foto fora dos hosts permitidos devem ser rejeitadas.');
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
assert.ok(forwardPositions.every(entry => entry.left >= 77), 'Atacantes devem ocupar a zona avançada e manter o desenho de ponta.');
assert.ok(forwardPositions.every(entry => entry.depth >= 77), 'A profundidade real também deve estar disponível para a orientação vertical em telas estreitas.');

const keeperSeparation=ui.playerPlacements([
  {player:{name:'Goleiro',pos:'G',grid:'1:1'}},
  {player:{name:'Zagueiro A',pos:'D',grid:'1:2'}},
  {player:{name:'Zagueiro B',pos:'D',grid:'1:3'}},
  {player:{name:'Meia',pos:'M',grid:'2:1'}},
  {player:{name:'Atacante',pos:'F',grid:'3:1'}}
],'home','4-2-3-1');
const keeperDepth=keeperSeparation.find(item=>item.player.player.name==='Goleiro').depth;
const defenderDepth=keeperSeparation.find(item=>item.player.player.name==='Zagueiro A').depth;
assert.ok(defenderDepth-keeperDepth>=19,'A primeira linha defensiva deve ficar claramente afastada do goleiro, mesmo quando a grade usa a mesma linha.');
assert.ok(keeperSeparation.find(item=>item.player.player.name==='Atacante').depth>defenderDepth,'As linhas de meio/ataque devem avançar progressivamente.');

const attackingRating=ui.playerRatingInfo({name:'Atacante',pos:'F',stats:[
  {name:'Gols',value:1},{name:'Assistências',value:1},{name:'Total de chutes',value:4},
  {name:'Assistência esperada (xA)',value:'0.46'},{name:'Passes decisivos',value:3},
  {name:'Passes no último terço',value:8},{name:'Passes completos',value:'30/43 (70%)'},
  {name:'Passes longos completos',value:'7/20 (35%)'},{name:'Cruzamentos completos',value:'1/1 (100%)'},
  {name:'Dribles completos',value:'1/1 (100%)'},{name:'Ações com a bola',value:62},
  {name:'Faltas sofridas',value:2},{name:'Faltas cometidas',value:1},{name:'Posse de bola perdida',value:7},
  {name:'Driblado',value:2},{name:'Impedimentos',value:1},{name:'Duelos no chão',value:'12/20 (60%)'},
  {name:'Duelos aéreos',value:'2/3 (67%)'},{name:'Minutos',value:90}
]});
assert.ok(attackingRating.value>7,'Nota deve considerar estatísticas ofensivas, passe, drible, posse e duelos.');
const defensiveRating=ui.playerRatingInfo({name:'Zagueiro',pos:'D',stats:[
  {name:'Desarmes',value:4},{name:'Interceptações',value:3},{name:'Perigo afastado',value:8},
  {name:'Recuperação de posse de bola',value:5},{name:'Faltas cometidas',value:1},
  {name:'Passes completos',value:'42/48 (88%)'},{name:'Duelos no chão',value:'8/10 (80%)'},
  {name:'Duelos aéreos',value:'5/7 (71%)'},{name:'Minutos',value:90}
]});
assert.ok(defensiveRating.value>6.5,'Defensores devem receber crédito por desarmes, interceptações, cortes, recuperações e duelos.');
const goalkeeperRating=ui.playerRatingInfo({name:'Goleiro',pos:'G',stats:[{name:'Defesas do goleiro',value:6},{name:'Gols sofridos',value:1},{name:'Reposição de soco',value:2},{name:'Minutos',value:90}]});
assert.ok(goalkeeperRating.value>6,'A nota do goleiro deve contabilizar defesas, gols sofridos e reposições de soco.');
const fullIndividualStats=ui.playerRatingInfo({name:'Meio-campista',pos:'M',stats:[
  {name:'Minutos',value:90},{name:'Gols',value:0},{name:'Assistências',value:0},{name:'Gols esperados (xG)',value:.15},
  {name:'Gols esperados no alvo (xGOT)',value:.2},{name:'Total de chutes',value:1},{name:'Chutes para fora',value:1},
  {name:'Impedimentos',value:0},{name:'Assistência esperada (xA)',value:.3},{name:'Passes decisivos',value:2},
  {name:'Chances perigosas criadas',value:2},{name:'Passes no último terço',value:8},{name:'Passes para trás',value:4},
  {name:'Passes completos',value:'40/45 (89%)'},{name:'Passes longos completos',value:'5/7 (71%)'},
  {name:'Cruzamentos completos',value:'2/4 (50%)'},{name:'Ações com a bola',value:65},{name:'Faltas sofridas',value:2},
  {name:'Faltas cometidas',value:1},{name:'Posse de bola perdida',value:8},{name:'Driblado',value:1},
  {name:'Perigo afastado',value:2},{name:'Interceptações',value:3},{name:'Recuperação de posse de bola',value:5},
  {name:'Duelos no chão',value:'8/12 (67%)'},{name:'Duelos aéreos',value:'2/3 (67%)'},
  {name:'Desarmes',value:2},{name:'Cortes',value:1},{name:'Bloqueios',value:1}
]});
assert.ok(fullIndividualStats.value!==null&&fullIndividualStats.value>=0&&fullIndividualStats.value<=10,'Todas as estatísticas individuais do quadro devem alimentar uma nota válida entre 0 e 10.');
const xgotWithout=ui.playerRatingInfo({name:'Meia',pos:'M',stats:[{name:'Minutos',value:90},{name:'Gols',value:0},{name:'Assistências',value:0}]});
const xgotWith=ui.playerRatingInfo({name:'Meia',pos:'M',stats:[{name:'Minutos',value:90},{name:'Gols',value:0},{name:'Assistências',value:0},{name:'Gols esperados em chutes no alvo (xGOT)',value:.6}]});
assert.equal(xgotWithout.value,6,'A ausência de percentuais não pode penalizar a nota-base.');
assert.ok(xgotWith.value>xgotWithout.value,'xGOT no rótulo completo em português deve influenciar a nota.');

const roleConflictPlayers=[
  {player:{name:'Goleiro',pos:'G',grid:'1:1'}},
  ...['Zagueiro 1','Zagueiro 2','Zagueiro 3','Zagueiro 4'].map((name,index)=>({player:{name,pos:'D',grid:`2:${index+1}`} })),
  ...['Meia 1','Meia 2','Meia 3','Meia 4'].map((name,index)=>({player:{name,pos:'M',grid:`3:${index+1}`} })),
  {player:{name:'Marc Bernal',pos:'CM',grid:'5:1'}},
  {player:{name:'Lamine Yamal',pos:'RW',grid:'2:5'}}
];
const repairedRoles=ui.sortLineupPlayers(roleConflictPlayers,'4-2-3-1');
const depthOf=name=>repairedRoles.find(player=>player.player.name===name).__depth;
assert.ok(depthOf('Lamine Yamal')>depthOf('Zagueiro 1'),'Atacante que vier na linha defensiva deve ser reposicionado pela função.');
assert.ok(depthOf('Marc Bernal')<depthOf('Lamine Yamal'),'Meio-campista que vier na última linha deve voltar para o meio.');

const ratedLineupHtml=ui.renderLineups({...snapshot,lineups:[{...snapshot.lineups[0],startXI:[{player:{name:'Nota Colorida',number:10,pos:'F',stats:[{name:'Minutos',value:90},{name:'Gols',value:1}]}}]}]});
assert.match(ratedLineupHtml,/apifootball-pitch-rating rating-(?:excellent|good|average|low|poor)/,'Nota do titular deve receber cor conforme a avaliação.');
assert.match(ratedLineupHtml,/apifootball-pitch-rating [^>]*>[^<]+<\/span>\s*<div class="apifootball-pitch-name-row"/,'Badge de nota fica sobre a foto e antes do nome, sem invadir a linha do texto.');


const fallbackFormation = ui.playerPlacements([
  { player: { name: 'GK', pos: 'G' } },
  { player: { name: 'CB', pos: 'D' } },
  { player: { name: 'CM', pos: 'M' } },
  { player: { name: 'ST', pos: 'F' } }
], 'home');
assert.equal(new Set(fallbackFormation.map(entry => entry.depth)).size, 4, 'Sem coordenadas válidas, goleiro, defesa, meio e ataque devem ocupar linhas diferentes.');
assert.ok(fallbackFormation.every(entry => entry.left >= 0 && entry.left <= 100 && entry.top >= 0 && entry.top <= 100), 'Todos os marcadores devem permanecer dentro do campo.');
const unknownPositionFormation=ui.playerPlacements(Array.from({length:11},(_,index)=>({player:{name:`Jogador ${index+1}`,pos:''}})),'home','4-2-3-1');
assert.equal(new Set(unknownPositionFormation.map(entry=>entry.depth)).size,5,'Formações 4-2-3-1 devem preservar cinco linhas mesmo quando a API omite os códigos de posição.');
assert.match(lineupHtml, /Palmeiras/);
assert.match(lineupHtml, /Flamengo/);
assert.match(lineupHtml, /4-2-3-1/);
assert.match(lineupHtml, /4-3-3/);
assert.match(lineupHtml, /media\.api-sports\.io\/football\/players\/101\.png/);
const scores365LineupSnapshot = { ...snapshot, lineups: [{ team:{id:10,name:'Palmeiras'},formation:'4-3-3',coach:{name:'Técnico 365'},startXI:[{player:{id:4321,name:'Atleta 365',number:8,pos:'M',photoUrl:'https://imagecache.365scores.com/image/upload/v1/Athletes/4321'},grid:'3:1'}],substitutes:[] }] };
const scores365LineupHtml = ui.renderLineups(scores365LineupSnapshot);
assert.match(scores365LineupHtml, /imagecache\.365scores\.com\/image\/upload\/v1\/Athletes\/4321/, 'O campo deve aceitar fotos da CDN 365Scores.');
assert.match(scores365LineupHtml, /Atleta 365/);
const eventDotLineupHtml=ui.renderLineups({...scores365LineupSnapshot,lineups:[{...scores365LineupSnapshot.lineups[0],startXI:[{player:{id:4321,name:'Atleta 365',number:8,pos:'M',events:[{kind:'goal',label:'Gol',minute:'10'},{kind:'own-goal',label:'Gol contra',minute:'20'},{kind:'yellow',label:'Cartão amarelo',minute:'30'},{kind:'substitution',label:'Saiu',minute:'70'},{kind:'missed-penalty',label:'Pênalti perdido',minute:'80'}]}}]}]});
assert.match(eventDotLineupHtml,/nvb-player-event [^\"]*own-goal/,'Gol contra precisa aparecer como marcador individual na formação.');
assert.match(eventDotLineupHtml,/nvb-player-event [^\"]*missed-penalty/,'Pênalti perdido também deve aparecer na formação.');
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
assert.match(index, /\.match-center-panel \.apifootball-stat-team-labels strong \{ color: #aec2d9; \}/, 'Os nomes dos times nas estatísticas devem ter cor neutra.');
assert.match(index, /playerNameMatches\(member\.name,ev\.player\)/, 'Eventos devem associar jogadores pelo nome como fallback mesmo quando existe ID divergente.');
assert.match(index, /make\('missed-penalty'/, 'Eventos de pênalti perdido também devem ser convertidos em marcadores individuais.');
assert.match(index, /ensureScores365MatchDataOnOpen\(e\)/, 'Abrir a partida deve iniciar o carregamento automático da 365Scores.');
assert.match(index, /Busca automática ao abrir a partida/, 'O painel deve explicar a busca automática ao abrir o jogo.');
assert.match(index, /scores365MatchOpenBusy/, 'O estado de carregamento deve ser isolado por partida.');
assert.match(index, /round of 16\|group\|stage/, 'Fases eliminatórias não devem ser confundidas com rodadas numéricas.');
assert.match(index, /\.match-center-panel \.apifootball-stat-card \.away \{\s*background:\s*var\(--stat-away-color/, 'A barra de estatísticas do visitante deve usar a cor do clube.');
assert.doesNotMatch(index, /id="competitionsView"|id="competitionsBtn"/, 'A página isolada de Competições deve sair da navegação.');
assert.ok(index.indexOf('${renderScores365MatchPanel(e)}') > index.indexOf('class="player-shell match-player-card"'), 'Painel 365Scores deve aparecer depois do player.');
assert.match(index, /bindScores365MatchPanelEvents\(e\)/);
assert.match(index, /renderScores365MatchPanel\(e\)/, 'Partidas com vínculo confirmado devem exibir o painel da 365Scores.');
assert.match(index, /scores365LineupAsApiSnapshot/, 'Escalações 365Scores devem ser adaptadas ao campo tático existente.');
assert.match(index, /Number\.isInteger\(line\)&&line>=1&&line<=6&&Number\.isInteger\(row\)&&row>=1&&row<=5/, 'Coordenadas proporcionais ou fora da grade tática devem acionar o posicionamento por função.');
assert.match(index, /addShotCount\(h,homeName\);addShotCount\(a,awayName\)/, 'Finalizações do gráfico devem aparecer no comparativo coletivo quando a fonte não trouxer o total por equipe.');
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
assert.match(index,/background:#132638!important;color:#f8fafc!important;box-shadow:0 1px 3px #0005!important;line-height:1!important/,'Todos os eventos devem usar uma base visual única #132638.');
assert.match(index,/border-radius:50%!important;background:#132638!important/,'Cartões, gols e substituições devem ter marcadores circulares padronizados.');
assert.match(index,/rating-excellent/,'A interface deve colorir as notas conforme a faixa de desempenho.');


console.log('PASSOU: escalações; wrappers originais da API; fotos; campo ampliado/compactado; gols, assistências, substituições e pênaltis; placar na agenda e central; estatísticas; escape HTML.');
