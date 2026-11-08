# NicoValBolaLibre V0.18.7 — escalações, escudos e atualizações

Esta versão adiciona uma integração opcional com a API-Football. A agenda continua vindo exclusivamente do Rei dos Canais e PelotaLibre. A API-Football **não adiciona partidas**: ela só tenta enriquecer uma partida que o usuário já abriu na agenda e que corresponda por data, mandante e visitante.


Correção de publicação do atualizador na V0.18.3

A Release V0.18.1 foi publicada sem o instalador Windows e sem o manifesto `latest.yml`; por isso o botão Verificar atualizações retornava 404. A V0.18.3 verifica explicitamente se `dist/*-Setup.exe` e `dist/latest.yml` foram gerados e anexa ambos à Release com `softprops/action-gh-release`. Se algum deles faltar, o workflow falha em vez de marcar a Release como sucesso incompleto. O aplicativo também apresenta uma mensagem amigável quando encontra esse 404.

## O que esta versão entrega

- Painel Admin para salvar, testar e apagar a chave pessoal da API-Football.
- A chave é criptografada com `safeStorage` do Electron e guardada no perfil local do Windows (`userData/apifootball-key.bin`). Não vai para o instalador, GitHub, D1 nem computador do Val.
- Ao abrir uma partida, o botão **Buscar dados da API-Football** procura o fixture da mesma data, mandante e visitante. Correspondências ambíguas ou inexistentes são recusadas; a agenda original permanece intacta.
- Para o fixture identificado, a aplicação usa o endpoint combinado `/fixtures?id=...`, que pode trazer eventos, escalações, estatísticas de equipe e jogadores em uma única chamada, conforme a cobertura disponível. A tela exibe placar/status, gols e autores, assistências, substituições, resultado dos pênaltis, posse, finalizações, chutes no gol, escanteios, faltas, cartões, passes e escalações/reservas quando a API os disponibiliza.
- A classificação é carregada sob demanda por competição e temporada, com cache de 24 horas.
- As fotos dos jogadores são exibidas por meio dos IDs individuais fornecidos nas escalações da API-Football; quando uma foto não está disponível, o app usa as iniciais.
- Dados consultados no computador administrador podem ser publicados automaticamente para o Cloudflare usando a chave administrativa de sincronização já existente. O Val recebe os snapshots em modo somente leitura. A chave da API-Football não é compartilhada.
- Contador de chamadas persistente, limite interno de 70 requisições/dia, reserva de 30, limite local de 8 chamadas/minuto e cache em disco. As respostas de `/status` são usadas para testar a chave sem consumir a cota diária.
- Cache persistente para lista diária de fixtures (uma única chamada por data, sem parâmetro `page`), detalhes combinados, escalações, estatísticas e classificação. Consultas repetidas dentro da validade do cache não fazem nova chamada.

## Importante sobre a cota

O plano Free da API-Football tem uma cota diária e limite por minuto definidos pelo fornecedor. Esta aplicação aplica um teto local de 70 chamadas diárias e para antes de usar a reserva interna de 30. A cota do fornecedor pode ser compartilhada com outras aplicações que usem a mesma chave; por isso, o contador da aplicação não substitui a conferência dos cabeçalhos oficiais de rate limit.

A integração é **sob demanda**: abre-se a partida e clica-se para buscar. O app primeiro localiza os fixtures da data (cache de 15 minutos quando não há jogo ao vivo); depois usa `/fixtures?id=...` para obter placar/status mais recente e os blocos detalhados em uma única chamada. Assim, a primeira partida aberta costuma consumir até 2 chamadas; outras partidas da mesma data usam a lista já armazenada e consomem 1 chamada cada, e detalhes ainda dentro do cache não geram chamadas. A API também documenta `ids` para até 20 partidas em uma consulta quando o plano oferece suporte, mas esta primeira versão não depende desse recurso. O placar da agenda é preenchido com dados da fonte ou com snapshots da API-Football já consultados. Não há atualização automática contínua de todos os jogos nesta versão; o botão Atualizar força nova consulta e evita chamadas em excesso. O botão Atualizar força nova consulta; evite clicar repetidamente.

A disponibilidade varia por competição, temporada e partida. Escalações podem aparecer somente perto do início; estatísticas podem não existir antes da partida ou em certas ligas. A documentação publicada em 26/10/2026 informa que o plano Free limita as temporadas disponíveis a Year-4 até Year-2 (em 2026, 2022 a 2024). Portanto, não presuma que a temporada atual de 2026 esteja coberta; valide sua conta no teste real antes de depender desses dados. Quando a API não oferece os dados, o app informa a ausência e conserva os últimos dados armazenados.

## Cloudflare Worker (compartilhamento com o Val)

Na V0.18.7, o Worker passa a usar também a tabela `provider_cache` no D1. O script `cloudflare-sync/schema.sql` é idempotente: execute-o novamente para criar a tabela nova sem apagar `shared_config` nem os snapshots existentes.

