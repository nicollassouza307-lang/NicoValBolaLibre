'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const ui=require('../apifootball-lineup-ui');
const pkg=require('../package.json');
assert.equal(pkg.version,'0.22.2');
assert.match(html,/background-color:#101d30!important/,'Logos de competições devem usar o navy solicitado.');
assert.match(html,/playerEventIconsPanel/,'Admin deve ter configuração de PNG dos eventos.');
assert.match(html,/PLAYER_EVENT_ICONS_STORE_KEY/,'Ícones personalizados devem persistir.');
assert.match(html,/playerEventIcons:cleanPlayerEventIcons/,'Ícones devem entrar na sincronização compartilhada.');
assert.match(html,/match-fact-local-details|Capacidade/,'Local deve exibir a capacidade quando fornecida.');
assert.match(html,/function renderMatchFacts/,'Metadados precisam ser renderizados em blocos separados.');
assert.match(html,/scores365-event-team-cell/,'Eventos da partida devem exibir escudo e nome do time.');
assert.match(html,/scores365-stat-group \.apifootball-stat-grid\{grid-template-columns:minmax\(0,1fr\)/,'Estatísticas devem ficar uma por linha.');
assert.match(html,/--stat-home-color/,'As estatísticas devem receber cores por time.');
assert.match(html,/function matchDatePresentation/,'Data deve ter dia por extenso e dia da semana.');
assert.match(html,/V0\.22\.0 hotfix: competições em placa navy/,'CSS do hotfix deve estar presente.');

const snapshot={fixture:{home:{id:1,name:'Casa'},away:{id:2,name:'Fora'}},lineups:[
 {team:{id:1,name:'Casa'},formation:'4-3-3',startXI:[{player:{id:11,name:'Goleiro',number:1,pos:'G',rating:7.8,events:[{kind:'goal',icon:'⚽',label:'Gol'},{kind:'assist',icon:'A',label:'Assistência'},{kind:'substitution',icon:'⇄',label:'Saiu'}]}}],substitutes:[{player:{id:12,name:'Reserva',number:9,pos:'F',rating:6.9,events:[{kind:'substitution',icon:'↗',label:'Entrou'}]}}],coach:{name:'Técnico',photoUrl:'https://imagecache.365scores.com/v1/Managers/1.png'}},
 {team:{id:2,name:'Fora'},formation:'4-4-2',startXI:[],substitutes:[],coach:{name:'Outro'}}
]};
const lineupHtml=ui.renderLineups(snapshot,{eventIcons:{goal:'https://example.com/goal.png'}});
assert.match(lineupHtml,/goal\.png/,'PNG customizado deve aparecer quando configurado.');
assert.equal((lineupHtml.match(/<small>1x<\/small>/g)||[]).length,2,'Gol e assistência devem mostrar a contagem embaixo do símbolo.');
assert.match(lineupHtml,/Goleiro/,'Titulares devem aparecer no campo.');
assert.match(lineupHtml,/Camisa 1/,'Número da camisa deve ficar ao lado do nome.');
assert.match(lineupHtml,/7\.8/,'Nota deve ficar no espaço do indicador numérico.');
assert.match(lineupHtml,/Reserva/,'Reservas devem aparecer.');
assert.match(lineupHtml,/Entrou/,'Substituições de entrada devem aparecer no banco.');
assert.doesNotMatch(lineupHtml,/apifootball-bench-position/,'Reservas não devem mostrar indicador de posição.');
assert.match(lineupHtml,/Técnico/,'Técnico deve aparecer na comissão técnica.');
console.log('PASSOU: V0.22.2 mega-update visual, eventos por atleta, suplentes, PNGs, cores e blocos de metadados.');
