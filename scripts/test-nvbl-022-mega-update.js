'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const lineupSource=fs.readFileSync(path.join(root,'apifootball-lineup-ui.js'),'utf8');
const service=fs.readFileSync(path.join(root,'365scores-service.js'),'utf8');
const pkg=require('../package.json');
const ui=require('../apifootball-lineup-ui');

assert.equal(pkg.version,'0.22.10');
assert.match(html,/Rei dos Canais/);
assert.match(html,/LA18HD/);
assert.match(html,/PelotaLibre/);

// Automatic association, high-confidence-only, never adding fixtures.
assert.match(html,/runScores365AutoAgendaMatching\(requestedDate\)/);
assert.match(html,/function runScores365AutoAgendaMatching/);
assert.match(html,/persistAutoScores365Links\(result\.matches\)/);
assert.match(html,/autoEligible/);
assert.match(html,/6\*60\*60\*1000/);
assert.match(html,/A agenda não foi alterada/);

// Match clock and request cadence are app-side controls, not external guarantees.
assert.match(html,/scores365AgendaClockTimer=setInterval\(\(\)=>void refreshScores365AgendaClockBatch\(\),120000\)/);
assert.match(html,/loadScores365MatchData\(event,false,true\)/);
assert.match(html,/scores365PhasePresentation\(e,scores365Details\)\.label/);
assert.match(html,/return \{label:clock\|\|'Ao Vivo'/);
assert.match(service,/ttlMs:\s*90_000/);
assert.match(html,/600000/);
assert.match(html,/scores365StandingsBusy\.delete\(cacheKey\)/);
assert.doesNotMatch(html,/renderModal\(\);\s*\/\/.*(?:365Scores|placar)/);

// Livescore icons, crest placement, goals/assists, substitutions, non-duplicated cards.
assert.match(html,/PLAYER_EVENT_ICON_KINDS/);
assert.match(html,/scores365-event-team-badge/);
assert.match(html,/scores365-event-custom-image/);
assert.match(html,/data-event-icon-image/);
assert.match(html,/icons\[meta\.kind\]/);
assert.match(html,/Assistência: \$\{incoming\}/);
assert.match(html,/Entrou: \$\{incoming\}/);
assert.match(html,/Saiu: \$\{outgoing\}/);
assert.match(html,/fold\(event\.detail\)!==fold\(event\.type\)/);
assert.match(html,/has-fallback/);
assert.match(lineupSource,/safePngUrl/);
assert.match(lineupSource,/nvb-player-event-image/);
assert.match(html,/url\.pathname\)/);

// Ratings and formation mapping.
assert.match(lineupSource,/function playerRatingInfo/);
assert.match(lineupSource,/nota estimada com estatísticas individuais disponíveis, eventos, função e minutos/);
assert.match(lineupSource,/function renderPlayerRatings/);
assert.match(lineupSource,/function formationCounts/);
assert.match(lineupSource,/function distributeFormationRows/);
assert.match(lineupSource,/\$\{renderPlayerRatings\(\[home,away\]\)\}/);
assert.match(lineupSource,/\$\{coach\?/);
assert.match(html,/formationPosition/);

const players4231=[
  ['G','Goalkeeper'],['D','Defender'],['D','Defender'],['D','Defender'],['D','Defender'],
  ['M','Midfielder'],['M','Midfielder'],['M','Midfielder'],['M','Midfielder'],['M','Midfielder'],['F','Forward']
].map(([pos,role],i)=>({player:{id:i+1,name:`P${i+1}`,number:i+1,pos,role}}));
const placements=ui.playerPlacements(players4231,'home','4-2-3-1');
assert.equal(placements.length,11,'Nenhum titular pode sumir do campo.');
const rowCounts=[...new Set(placements.map(p=>p.depth))].map(depth=>placements.filter(p=>p.depth===depth).length);
assert.deepEqual(rowCounts,[1,4,2,3,1],'O fallback deve reconstruir GK + 4-2-3-1.');
assert.ok(placements.every(p=>p.left>=8&&p.left<=86&&p.top>=10&&p.top<=90));
const shortFormation=ui.playerPlacements([
  {player:{pos:'G',role:'Goalkeeper'}},
  ...['D','D','D','D','M','F'].map((pos,i)=>({player:{pos,role:pos==='D'?'Defender':pos==='M'?'Midfielder':'Forward',name:`S${i}`}}))
],'home','4-1-1');
assert.equal(shortFormation.length,7);
assert.deepEqual([...new Set(shortFormation.map(p=>p.depth))].map(depth=>shortFormation.filter(p=>p.depth===depth).length),[1,4,1,1]);

const keeperRating=ui.playerRatingInfo({pos:'G',role:'Goalkeeper',stats:[{name:'Saves',value:'5'},{name:'Goals conceded',value:'1'}],events:[]});
assert.equal(typeof keeperRating.value,'number');
assert.ok(keeperRating.value>=3&&keeperRating.value<=10);
assert.equal(ui.playerRatingInfo({name:'No data',stats:[],events:[]}).value,null);
const rendered=ui.renderLineups({fixture:{home:{id:1,name:'Home'},away:{id:2,name:'Away'}},lineups:[
 {team:{id:1,name:'Home'},formation:'4-2-3-1',startXI:[{player:{id:1,name:'Goleiro',number:1,pos:'G',role:'Goalkeeper',events:[{kind:'goal',icon:'⚽',label:'Gol'}],stats:[{name:'Saves',value:'4'}]}}],substitutes:[],coach:{name:''}},
 {team:{id:2,name:'Away'},formation:'4-4-2',startXI:[],substitutes:[],coach:{name:''}}
]}, {eventIcons:{goal:'https://example.com/gol.png'}});
assert.match(rendered,/Notas dos jogadores/);
assert.match(rendered,/gol\.png/);
assert.doesNotMatch(rendered,/Técnico não informado/);

// Statistics and standings use the site's two-tone comparison and match position labels.
assert.match(html,/const lightStatColor='#71ded3'/);
assert.match(html,/const darkStatColor='#35556f'/);
assert.match(html,/scores365-match-table-positions/);
assert.match(html,/is-match-home/);
assert.match(html,/is-match-away/);
assert.match(html,/void loadScores365Standings\(event,\{silent:true\}\)/);

// The isolated Where to Watch panel was removed from the match modal.
assert.doesNotMatch(html,/class="broadcast-panel match-broadcast-panel/);
assert.doesNotMatch(html,/Onde Assistir/);

console.log('PASSOU: V0.22.10, 14 planejamentos, associação automática, relógio em agenda, Livescore PNG/eventos, notas, formações, classificação e compatibilidade do player.');
