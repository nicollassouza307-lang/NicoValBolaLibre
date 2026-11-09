# NicoValBolaLibre V0.18.16

## V0.18.16 · Adaptador experimental da 365Scores

- Adicionado `365scores-service.js`, isolando chamadas aos endpoints web observados em documentação comunitária.
- Adicionada consulta manual de catálogo, descoberta de partidas por data (`/web/games/allscores/`) e leitura de detalhes por `gameId` (`/web/game/`).
- O painel Admin exibe partidas retornadas e permite testar escalações, formação, membros, eventos, metadados e estatísticas disponíveis.
- Adicionados adaptadores de classificação (`/web/standings/`), chaveamento (`/web/brackets/`) e estatísticas da competição (`/web/stats/`) para testes posteriores.
- Cache local persistente e compartilhamento por Cloudflare para descoberta diária e detalhes de partidas.
- Limite de segurança local do protótipo: 12 requisições por minuto e 200 por dia. Esses valores são limites internos conservadores, não limites oficiais da 365Scores.
- Nenhuma consulta é executada automaticamente; nenhuma partida é inserida ou alterada na agenda; a API-Football continua intacta.
- Novo comparador manual entre a agenda carregada e partidas 365Scores por times, data, horário e competição. Sugestões exigem confirmação; vínculos de `gameId` ficam salvos localmente e não são publicados automaticamente na nuvem.
- A integração permanece experimental porque os endpoints são interfaces web não oficiais, não existe documentação pública de desenvolvedor identificada e a autorização de reutilização dos dados/imagens ainda precisa ser confirmada com a 365Scores.

## Versão anterior · Prioridade e contraste dos escudos

- Clubes: GitHub Football Logos é a primeira fonte. Se um logo GitHub falhar ao carregar, o app consulta a TheSportsDB antes de tentar as demais imagens de reserva (API-Football/FootyLogos).
- Juventus: preferência especial pela imagem da TheSportsDB. O registro oficial `133676` é consultado diretamente e validado pelo país e pelo ID API-Football (`496`); se a imagem falhar, o SVG GitHub continua como alternativa.
- SVGs do GitHub ficam em placa azul-marinho `#0c1b27` com borda `#182436`; escudos brancos deixam de sumir no fundo branco.
- PNGs/raster da TheSportsDB/API-Football e logos de competições continuam em placa branca. Nenhum cartão, painel, player, aba ou área inferior da partida recebe mudança de fundo.
- Competições: TheSportsDB é consultada em segundo plano e tem prioridade quando encontra uma liga com nome/país compatíveis. A imagem original da agenda/API-Football continua como fallback. Os resultados ficam no cache local/Cloudflare.

## Como atualizar

1. Extraia o ZIP e copie todo o conteúdo para a raiz do repositório local, substituindo os arquivos antigos e preservando `.git`.
2. Faça commit `NicoValBolaLibre V0.18.16` e `Push origin`.
3. Crie e envie a tag `v0.18.16`.
4. Confira o GitHub Actions. Só considere a Release pronta quando o instalador `*-Setup.exe` e `latest.yml` estiverem anexados.

O ZIP contém código-fonte; o instalador não está incluído. A integração 365Scores ainda não substitui nenhum provedor atual.

## Testes

- `npm run test:365scores`: respostas simuladas para catálogo, consulta diária, detalhes de partida, escalações e cache. Não faz chamadas externas.
- `npm run test:multi-api`: cache persistente e registro de provedores.
- Os demais testes cobrem as integrações anteriores, interface de partidas, agenda, logos e sincronização.
- A chamada real à 365Scores foi validada pelo usuário na V0.18.15 para listagem diária e detalhes de uma partida. A nova correspondência com a agenda usa testes simulados; faça o teste manual no Painel Admin após iniciar o aplicativo.