1. Abra o Cloudflare Dashboard → **Workers & Pages** → `nicoval-sync` → **Edit code**.
2. Substitua o código do Worker pelo arquivo `cloudflare-sync/worker.js` deste projeto.
3. Clique em **Deploy**.
4. No Console do D1 `nicoval-db`, execute novamente o conteúdo de `cloudflare-sync/schema.sql` para criar `provider_cache`.
5. O binding D1 `DB` e as Secrets `SYNC_READ_TOKEN` e `SYNC_ADMIN_TOKEN` continuam iguais. Não crie novas Secrets.
6. Confirme `https://nicoval-sync.tracker-mps.workers.dev/health` e depois que a sincronização normal do app continua funcionando.

A atualização adiciona a rota protegida `POST /v1/sports-data`, que aceita apenas `SYNC_ADMIN_TOKEN`, e mantém os snapshots ao publicar o catálogo normal. Nenhuma chave API-Football é guardada no Worker.

## Passo B — obter e configurar sua chave API-Football

1. Crie/acesse sua conta em https://dashboard.api-football.com/ e copie a API Key do plano escolhido.
2. Instale a V0.18.7 no computador administrador (o seu).
3. Abra **Painel Admin → API-Football · Dados das partidas**.
4. Cole a chave em **API Key pessoal** e clique **Salvar chave neste computador**.
5. Clique **Testar conexão**. O teste consulta `/status`, que não reduz a cota diária.
6. Não configure a chave no computador do Val. Ele recebe os snapshots pelo Cloudflare.

Não crie um GitHub Secret para a API-Football. A única Secret de GitHub já usada no workflow continua sendo `NVB_SYNC_READ_TOKEN`, necessária para pré-configurar a sincronização de leitura do instalador.

## Passo C — testar uma partida

1. Carregue a agenda normal do dia.
2. Abra uma partida já encontrada pelo Rei dos Canais/PelotaLibre.
3. Na seção **API-Football**, clique em **Buscar dados da API-Football**.
4. Se a API tiver um fixture com a mesma data, mandante e visitante, o app mostra o placar, gols, assistências, substituições e resultado dos pênaltis, além de escalações/estatísticas quando cobertos.
5. Se estiver configurada a chave administrativa de sincronização Cloudflare neste computador, o snapshot (incluindo gols, assistências, substituições e placar dos pênaltis) é enviado para D1. O Val recebe automaticamente na próxima sincronização, desde que o Worker atualizado da V0.18.7 tenha sido publicado.
6. Para consultar a classificação, use **Buscar classificação** depois que os dados do fixture estiverem disponíveis.

Se o jogo não for encontrado ou houver mais de uma correspondência ambígua, o app não inventa um vínculo e não adiciona qualquer partida à agenda.

## Segurança e armazenamento

- API Key: criptografada com Electron `safeStorage` em `%APPDATA%\NicoValBolaLibre` (caminho efetivo fornecido pelo Electron `app.getPath('userData')`).
- Cache e contador: perfil local do Windows; no modo de desenvolvimento, `.nvb-data/` (ignorado pelo Git).
- O computador do Val não recebe a API Key; ele recebe somente snapshots esportivos publicados com a chave administrativa do serviço de sincronização.
- Não compartilhe prints que revelem chaves, tokens ou dados de conta.

## Testes automatizados

O workflow executa:

- `node scripts/test-navigation-guard.js`
- `node scripts/test-competition-ranking.js`
- `node scripts/test-team-logo-index.js`
- `node scripts/test-apifootball.js`
- `node scripts/test-cloudflare-sports-data.js`
- `node scripts/test-multi-api-engine.js`
- `node scripts/test-cloudflare-provider-cache.js`

Os testes da API-Football usam respostas simuladas. Eles verificam que a consulta de fixtures por data não envia o parâmetro `page`, cache, correspondência estrita, consumo, teto local, escalações/estatísticas e classificação; não substituem um teste real com a sua chave e as competições que aparecem na sua agenda.

## Publicar V0.18.7

1. Publique o Worker usando `cloudflare-sync/worker.js` desta versão.
2. Execute novamente `cloudflare-sync/schema.sql` no D1 para criar `provider_cache`; o script preserva as tabelas e os dados existentes.
3. Copie o conteúdo desta pasta para a raiz do repositório local, substituindo arquivos e preservando `.git`.
4. Confirme que `NVB_SYNC_READ_TOKEN` continua em **Settings → Secrets and variables → Actions**. Não adicione API-Football key nem `SYNC_ADMIN_TOKEN` ao GitHub.
5. Faça commit `NicoValBolaLibre V0.18.7` e `Push origin`.
6. Crie a tag `v0.18.7` nesse commit e faça outro `Push origin`.
7. Acompanhe o GitHub Actions e a Release `v0.18.7`.

## Limitações conhecidas desta primeira fase

