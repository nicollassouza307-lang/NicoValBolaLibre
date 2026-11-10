## V0.22.4 · Correção de posições e banco de reservas
- Posições táticas específicas da escalação passam a ter prioridade sobre metadados globais contraditórios do atleta.
- Pontas e zagueiros são reposicionados conforme suas siglas táticas quando o grid da fonte vier invertido.
- Banco de reservas reorganizado em duas colunas (foto e informações), com melhor leitura em telas estreitas.

## V0.22.3 · Escalações FotMob-style, notas e disputa de pênaltis

- Campo e escalações centralizados, retratos circulares, nomes e números mais próximos e melhor distribuição dos atletas. Quando a grade da fonte contradiz claramente a função do jogador, a profundidade é reconstruída pela posição e pela formação, sem trocar os jogadores.
- Marcadores de gols, gols contra, assistências, cartões e substituições padronizados em círculos com fundo `#132638`, incluindo os eventos dos reservas.
- Notas sobre as fotos dos titulares, no centro inferior, sem invadir o nome; cores variam conforme a faixa da nota. A estimativa considera as estatísticas individuais recebidas, os eventos, a função e os minutos, com pesos e limites para evitar que uma métrica isolada domine a nota. Percentuais ausentes não geram penalidade artificial.
- xGOT reconhece também o rótulo completo “Gols esperados em chutes no alvo”.
- Disputa de pênaltis separada dos eventos de jogo, com divisória e placar próprio. Cobranças não são contadas como gols normais nem alimentam as notas dos atletas. O placar da decisão aparece abaixo do resultado na agenda e na central da partida quando a fonte fornece os dados.
- Removidos os limites locais artificiais de 200 chamadas/dia e 12/min para 365Scores. Cache, fila e espaçamento entre chamadas continuam ativos. HTTP 429 gera pausa progressiva e respeita `Retry-After`; HTTP 403 pausa consultas e orienta a não contornar a recusa.
- Mantidos os intervalos de atualização moderados, os vínculos existentes da agenda e todas as fontes de agenda. 365Scores continua enriquecendo partidas já existentes, sem inserir jogos.


## V0.22.2 · Redução do consumo de consultas 365Scores

- Polling da partida aberta reduzido para 90 segundos e passa a respeitar o cache do servidor.
- Atualização de partidas ao vivo na agenda reduzida para um jogo por ciclo de 120 segundos; suspensa enquanto uma partida está aberta.
- Cache de detalhes da partida ampliado para 90 segundos e cache da classificação para 10 minutos.
- Busca sem correspondência é lembrada por partida por até 6 horas, evitando repetir três consultas de datas ao reabrir o mesmo jogo; o botão de nova tentativa manual continua disponível.
- Painel Admin exibe chamadas locais usadas/restantes e informa que o contador reinicia à meia-noite UTC.
- O teto de 200 chamadas/dia e o teto de 12/min continuam sendo limites de proteção do aplicativo, não limites oficiais publicados pela 365Scores.

## V0.22.1 · Correções de escalação, eventos e dados individuais

- Separação de goleiro e zaga na formação, com profundidades progressivas ajustadas à referência.
- Eventos de atletas vinculados por ID ou nome; resolução ampliada de jogadores nas substituições.
- Normalização de rodada numérica e distinção entre rodada e fase eliminatória.
- Notas individuais com mais métricas ofensivas, de criação, passe, defesa, duelos e goleiros, usando percentuais e dados completos disponíveis.
- Cores neutras nos nomes dos times em estatísticas.
- Busca e carregamento 365Scores automáticos ao abrir cada partida, com loading localizado e associação conservadora.

# Changelog NicoValBolaLibre

## V0.22.0 · Mega atualização

- Restaura eventos individuais nas escalações e calcula notas de 0 a 10 usando rating oficial ou estimativa baseada em eventos e estatísticas por posição.
- Reestrutura o posicionamento tático com prioridade para coordenadas válidas e fallback pela formação/posições; aproxima as linhas e mantém o goleiro e os demais jogadores bem distribuídos no campo.
- Simplifica o campo e as escalações, oculta treinador sem nome e compara as estatísticas com cor clara para o valor maior, escura para o menor e neutra para empate/ausência.
- Corrige o Livescore: minuto, escudo do time, PNG personalizado, assistência em gols, jogador que entra/sai e remoção de texto repetido em cartões.
- Automatiza a associação 365Scores após carregar a agenda, preservando vínculos manuais, alta confiança, exclusividade 1:1 e revisão de casos ambíguos.
- Atualiza os relógios dos jogos ao vivo também na agenda em lotes de até quatro jogos por ciclo de 30 segundos; 30s é o intervalo de cache/consulta interno, não um mínimo oficial declarado pela 365Scores. O player/iframe não é reconstruído.
- Atualiza a classificação junto aos dados da partida, com cache de 3 minutos, UI compacta e destaque das posições dos clubes.
- Retira o bloco separado “Onde Assistir” do detalhe da partida, mantendo as emissoras nos cartões da agenda.

# Changelog

## V0.21.1 · Correções do campo e Match Center

- Placas das logos de competições em #101d30, mantendo a transparência/fundo sem placa branca dos escudos de clubes e seleções.
- Atribuição dos eventos da 365Scores ao time correto e eventos de substituição refletidos nos jogadores que saem e entram, titulares ou reservas.
- Titulares e reservas maiores, goleiros posicionados dentro da pequena área, camisa ao lado do nome e nota separada.
- Símbolos de gols/assistências em badges retangulares com contagem; PNGs opcionais configuráveis no Admin.
- Estatísticas em coluna única com as cores de cada equipe.
- Data por extenso, horário, estádio/capacidade, rodada, árbitro e emissoras em blocos separados.
- Melhor extração do nome/foto do técnico quando a resposta da 365Scores contém esses dados.

## V0.21.0 · Mega atualização

- Livescore 365Scores com polling silencioso de 30 segundos, sem reconstruir o iframe do player.
- Exclusividade 1:1 nas associações automáticas de gameId.
- Campo 16:9 minimalista, eventos ao redor dos jogadores, notas quando fornecidas e reservas compactas.
- Metadados de estádio, árbitros, público, emissoras e rodada.
- Estatísticas de equipe e jogadores ampliadas e reorganizadas.
- Escudos 365Scores com fallback GitHub; TheSportsDB fora do fluxo visual ativo.
- Escudos nas tabelas, eventos com identificação do time e melhorias no espanhol argentino.
- Port para iPhone deliberadamente adiado.

## V0.20.1

- Remoção do limite de 500 jogos na comparação 365Scores e diagnóstico dos três melhores registros.


## V0.22.4
- Corrige prioridade das posições específicas da escalação sobre metadados globais contraditórios da ficha do atleta.
- Reforça a reconstrução das linhas para impedir pontas no setor defensivo e zagueiros no ataque quando a fonte fornece códigos táticos válidos.
- Reorganiza o banco em duas colunas reais (foto + informações), com uma coluna por equipe em telas estreitas para evitar texto espremido.
