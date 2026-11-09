# NicoValBolaLibre V0.18.17

## V0.18.17 · 365Scores na central da partida

- Mantido o adaptador `365scores-service.js` para os endpoints web observados em documentação comunitária.
- A central da partida agora pode usar um vínculo `gameId` confirmado manualmente no Admin → 365Scores para carregar dados complementares.
- Adicionado painel 365Scores na página individual da partida, com abas Livescore, Escalações, Estatísticas e Classificação.
- Escalações da 365Scores são convertidas para o campo tático existente; fotos aceitam a CDN `imagecache.365scores.com` com validação de host HTTPS.
- Eventos e finalizações são normalizados para exibição. Estatísticas individuais de `lineups.members[].stats[]` são lidas e agregadas para os tipos conhecidos; quando a fonte não envia estatísticas, a interface informa indisponibilidade em vez de inventar valores.
- `roundNum` e `stageNum` passam a ser usados como fallback quando `roundName` não está preenchido; status 4 da escalação é tratado como técnico.
- Cache local persistente para detalhes e classificações da 365Scores. A consulta continua sob demanda; vínculos e caches permanecem locais, enquanto o endpoint pode usar o cache compartilhado configurado.
- A agenda não é alterada nem recebe jogos novos. A API-Football permanece intacta como fonte atual/fallback; nenhuma migração automática foi feita.
- Integração experimental: os endpoints são interfaces web não oficiais, não há documentação pública de desenvolvedor identificada e a autorização de reutilização de dados/imagens ainda precisa ser confirmada com a 365Scores.

## Versão anterior · Prioridade e contraste dos escudos

- Clubes: GitHub Football Logos é a primeira fonte. Se um logo GitHub falhar ao carregar, o app consulta a TheSportsDB antes de tentar as demais imagens de reserva (API-Football/FootyLogos).
- Juventus: preferência especial pela imagem da TheSportsDB. O registro oficial `133676` é consultado diretamente e validado pelo país e pelo ID API-Football (`496`); se a imagem falhar, o SVG GitHub continua como alternativa.
- SVGs do GitHub ficam em placa azul-marinho `#0c1b27` com borda `#182436`; escudos brancos deixam de sumir no fundo branco.
- PNGs/raster da TheSportsDB/API-Football e logos de competições continuam em placa branca. Nenhum cartão, painel, player, aba ou área inferior da partida recebe mudança de fundo.
- Competições: TheSportsDB é consultada em segundo plano e tem prioridade quando encontra uma liga com nome/país compatíveis. A imagem original da agenda/API-Football continua como fallback. Os resultados ficam no cache local/Cloudflare.

## Como atualizar

1. Extraia o ZIP e copie todo o conteúdo para a raiz do repositório local, substituindo os arquivos antigos e preservando `.git`.
2. Faça commit `NicoValBolaLibre V0.18.17` e `Push origin`.
3. Crie e envie a tag `v0.18.17`.
4. Confira o GitHub Actions. Só considere a Release pronta quando o instalador `*-Setup.exe` e `latest.yml` estiverem anexados.

O ZIP contém código-fonte; o instalador não está incluído. A integração 365Scores ainda não substitui nenhum provedor atual.

## Testes

- `npm run test:365scores`: respostas simuladas para catálogo, consulta diária, detalhes de partida, escalações e cache. Não faz chamadas externas.
- `npm run test:multi-api`: cache persistente e registro de provedores.
- Os demais testes cobrem as integrações anteriores, interface de partidas, agenda, logos e sincronização.
- O usuário validou consultas reais da 365Scores nas versões anteriores, incluindo listagem diária e escalações de Crystal Palace x Liverpool (gameId 4742009), com 21 eventos e 39 finalizações. O parser de estatísticas e a nova central integrada usam testes simulados; confirme o painel com uma partida que tenha vínculo manual salvo no Admin → 365Scores.
