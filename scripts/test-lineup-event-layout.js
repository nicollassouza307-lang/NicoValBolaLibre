'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ui=require('../apifootball-lineup-ui');
const html=ui.renderLineups({
 fixture:{home:{id:1,name:'Casa'},away:{id:2,name:'Fora'}},
 lineups:[
  {team:{id:1,name:'Casa'},formation:'4-3-3',startXI:[{player:{id:11,name:'Atacante',number:9,position:'ST',rating:8.2,events:[{kind:'substitution',icon:'⇄',minute:'67',label:'Saiu'},{kind:'goal',icon:'⚽',minute:'20',label:'Gol'}]}}],substitutes:[]},
  {team:{id:2,name:'Fora'},formation:'4-4-2',startXI:[{player:{id:22,name:'Defensor',number:0,position:'CB',rating:5.7,events:[{kind:'assist',icon:'A',minute:'34',label:'Assistência'}]}}],substitutes:[]}
 ]
});
assert.match(html,/nvb-player-event-rail left/,'eventos de substituição devem usar o trilho esquerdo do titular');
assert.match(html,/substitution/);
assert.match(html,/nvb-player-event-rail right/,'gols/assistências devem ficar no trilho direito');
assert.match(html,/Atacante/);
assert.match(html,/6\.20/,'cabeçalho deve mostrar média das notas dos titulares');
assert.match(html,/6\.10/);
assert.doesNotMatch(html,/Camisa 0/,'camisa zero não deve aparecer como número');
const root=path.join(__dirname,'..');
const appHtml=fs.readFileSync(path.join(root,'index.html'),'utf8');
assert.match(appHtml,/playerVolumeSlider/);
assert.match(appHtml,/NVBScores365Standings/);
assert.match(appHtml,/#202020/,'campo escuro inspirado na referência deve estar ativo');
assert.match(appHtml,/nvb-player-event-rail\.left/,'a substituição dos titulares deve ficar no lado esquerdo');
assert.match(appHtml,/overflow:visible!important;gap:3px!important/,'os eventos precisam de espaço e não podem ser recortados quando houver vários lances');
console.log('PASSOU: layout de escalação com trilhos laterais de evento, camisa zero oculta, campo escuro e controle de volume.');
