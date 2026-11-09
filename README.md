# NicoValBolaLibre V0.19.3

## V0.19.3 · Diagnóstico e recuperação de candidatos 365Scores

- O comparador agora mostra sugestões de revisão quando pelo menos um dos clubes tem correspondência forte, mesmo que o segundo venha com nome regional ou extenso.
- Sugestões fracas são identificadas explicitamente, exibem a semelhança separada de mandante e visitante e nunca podem ser associadas automaticamente.
- O diagnóstico passa a mostrar o melhor par encontrado, com percentuais individuais e média, em vez de depender apenas da menor semelhança dos dois clubes.
- A busca diária informa quantos registros vieram da 365Scores, quantos foram normalizados e quantos perderam ID ou nomes dos clubes.
- Incluído o sufixo estadual ES na normalização de nomes de clubes.
- A associação automática continua restrita às correspondências exatas e inequívocas já exigidas pela versão anterior.

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
2. Faça commit `NicoValBolaLibre V0.19.3` e `Push origin`.
3. Crie e envie a tag `v0.19.3`.
4. Confira o GitHub Actions. Só considere a Release pronta quando o instalador `*-Setup.exe` e `latest.yml` estiverem anexados.

O ZIP contém código-fonte; o instalador não está incluído. A integração usa endpoints web não oficiais observados na versão pública do cliente 365Scores; não há API pública documentada ou garantia de disponibilidade, e a autorização para reutilização/redistribuição precisa ser confirmada. Os testes automatizados usam respostas simuladas e não executam consulta real à 365Scores. A associação automática é conservadora e salva vínculos somente no armazenamento local deste computador.

## Testes

- Nesta versão: 21 scripts de regressão aprovados; JavaScript embutido de `index.html`, `365scores-service.js` e `server.js` passaram na verificação de sintaxe.

- `npm run test:365scores`: adaptador 365Scores com respostas simuladas e cache, sem chamadas externas.
- `npm run test:365scores-agenda-match`: aliases, nomes curtos/oficiais, fuso local, virada de data, competição, horário, segurança de inversão e bloqueio de candidatas ambíguas.
- `npm run test:agenda-market`: filtro de emissoras brasileiras, argentinas, pan-regionais e desconhecidas.
- Os demais testes cobrem interface, agenda, escudos, sincronização e compatibilidade dos módulos legados.
- A bateria automatizada não substitui teste visual e consulta real em partida disponível na 365Scores.
