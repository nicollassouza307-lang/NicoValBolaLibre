# NicoValBolaLibre V0.20.1


## V0.20.1 · Correção de cobertura do comparador 365Scores

- Removido o corte arbitrário de 500 jogos na comparação da agenda. Todos os jogos normalizados recebidos na janela de três datas agora são avaliados.
- O diagnóstico `sourceGames` passa a refletir a quantidade integral de jogos realmente examinados.
- `bestGame` deixa de ficar vazio quando todas as semelhanças são zero; também são retornados os três melhores registros analisados (`bestGames`).
- Admin agora exibe os três melhores registros examinados quando uma partida fica sem candidato, facilitando descobrir se o jogo chegou ao comparador.
- Adicionado teste de regressão com mais de 1.600 jogos e o confronto correto depois da posição 500.

## V0.20.0 · BIG UPDATE inicial: associação, categorias, Livescore e diagnóstico de emissoras

- Busca de associação da agenda ampliada para o dia selecionado e os dias anterior/posterior, com deduplicação por gameId e cache local/compartilhado por data.
- Comparação passou a aproveitar IDs explicitamente identificados como IDs 365Scores, inclusive IDs guardados em vínculos confirmados anteriormente.
- Horário passou a ter peso menor e deixou de ser um bloqueio isolado para vínculo automático quando times, data e competição são inequívocos.
- Categorias feminina e de base são identificadas por metadados e nomes de competições; incompatibilidades bloqueiam associação automática e aparecem no diagnóstico.
- Dados normalizados da 365Scores descartam placares negativos e reconhecem relógios em minutos e intervalo quando esses campos vêm na resposta.
- Após uma associação confirmada, os cartões e a central da partida priorizam o horário de início da 365Scores, convertido para America/Sao_Paulo; a data original da agenda não é reescrita.
- Resumo do Livescore da 365Scores ficou mais limpo: status/minuto e eventos, sem placar duplicado, estádio, rodada, finalizações ou evento de fim de jogo. O placar permanece no cartão principal da agenda.
- Diagnóstico de Players permite criar uma emissora não cadastrada com nome e link HTTPS, evita duplicatas e salva a categoria Diversos; a categoria é preservada na sincronização.
- Escudos 365Scores já estavam integrados na V0.19.3 como fallback por ID do clube quando a agenda não fornece imagem; mantidos sem duplicar a implementação.
- Mantidas as fontes da agenda: Rei dos Canais, PelotaLibre e LA18HD. A API 365Scores não insere partidas na agenda.


# NicoValBolaLibre V0.19.2

## V0.19.2 · Correção de correspondências da 365Scores

- Corrigida a interpretação de datas/horários da 365Scores sem offset, usando America/Sao_Paulo em vez do fuso do servidor.
- Reconhecidos timestamps em segundos/milisegundos e datas no formato brasileiro durante a comparação.
- Melhorada a normalização de nomes curtos/oficiais, sufixos de clubes e abreviações comuns (ex.: Corinthians x Corinthians Paulista; Botafogo x Botafogo FR).
- A comparação agora considera jogos da data local e, apenas para revisão manual, partidas no dia vizinho quando os clubes e o horário indicam possível diferença de fuso.
- A associação automática continua bloqueada para nomes aproximados ou data vizinha.
- Quando não há candidato, o Admin mostra quantos jogos da 365Scores foram recebidos, quantos são da mesma data e qual foi a melhor semelhança encontrada, facilitando o diagnóstico.
- O comparador aceita aliases/sufixos oficiais de clubes, datas ISO locais sem offset e timestamps em segundos/milisegundos; a data vizinha só entra como sugestão manual se horário e clubes indicarem uma virada real da meia-noite.

# NicoValBolaLibre V0.19.1

## V0.19.1 · Migração esportiva para 365Scores, agenda compacta e filtro de emissoras

