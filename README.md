# NicoValBolaLibre V0.17.1

Esta versão acrescenta o ícone provisório do mascote (gato com VR) ao executável/instalador Windows e prepara a conexão Cloudflare automaticamente no aplicativo desktop. O idioma e os favoritos continuam locais; o catálogo de emissoras, vínculos e escudos podem ser compartilhados.

## O que mudou na V0.17.1

- Ícone Windows do app, instalador, desinstalador, atalho e janela usando o favicon atual do gato com VR (`build/icon.ico`). Quando a imagem original em alta resolução estiver disponível, substitua `build/icon.ico` e gere uma nova versão.
- O instalador recebe o endereço do Worker e a chave de leitura somente durante o GitHub Actions build.
- O app configura e busca o catálogo compartilhado automaticamente ao iniciar. O usuário Val não precisa digitar URL nem token.
- A chave administrativa (`SYNC_ADMIN_TOKEN`) nunca é incluída no instalador. Ela permanece apenas no perfil local do administrador, preservada da instalação anterior quando o perfil Electron é mantido.
- A interface esconde os campos de conexão e publicação em computadores de leitura. Só aparece o botão de publicar se houver uma chave administrativa salva neste computador.
- O código de origem do Worker no projeto foi atualizado para exigir `SYNC_READ_TOKEN` na leitura e `SYNC_ADMIN_TOKEN` na publicação.
- GitHub Actions atualizado para actions/checkout@v7, actions/setup-node@v7 e Node.js 24.

## Antes de gerar a V0.17.1: cadastrar um Secret no GitHub

O repositório é público, então nunca coloque tokens diretamente em arquivos commitados.

1. Abra o repositório GitHub `NicoValBolaLibre`.
2. Vá em **Settings > Secrets and variables > Actions**.
3. Clique **New repository secret**.
4. Nome: `NVB_SYNC_READ_TOKEN`.
5. Valor: cole somente o valor gerado para `SYNC_READ_TOKEN` (sem o nome da variável e sem `=`).
6. Salve.

Esse token é somente de leitura. Como ele é incorporado ao aplicativo que será distribuído, alguém tecnicamente experiente poderá extraí-lo do instalador. Ele não pode publicar dados. A chave `SYNC_ADMIN_TOKEN` nunca deve ser adicionada ao GitHub nem ao instalador.

## Publicar a versão

1. Copie todos os arquivos deste projeto para o repositório local já conectado ao GitHub.
2. Faça commit e `Push origin`.
3. No GitHub Desktop, abra History e crie a tag `v0.17.1` no commit novo.
4. Faça `Push origin` para enviar a tag.
5. O GitHub Actions cria o instalador `NicoValBolaLibre-0.17.1-Setup.exe` e publica em Releases.

O workflow falhará com uma mensagem clara se o Secret `NVB_SYNC_READ_TOKEN` não estiver configurado. O valor do Secret não é impresso nos logs.

## O que acontece em cada computador

### Computador do Nico (administrador)

- A atualização V0.17.1 usa automaticamente a URL `https://nicoval-sync.tracker-mps.workers.dev` e a chave de leitura incorporada.
- O `SYNC_ADMIN_TOKEN` salvo na configuração local da V0.17.0 deve permanecer no mesmo perfil Electron e permite publicar dados.
- Feche o app antes de instalar a atualização; não desinstale limpando os dados do aplicativo.
- Após atualizar, abra o Painel Admin e use **Publicar meus dados para todos** se tiver feito alterações locais que ainda não foram enviadas.

### Computador do Val

- Instale o mesmo `NicoValBolaLibre-0.17.1-Setup.exe`.
- Ao abrir, o endereço e a chave de leitura já estarão configurados e o app buscará os dados automaticamente.
- Não precisa preencher tokens ou endereço.
- O computador do Val fica em modo de leitura e não verá o botão de publicação.

## Cloudflare já implantado

O Worker é `nicoval-sync`, o banco D1 é `nicoval-db` e o binding é `DB`. O Worker deve ter duas Secrets no ambiente Production:

- `SYNC_READ_TOKEN`: igual ao valor usado como Secret `NVB_SYNC_READ_TOKEN` no GitHub.
- `SYNC_ADMIN_TOKEN`: chave administrativa mantida somente no Cloudflare e no perfil local do administrador.

Rotas:
- `GET /health`: diagnóstico público; não expõe dados.
- `GET /v1/config`: exige `Authorization: Bearer <SYNC_READ_TOKEN>`.
- `POST /v1/publish`: exige `Authorization: Bearer <SYNC_ADMIN_TOKEN>`.

URL do Worker: `https://nicoval-sync.tracker-mps.workers.dev`.

## Segurança e limites

O token de leitura precisa estar dentro do app para o Val não digitar nada; portanto, trate-o como uma credencial pública de leitura, não como senha secreta. Ele permite apenas ler a configuração compartilhada. Não coloque a chave administrativa no GitHub, no instalador ou no computador do Val. Se o token de leitura for exposto além do esperado, gere outro e atualize a Secret no Cloudflare e no GitHub, depois publique nova versão.

Cloudflare Workers e D1 estão no plano gratuito dentro das cotas publicadas. Se os limites gratuitos forem atingidos, as operações podem falhar até a renovação; não há upgrade pago automático.

## Estrutura importante

- `index.html`: interface e lógica da agenda.
- `server.js`: servidor local e integração Cloudflare.
- `electron/main.js`: aplicativo desktop, janela, ícone e atualizador.
- `electron/preload.js`: ponte segura entre interface e Electron.
- `build/icon.ico`: ícone provisório gerado do favicon atual.
- `build/cloud-sync-defaults.json`: valores de exemplo sem token; o workflow injeta o token durante o build.
- `scripts/write-cloud-sync-defaults.js`: valida e escreve a configuração de leitura no runner do GitHub Actions.
- `cloudflare-sync/worker.js`: código-fonte da API Cloudflare com leitura/publicação autenticadas.
- `.github/workflows/release.yml`: build e publicação do instalador Windows.
