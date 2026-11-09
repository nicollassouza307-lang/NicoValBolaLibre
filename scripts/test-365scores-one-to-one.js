'use strict';
const assert=require('node:assert/strict');
const {matchAgendaEvents}=require('../365scores-service');
const agenda=[
{id:'a',home:'Flamengo',away:'Palmeiras',dateEvent:'2026-11-08',timeText:'16:00',league:'Brasileirão Série A'},
{id:'b',home:'Flamengo',away:'Palmeiras',dateEvent:'2026-11-08',timeText:'16:00',league:'Brasileirão Série A'}
];
const games=[{gameId:9001,startTime:'2026-11-08T16:00:00-03:00',home:{id:10,name:'Flamengo'},away:{id:20,name:'Palmeiras'},competition:{id:30,name:'Brasileirão Série A'},category:'men'}];
const result=matchAgendaEvents(agenda,games);
const eligible=result.filter(row=>row.candidates[0]?.autoEligible);
assert.equal(eligible.length,1,'Um gameId só pode ser autoassociado a um evento.');
const blocked=result.find(row=>row.candidates[0]&&!row.candidates[0].autoEligible);
assert.ok(blocked?.candidates[0].reasons.some(reason=>reason.includes('já foi reivindicado')),'A associação duplicada deve explicar o bloqueio.');
console.log('PASSOU: vínculo 365Scores exclusivo 1:1 entre agenda e gameId.');
