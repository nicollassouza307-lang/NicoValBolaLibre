'use strict';
const assert=require('node:assert/strict');
const {normalizeGameDetails}=require('../365scores-service');
const details=normalizeGameDetails({game:{
 id:777,
 homeCompetitor:{id:1,name:'Casa',lineups:{members:[{id:101,athleteId:101,name:'Finalizador',status:1},{id:102,athleteId:102,name:'Criador',status:1},{id:103,athleteId:103,name:'Reserva',status:2}]}},
 awayCompetitor:{id:2,name:'Fora',lineups:{members:[]}},
 events:[
  {typeId:1,player:{id:101,name:'Finalizador'},assist:{athleteId:102,name:'Criador'},teamId:1,gameTime:'22'},
  {typeName:'Substitution',substitution:{out:{athleteId:101,name:'Finalizador'},in:{athleteId:103,name:'Reserva'}},teamId:1,gameTime:'70'},
  {typeName:'Goal',player:{id:103,name:'Reserva'},assistingPlayer:{athleteId:102,name:'Criador'},teamId:1,gameTime:'84'},
  {typeName:'Substitution',outAthleteId:101,inAthleteId:103,teamId:1,gameTime:'88'}
 ]
}});
assert.equal(details.events[0].player,'Finalizador');
assert.equal(details.events[0].secondaryPlayer,'Criador','o objeto assist vazio não pode mascarar o objeto aninhado do assistente');
assert.equal(details.events[1].player,'Finalizador');
assert.equal(details.events[1].secondaryPlayer,'Reserva','a entrada da substituição deve vir do objeto in');
assert.equal(details.events[2].secondaryPlayer,'Criador','variantes assistingPlayer também devem ser reconhecidas');
assert.equal(details.events[3].player,'Finalizador','o ID de quem sai deve ser resolvido pelo elenco da partida');
assert.equal(details.events[3].secondaryPlayer,'Reserva','o ID de quem entra deve ser resolvido mesmo quando o nome só existe no banco');
console.log('PASSOU: normalização de assistências e substituições com objetos aninhados e campos alternativos.');
