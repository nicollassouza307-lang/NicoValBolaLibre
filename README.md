# NicoValBolaLibre V0.18.18

## V0.18.18 · Eventos mais robustos e classificação vinculada à temporada

- O normalizador de eventos da 365Scores aceita variações comuns de formato/capitalização (`typeId`, `TypeId`, `eventTypeId`, `type.id`, `Type`, `Player`, `GTD`, `Comp` e campos equivalentes), além de nomes de evento em português/inglês.
- A linha do tempo reconhece também gol contra, pênalti perdido, VAR, intervalo e fim de jogo; códigos desconhecidos são preservados como `Evento (tipo N)` em vez de esconder o código recebido.
- O parser mantém o nome dos envolvidos, equipe, minuto, jogador secundário e placar quando esses campos existem na resposta.
- A competição agora mantém `seasonNum` e `stageNum` recebidos junto à partida. A consulta de classificação envia esses parâmetros, e o cache passa a separar competição, temporada e fase para evitar misturar tabelas de temporadas diferentes.
- Mantida a compatibilidade de leitura com classificações antigas em cache. A agenda não recebe jogos novos, o vínculo continua manual e a API-Football permanece inalterada.

## Versão anterior · 365Scores na central da partida

- Painel 365Scores na página individual da partida, com abas Livescore, Escalações, Estatísticas e Classificação.
- Escalações convertidas para o campo tático existente, com fotos da CDN da 365Scores quando disponíveis.
- Estatísticas individuais e agregadas normalizadas a partir dos dados recebidos.
- Consulta sob demanda e cache local/compartilhado; a agenda original permanece intacta.
- Integração experimental com endpoints web não oficiais. A permissão de reutilização de dados/imagens ainda precisa ser confirmada com a 365Scores.

## Como atualizar

1. Extraia o ZIP e copie todo o conteúdo para a raiz do repositório local, substituindo os arquivos antigos e preservando `.git`.
2. Faça commit `NicoValBolaLibre V0.18.18` e `Push origin`.
3. Crie e envie a tag `v0.18.18`.
4. Confira o GitHub Actions. Só considere a Release pronta quando o instalador `*-Setup.exe` e `latest.yml` estiverem anexados.

O ZIP contém código-fonte; o instalador não está incluído. A integração 365Scores não substitui nenhum provedor atual.

## Testes

- `npm run test:365scores`: respostas simuladas para consulta diária, detalhes, escalações, identificação de eventos com formatos alternativos e cache. Não faz chamadas externas.
- `npm run test:365scores-agenda-match`: comparação por clubes/data/competição/horário e confirmação manual.
- Os demais testes cobrem integrações anteriores, interface, agenda, logos e sincronização.
- Testes automatizados não substituem a validação real de uma partida na interface. Após instalar, atualize os dados da partida e confira os eventos e a classificação da temporada correspondente.
