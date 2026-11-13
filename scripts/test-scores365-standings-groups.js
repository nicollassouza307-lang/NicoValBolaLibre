'use strict';
const assert=require('node:assert/strict');
const {normalizeGroups}=require('../scores365-standings');
const payload={standings:[
 {seasonNum:26,stageNum:1,leagueName:'League A',groups:[
  {groupName:'Group 1',rows:[
   {position:1,competitor:{id:10,name:'Portugal'},points:9,gamePlayed:3,gamesWon:3,ratio:5},
   {position:2,team:{id:11,name:'Croatia'},pts:4,played:3,won:1,drawn:1,lost:1,goalDifference:0}
  ]},
  {groupName:'Group 2',rows:[{rank:1,team:{id:12,name:'Spain'},pts:7,played:3,wins:2,draws:1,losses:0,goalsFor:6,goalsAgainst:2}]}
 ]},
 {seasonNum:25,stageNum:1,groupName:'League B · Group 1',rows:[{rank:1,team:{id:13,name:'Team Old'},points:99}]}
]};
const groups=normalizeGroups(payload,{seasonNum:26,stageNum:1});
assert.equal(groups.length,2);
assert.equal(groups[0].rows[0].competitor.name,'Portugal');
assert.equal(groups[0].label,'League A · Group 1');
assert.equal(groups[1].label,'League A · Group 2');
assert.equal(groups[0].rows[1].points,4);
assert.equal(groups[0].rows[1].gamePlayed,3);
assert.equal(groups[1].rows[0].ratio,4);
const nested=normalizeGroups({data:{groups:[{name:'League C',tables:[{name:'Group A',entries:[{rank:1,competitor:{name:'Example'},pts:6}]}]}]}});
assert.equal(nested.length,1);
assert.equal(nested[0].rows[0].competitor.name,'Example');
assert.equal(nested[0].label,'League C · Group A');
const repeatedTeam={rank:1,team:{id:77,name:'Shared Team'},pts:6,played:3};
const multiDivision=normalizeGroups({groups:[{name:'League A',groups:[{name:'Group 1',rows:[repeatedTeam]}]},{name:'League B',groups:[{name:'Group 1',rows:[repeatedTeam]}]}]});
assert.equal(multiDivision.length,2,'a mesma equipe pode aparecer em divisões diferentes');
assert.equal(multiDivision[0].rows.length,1);
assert.equal(multiDivision[1].rows.length,1,'a deduplicação não deve apagar linhas de outros grupos');
console.log('PASSOU: classificação com divisões/grupos aninhados, temporadas, posições, pontos e aliases de campos.');
