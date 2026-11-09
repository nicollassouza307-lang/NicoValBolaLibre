# NicoValBolaLibre V0.18.9 — integração football-data.org

A V0.18.9 transforma o token já configurado na V0.18.8 em uma integração utilizável. O football-data.org agora pode complementar placares/calendários das partidas já carregadas e fornecer classificações das ligas autorizadas pela conta.

## O que mudou na V0.18.9

- Painel Admin ganhou **Buscar dados para a agenda carregada**. A consulta busca partidas do football-data.org para uma janela curta em torno da data selecionada e tenta associá-las aos jogos da agenda.
- A associação exige data local, mandante e visitante na ordem correta. Nomes são normalizados para tratar diferenças usuais como `FC`/abreviações, mas não há correspondência aproximada arriscada.
- Apenas eventos já existentes no Rei dos Canais/PelotaLibre podem receber dados. O provedor nunca adiciona partidas à agenda.
- O placar do football-data.org funciona como fallback: dados da API-Football e placar da agenda original têm prioridade.
- O painel também carrega as competições permitidas pela conta e permite consultar a classificação de competições do tipo `LEAGUE`.
- Resultados, competições e classificações usam cache local persistente e o cache compartilhado `provider_cache` do Cloudflare quando ele está configurado.
- A chave continua criptografada com Electron `safeStorage` no perfil local do Windows. A chave nunca é enviada ao navegador, ao GitHub ou ao Cloudflare.
- O aplicativo exibe a atribuição exigida: **Football data provided by the Football-Data.org API**.

## Como usar

1. Instale a V0.18.9 no computador administrador e mantenha o token já salvo na V0.18.8. Não é necessário cadastrá-lo novamente.
2. Carregue a agenda normal para a data desejada.
3. Abra **Painel Admin → football-data.org · Resultados e competições**.
4. Clique **Buscar dados para a agenda carregada**. O aplicativo só associa partidas que já existem na agenda e que correspondam por data e equipes.
5. Para consultar uma tabela, clique **Carregar competições disponíveis**, selecione uma liga no menu e clique **Buscar classificação**.
6. Os resultados associados aparecem como fallback de placar nos cards e como fonte complementar na central da partida.

O botão de buscar dados consulta a data da agenda selecionada, não toda a temporada. Para obter classificações, a competição precisa estar liberada na conta e ser do tipo liga. Copas e playoffs não têm tabela de liga neste fluxo.

## Cobertura e limites do plano gratuito

O plano Free anuncia 12 competições, placares e calendários atrasados, tabelas de classificação e limite de 10 chamadas por minuto. A lista efetivamente liberada é carregada da sua conta; não é presumida pelo aplicativo. A consulta de partidas usa uma janela de datas em UTC para cobrir o fuso do Brasil e depois compara a data local.

Esta API não substitui a API-Football para escalações, substituições, assistências detalhadas ou estatísticas avançadas no plano gratuito. Não exibimos escudos nem fotos fornecidos pelo football-data.org: os termos do serviço exigem que o usuário tenha direitos/consentimento para usar essas imagens. A integração desta versão utiliza dados textuais de partidas e classificações.

Fontes oficiais:
- Cobertura: https://www.football-data.org/coverage
- Planos: https://www.football-data.org/pricing
- Documentação v4: https://docs.football-data.org/general/v4/index.html
- FAQ/atribuição: https://www.football-data.org/documentation/faq

## Cache compartilhado com o Val

O app utiliza a tabela `provider_cache` criada na V0.18.7. Se o Worker `nicoval-sync` já está atualizado e o D1 recebeu `cloudflare-sync/schema.sql` da V0.18.7 ou posterior, **não é necessária uma nova migração**.

- O computador administrador consulta o provedor com seu token local e publica respostas em cache com `SYNC_ADMIN_TOKEN`.
- O computador do Val pode ler as respostas ainda válidas com `SYNC_READ_TOKEN`, sem receber a chave pessoal da API.
- Cache de partidas: 30 minutos; competições: 12 horas; classificações: 6 horas.
- Quando o cache compartilhado expira, o administrador pode consultar novamente. O computador do Val, sem token pessoal, precisa esperar a nova publicação.
- Se o Cloudflare não estiver configurado, os dados continuam funcionando no cache local deste computador.

## Segurança

- Não coloque o token do football-data.org em `.env`, GitHub Secrets, no repositório, no Worker ou no instalador.
- O token permanece em `userData/football-data-token.bin`, protegido pelo Electron `safeStorage` do Windows.
- A chave da API não é sincronizada para o Val. Apenas respostas esportivas normalizadas e sem credenciais entram no cache compartilhado.

## Testes automatizados

O workflow executa, entre outros:

- `node scripts/test-football-data-service.js`
- `node scripts/test-football-data-ui.js`
- `node scripts/test-cloudflare-provider-cache.js`
- `node scripts/test-multi-api-engine.js`
- `node scripts/test-release-assets.js`

Os testes usam respostas simuladas e verificam autenticação, cache, limite por minuto, normalização, cruzamento exato de partidas, classificações, cobertura de copas, fallback de placar, atribuição e segurança de credenciais. Eles não substituem um teste real com o token e as competições da conta.

## Publicar V0.18.9

1. Copie todo o conteúdo desta pasta para a raiz do repositório local, substituindo os arquivos antigos e preservando a pasta `.git`.
2. Mantenha o segredo existente `NVB_SYNC_READ_TOKEN` em **Settings → Secrets and variables → Actions**. Não adicione o token football-data.org nem `SYNC_ADMIN_TOKEN` ao GitHub.
3. Faça commit `NicoValBolaLibre V0.18.9` e `Push origin`.
4. Crie a tag `v0.18.9` nesse commit e envie a tag com outro `Push origin`.
5. Acompanhe o GitHub Actions. A Release só deve ser considerada pronta se o instalador `*-Setup.exe` e `latest.yml` forem publicados.

A agenda continua vindo exclusivamente do Rei dos Canais/PelotaLibre. API-Football e football-data.org são fontes complementares e não adicionam jogos.
