# NicoValBolaLibre V0.17.2

A V0.17.2 adiciona proteção de navegação ao aplicativo Windows: pop-ups/janelas abertas por players são bloqueados e a janela principal não pode ser redirecionada para sites externos. A navegação normal dos iframes dos players permanece permitida para preservar os embeds e os fluxos de vídeo.

## O que mudou na V0.17.2

- Bloqueia `window.open`, novas janelas e abas iniciadas por páginas de players/terceiros.
- Bloqueia navegação e redirecionamentos externos que tentem substituir a janela principal do aplicativo.
- Links externos clicados na interface principal continuam abrindo no navegador padrão.
- Não bloqueia navegações dentro dos iframes dos players, CDNs ou destinos de vídeo, reduzindo o risco de quebrar a reprodução.
- Inclui testes automatizados dos cenários de pop-up, navegação externa, link da interface e redirect dentro de iframe.
- Mantém o ícone do gato com VR, conexão automática ao Cloudflare, atualização via GitHub Releases e sincronização já existentes na V0.17.1.

### Limitação importante sobre anúncios dentro do player

Esta proteção bloqueia janelas/abas e redirecionamentos da janela principal. Ela não remove banners ou caixas de anúncio que já estejam desenhados dentro do próprio iframe do provedor (por exemplo, um retângulo com texto aleatório e botão X). Esses elementos pertencem à página externa do player; escondê-los de forma genérica pode ocultar controles ou partes do vídeo. Para filtrar esse tipo específico, é necessário identificar o provedor/elemento e testar uma regra direcionada.

## Publicar a V0.17.2

1. Copie todos os arquivos deste projeto para o repositório local já conectado ao GitHub, substituindo os arquivos antigos e preservando a pasta `.git`.
2. Confirme que o Secret `NVB_SYNC_READ_TOKEN` continua cadastrado em **Settings > Secrets and variables > Actions**. Não cadastre `SYNC_ADMIN_TOKEN`.
3. Faça commit e `Push origin`.
4. No GitHub Desktop, abra **History** e crie a tag `v0.17.2` no commit novo.
5. Faça `Push origin` para enviar a tag.
6. O GitHub Actions executará primeiro `scripts/test-navigation-guard.js` e depois compilará/publicará `NicoValBolaLibre-0.17.2-Setup.exe` em Releases.

## O que acontece em cada computador

### Computador do Nico (administrador)

- A URL do Worker e a chave de leitura são incorporadas ao instalador pelo GitHub Actions, usando o Secret `NVB_SYNC_READ_TOKEN`.
- A chave administrativa (`SYNC_ADMIN_TOKEN`) não é incluída no instalador e permanece no perfil local do administrador.
- Feche o aplicativo antes de instalar a atualização. Não desinstale limpando os dados do aplicativo.

### Computador do Val

- Instale o mesmo `NicoValBolaLibre-0.17.2-Setup.exe`.
- A URL e a chave de leitura já vêm pré-configuradas; não é necessário preencher tokens ou importar JSON para receber o catálogo compartilhado.
- O computador do Val permanece em modo de leitura e não recebe a chave administrativa.

## Cloudflare já implantado

- Worker: `nicoval-sync`
- Banco D1: `nicoval-db`
- Binding: `DB`
- URL: `https://nicoval-sync.tracker-mps.workers.dev`
- Secrets do Worker (Production): `SYNC_READ_TOKEN` e `SYNC_ADMIN_TOKEN`.
- `GET /v1/config` exige `Authorization: Bearer <SYNC_READ_TOKEN>`.
- `POST /v1/publish` exige `Authorization: Bearer <SYNC_ADMIN_TOKEN>`.

## Segurança e compatibilidade

- A proteção bloqueia pop-ups e redirecionamentos no nível da janela principal do Electron. Não bloqueia navegações internas de iframes, pois muitos players precisam delas para carregar vídeos.
- Não existe garantia de remover sobreposições publicitárias desenhadas dentro do iframe do provedor. Filtros genéricos poderiam quebrar o player.
- O token de leitura é incluído no instalador para permitir que o Val conecte automaticamente. Trate-o como uma credencial de leitura compartilhada, não como segredo administrativo.
- Nunca inclua `SYNC_ADMIN_TOKEN` no GitHub, no instalador ou no computador do Val.
- Cloudflare Workers e D1 permanecem sujeitos às cotas gratuitas da conta.

## Estrutura importante

- `electron/main.js`: janela desktop e atualizador.
- `electron/navigation-guard.js`: regras de bloqueio de pop-ups e redirects externos.
- `scripts/test-navigation-guard.js`: testes automatizados da proteção.
- `server.js`: servidor local, agenda e integração Cloudflare.
- `index.html`: interface e lógica da agenda.
- `build/icon.ico`: ícone do gato com VR.
- `.github/workflows/release.yml`: testes, build e publicação do instalador Windows.