- A integração estatística funciona sob demanda; livescore não se atualiza automaticamente em segundo plano nesta versão.
- Correspondências usam nome de mandante/visitante e data normalizados. Clubes com nomes muito diferentes entre as fontes podem não casar; isso é preferível a associar a partida errada.
- Algumas competições não fornecem lineups ou estatísticas detalhadas no plano/temporada consultados.
- A cota gratuita, cobertura e disponibilidade são controladas pela API-Football e podem mudar.


## V0.18.3 — Central da partida: escalações e estatísticas

- O painel de dados esportivos agora fica abaixo do player.
- Abas separadas para Escalações e Estatísticas, sem recarregar o iframe ao alternar.
- Escalações exibidas em um campo com mandante e visitante em lados opostos.
- Jogadores ordenados pela posição `grid` retornada pela API-Football; quando ausente, usa a posição informada.
- Fotos dos jogadores carregadas pela URL oficial de mídia da API-Football usando o ID do jogador (`media.api-sports.io/football/players/{id}.png`). O carregamento da imagem não faz uma chamada ao endpoint da API; pode não existir foto para todos os IDs.
- Avatar com iniciais quando a fotografia não estiver disponível, sem pesquisa textual de imagens ou risco de associar outro jogador.
- Comissão técnica e banco de reservas aparecem em cartões abaixo e fora do campo.
- Estatísticas exibidas em comparativos visuais entre os dois clubes.


A compilação V0.18.7 gera o instalador e `latest.yml` localmente; o workflow publica os arquivos uma única vez pela ação de Release.


## V0.18.6 — placar, lances e escalações aprimoradas

- Agenda: voltou a exibir o placar quando ele existe nos dados da agenda ou no snapshot da API-Football; partidas sem resultado continuam mostrando VS.
- Central da partida: mantém o placar principal e destaca também o resultado da disputa por pênaltis quando fornecido.
- Lances: exibe gols, autores, assistências, gols contra, pênaltis perdidos, cartões, eventos do VAR e substituições com minuto, jogador que saiu e jogador que entrou.
- Compartilhamento: snapshots agora preservam placares de intervalo, tempo normal, prorrogação e pênaltis, além dos eventos, para que o computador do Val receba os mesmos detalhes pelo Cloudflare.
- Escalações: jogadores maiores, nomes e números mais legíveis e posicionamento mais compacto, mantendo a assimetria de pontas e a orientação correta no celular.
- Compatibilidade: leitura dos objetos `player` aninhados no formato original da API-Football, tanto nos titulares quanto nos reservas.

A V0.18.6 não altera as fontes da agenda: Rei dos Canais/PelotaLibre continuam fornecendo as partidas. A API-Football segue como complemento de partidas existentes. A atualização continua sob demanda para preservar a cota da chave. Para compartilhar os novos eventos com o Val, publique também a versão atualizada de `cloudflare-sync/worker.js` no Worker existente.

## V0.18.7 — base do Multi-API Engine

- Novo registro unificado de provedores: API-Football ativa, football-data.org e TheSportsDB preparados para integração nas próximas etapas, e GitHub Logos como fallback de imagens.
- Cache local persistente e isolado por provedor, com expiração e importação de respostas já armazenadas na versão anterior.
- Uso da API-Football passa a aparecer no registro unificado de provedores; o controle atual de 70 chamadas/dia e reserva de 30 permanece preservado.
- Novo cache compartilhado no Cloudflare D1. O administrador publica entradas; o computador do Val pode lê-las com o token compartilhado. Nenhuma chave de API externa é gravada no Worker.
- A lista diária de fixtures, detalhes de cada partida e classificações podem ser reaproveitadas no cache compartilhado, evitando consultas repetidas entre computadores.
- O Painel Admin mostra o estado das integrações e a quantidade de entradas de cache locais.

### Migração Cloudflare necessária na V0.18.7

1. No Worker `nicoval-sync`, publique o arquivo `cloudflare-sync/worker.js` desta versão.
2. No banco D1 `nicoval-db`, execute novamente o arquivo `cloudflare-sync/schema.sql`. O script usa `CREATE TABLE IF NOT EXISTS`, preserva a tabela de configuração atual e cria a tabela adicional `provider_cache`.
3. Mantenha os secrets `SYNC_READ_TOKEN` e `SYNC_ADMIN_TOKEN` existentes. Não crie nem compartilhe chaves de API-Football no Worker.
4. Atualize o aplicativo nos dois computadores. O cache remoto é best-effort: se a migração ainda não tiver sido aplicada, a consulta local continua funcionando e o aplicativo segue usando o cache local.

As integrações football-data.org e TheSportsDB aparecem como próximas integrações no painel, mas ainda não realizam consultas externas nesta versão. Elas serão ativadas após validar suas coberturas, limites e termos oficiais. A agenda permanece exclusivamente Rei dos Canais/PelotaLibre.