- 365Scores passa a ser a fonte esportiva principal da aplicação. A busca compara partidas já existentes na agenda usando data local, clubes, aliases, competição e horário.
- Correspondências automáticas são salvas localmente somente quando os clubes correspondem na ordem correta, a competição é compatível, o horário difere no máximo 45 minutos, a confiança é alta e não há candidata concorrente próxima. Casos invertidos ou ambíguos continuam manuais.
- Placar e status das partidas vinculadas passam a priorizar dados normalizados da 365Scores; a agenda original continua sendo a origem dos jogos e nunca recebe partidas novas da API.
- API-Football e football-data.org foram retiradas do fluxo ativo de placares, eventos, escalações e classificações. Seus módulos e rotas permanecem temporariamente no código para compatibilidade, mas estão pausados e não são expostos no Admin.
- TheSportsDB fica limitado ao fallback visual de escudos, sem fornecer dados esportivos.
- Cartões da agenda ficam compactos em uma lista vertical, com escudos menores, placar central, status e emissoras em espaço reduzido.
- O filtro Emissoras: Argentina/Brasil agora filtra também os canais após a consolidação das fontes, removendo canais exclusivos do outro mercado e preservando canais pan-regionais ou sem país identificado.
- O catálogo de canais do Rei preserva metadados de país para melhorar o filtro por mercado.

## V0.19.0 · Fundação do mega update

- Painel Admin reorganizado em sete abas: Geral, 365Scores, Partidas, Dados, Classificações, Cache e Diagnóstico.
- Agenda ganhou calendário horizontal de sete dias com navegação direta.
- Seções de competições podem ser recolhidas individualmente e o estado fica salvo localmente.
- Adicionado resumo de cache e diagnóstico rápido com opção de copiar relatório.
- Mantidas as fontes originais da agenda: Rei dos Canais, LA18HD e PelotaLibre.

## Como atualizar

1. Extraia o ZIP e copie o conteúdo da pasta `nvb_logo_fix` para a raiz do repositório, substituindo arquivos antigos e preservando `.git`.
2. Faça commit `NicoValBolaLibre V0.20.1` e `Push origin`.
3. Crie e envie a tag `v0.20.1`.
4. Confira o GitHub Actions. Só considere a Release pronta quando o instalador `*-Setup.exe` e `latest.yml` estiverem anexados.

O ZIP contém código-fonte; o instalador não está incluído. A integração usa endpoints web não oficiais observados na versão pública do cliente 365Scores; não há API pública documentada ou garantia de disponibilidade, e a autorização para reutilização/redistribuição precisa ser confirmada. Os testes automatizados usam respostas simuladas e não executam consulta real à 365Scores. A associação automática é conservadora e salva vínculos somente no armazenamento local deste computador.

## Testes

- Nesta versão: 24 scripts de regressão aprovados; JavaScript embutido de `index.html`, `365scores-service.js` e `server.js` passaram na verificação de sintaxe.

- `npm run test:365scores`: adaptador 365Scores com respostas simuladas e cache, sem chamadas externas.
- `npm run test:365scores-over-500`: garante comparação integral acima de 500 jogos e diagnóstico dos três melhores registros.
- `npm run test:365scores-agenda-match`: aliases, IDs, categorias, nomes curtos/oficiais, fuso local, datas vizinhas, competição, horário auxiliar e bloqueio de candidatas ambíguas.
- `npm run test:365scores-big-update-ui`: resumo do Livescore, minutos, placares seguros, horário 365Scores e escudos por ID.
- `npm run test:player-diagnostic`: criação de emissoras pelo diagnóstico de Players e categoria Diversos.
- `npm run test:agenda-market`: filtro de emissoras brasileiras, argentinas, pan-regionais e desconhecidas.
- Os demais testes cobrem interface, agenda, escudos, sincronização e compatibilidade dos módulos legados.
- A bateria automatizada não substitui teste visual e consulta real em partida disponível na 365Scores.
