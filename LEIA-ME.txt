# NicoValBolaLibre V0.19.0

## V0.18.19 · Correção de gols contra na linha do tempo

- Eventos com código numérico genérico de gol (`typeId=1`) agora verificam também indicadores explícitos de gol contra, incluindo flags booleanas e descrições/subtipos em inglês, português e espanhol.
- A identificação específica de gol contra tem prioridade sobre o rótulo genérico `Gol`, sem alterar a classificação dos gols normais.
- Incluídos testes de regressão para gol contra identificado por texto e por flag, além da preservação de gols normais.

## V0.18.19 · Eventos mais robustos e classificação vinculada à temporada

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

## V0.18.20 · Correção do campo tático e estatísticas coletivas

- As posições curtas retornadas pela 365Scores (`GK`, `CB`, `CM`, `ST` e equivalentes) agora são normalizadas para goleiro, defesa, meio e ataque. Isso evita que jogadores sem coordenadas táticas válidas sejam agrupados na mesma linha do campo.
- Coordenadas brutas só são usadas como grade quando estão dentro de uma faixa tática plausível; caso contrário, o campo usa a posição do atleta como fallback.
- O total de finalizações é agregado a partir dos eventos do gráfico da 365Scores por equipe e passa a aparecer no comparativo coletivo, sem depender de estatísticas individuais.
- Os demais dados, eventos, vínculos manuais e agenda original permanecem preservados.

## Como atualizar

1. Extraia o ZIP e copie todo o conteúdo para a raiz do repositório local, substituindo os arquivos antigos e preservando `.git`.
2. Faça commit `NicoValBolaLibre V0.19.0` e `Push origin`.
3. Crie e envie a tag `v0.19.0`.
4. Confira o GitHub Actions. Só considere a Release pronta quando o instalador `*-Setup.exe` e `latest.yml` estiverem anexados.

O ZIP contém código-fonte; o instalador não está incluído. A integração 365Scores continua em migração; esta etapa ainda preserva os fluxos esportivos antigos para evitar regressões até a substituição completa e validada. Os testes automatizados usam respostas simuladas; confirme o campo e as finalizações em uma partida real após a instalação.

## Testes

- `npm run test:365scores`: respostas simuladas para consulta diária, detalhes, escalações, identificação de eventos com formatos alternativos e cache. Não faz chamadas externas.
- `npm run test:365scores-agenda-match`: comparação por clubes/data/competição/horário e confirmação manual.
- Os demais testes cobrem integrações anteriores, interface, agenda, logos e sincronização.
- Testes automatizados não substituem a validação real de uma partida na interface. Após instalar, atualize os dados da partida e confira os eventos e a classificação da temporada correspondente.

## V0.19.0

- Painel Admin reorganizado em sete abas: Geral, 365Scores, Partidas, Dados, Classificações, Cache e Diagnóstico.
- Agenda ganhou calendário horizontal de sete dias com navegação direta.
- Seções de competições agora podem ser recolhidas individualmente; o estado fica salvo localmente.
- Painel 365Scores atualizado para refletir a função de enriquecer partidas já existentes, sem inserir jogos na agenda.
- Adicionado resumo de cache e diagnóstico rápido com opção de copiar relatório.
- Mantidas as fontes originais da agenda: Rei dos Canais, LA18HD e PelotaLibre.

Esta versão é a primeira etapa do mega update. A migração completa do Match Center para a 365Scores e a retirada dos fluxos esportivos antigos ainda precisam ser concluídas e testadas em etapas seguintes.
