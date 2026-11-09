'use strict';

const assert = require('node:assert/strict');
const { matchAgendaEvents } = require('../365scores-service');

function game(id, home, away, date, competition = 'Brasileirão Série B') {
  return {
    gameId: id,
    startTime: `${date}T19:00:00-03:00`,
    status: 'Finished',
    category: 'men',
    home: { id: id * 10 + 1, name: home, score: 1 },
    away: { id: id * 10 + 2, name: away, score: 0 },
    competition: { id: 77, name: competition }
  };
}

// Reproduz a ordem de consulta [ontem, hoje, amanhã]: os primeiros registros
// são de datas vizinhas, enquanto o jogo procurado aparece depois do índice 500.
const manyGames = [];
for (let i = 0; i < 560; i++) manyGames.push(game(1000 + i, `Clube Anterior ${i}`, `Adversário Anterior ${i}`, '2026-11-06'));
for (let i = 0; i < 560; i++) manyGames.push(game(2000 + i, `Clube do Dia ${i}`, `Adversário do Dia ${i}`, '2026-11-07'));
const target = game(9001, 'Vila Nova', 'Criciúma', '2026-11-07');
manyGames.push(target);
for (let i = 0; i < 560; i++) manyGames.push(game(3000 + i, `Clube Seguinte ${i}`, `Adversário Seguinte ${i}`, '2026-11-08'));

const result = matchAgendaEvents([{
  id: 'rei-vila-nova-x-criciuma',
  home: 'Vila Nova', away: 'Criciúma', date: '2026-11-07',
  competition: 'Brasileirão Série B', time: '19:00'
}], manyGames)[0];

assert.equal(result.diagnostics.sourceGames, manyGames.length, 'Todos os 1.681 jogos devem ser analisados, sem corte nos primeiros 500.');
assert.equal(result.diagnostics.sameDateGames, 561, 'A contagem da data principal deve incluir os jogos além da posição 500.');
assert.equal(result.candidates.some(candidate => candidate.gameId === 9001), true, 'O jogo correto após o índice 500 deve aparecer como candidato.');
assert.equal(result.candidates[0].gameId, 9001, 'O candidato exato deve liderar a lista.');

// Quando nenhum nome se parece, o diagnóstico ainda deve mostrar os melhores
// jogos examinados, em vez de deixar bestGame vazio e esconder a amostra.
const noMatch = matchAgendaEvents([{
  id: 'sem-correspondencia', home: 'Time Azul', away: 'Time Verde',
  date: '2026-11-07', competition: 'Liga de Teste'
}], manyGames)[0];
assert.ok(noMatch.diagnostics.bestGame, 'bestGame deve mostrar a melhor linha analisada mesmo com pontuação zero.');
assert.equal(noMatch.diagnostics.bestGames.length, 3, 'O diagnóstico deve exibir os três melhores registros avaliados.');
assert.equal(noMatch.diagnostics.bestTeamScore, 0, 'Uma amostra sem semelhança deve continuar com pontuação zero.');

console.log('PASSOU: comparação acima de 500 jogos, fixture após o índice 500, contagem integral e diagnóstico dos três melhores registros.');
