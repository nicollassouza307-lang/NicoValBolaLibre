# NicoValBolaLibre V0.17.0

Esta versão acrescenta a base do aplicativo desktop Windows, atualizações por GitHub Releases e sincronização remota do catálogo.

## Preservar os dados da versão no navegador

O Electron usa um perfil de armazenamento próprio, separado do Chrome/Edge. Antes de migrar da versão web, abra o Painel Admin antigo e use **Exportar configurações para compartilhar**. Depois instale o desktop, abra o Painel Admin e importe esse JSON uma vez. Isso preserva catálogo, vínculos, favoritos, escudos e o estado da automação. Em seguida, use a publicação na nuvem para enviar os dados compartilhados ao computador do Val.

## Para quem vai usar o aplicativo

Quando o instalador `NicoValBolaLibre-0.17.0-Setup.exe` for publicado, o Nico e o Val só precisarão instalá-lo uma vez. O programa já leva o runtime do Node.js dentro do Electron. Não é necessário instalar Node.js, Python, abrir terminal ou executar arquivos `.bat` para usar o programa.

O instalador cria atalhos no Menu Iniciar e na Área de Trabalho. O aplicativo inicia o servidor local internamente e abre sua janela própria.

## Criar o instalador Windows

O `.exe` ainda precisa ser compilado em Windows ou pelo GitHub Actions. Este ambiente de edição está sem acesso ao npm e não consegue baixar o Electron para produzir o binário final.

### Opção A: compilar no Windows

1. Instale Node.js 22+ somente no computador de desenvolvimento/build.
2. Abra `build-windows.bat` com duplo clique.
3. Aguarde a instalação de dependências e o build.
4. O instalador estará em `dist/NicoValBolaLibre-0.17.0-Setup.exe`.

O Node.js é necessário apenas para criar o instalador, não para executar o programa instalado.

### Opção B: publicar pelo GitHub Actions

1. Crie um repositório GitHub para este projeto.
2. Envie os arquivos do projeto para a branch principal.
3. Para cada versão, atualize `version` no `package.json` e o texto de versão no rodapé do `index.html`.
4. Crie e envie uma tag, por exemplo `v0.17.0` (`git tag v0.17.0` e `git push origin v0.17.0`).
5. O workflow `.github/workflows/release.yml` compila o instalador Windows e publica os arquivos da versão em GitHub Releases.
6. O app desktop verifica atualizações no início e também oferece o botão **Verificar atualizações** no Painel Admin. Ao encontrar uma versão, permite baixar e instalar.

Para atualização automática sem login nos computadores do usuário, use um repositório de Releases público. Repositórios privados exigem uma estratégia adicional de autenticação que não está configurada nesta entrega.

## Sincronização entre o Nico e o Val

A sincronização precisa de uma API online. O código dela está em `cloud-sync/`. Ela não pode ser substituída por `localStorage`: os dois computadores precisam conversar com um endereço HTTPS comum.

### Implantar o serviço uma vez

1. Publique a pasta `cloud-sync/` em um repositório que você controle.
2. Crie um serviço Docker em um host como Railway ou outro compatível, usando `cloud-sync/Dockerfile`.
3. Anexe um volume persistente em `/data`.
4. Configure `DATA_FILE=/data/shared-config.json`.
5. Gere as duas chaves executando `cloud-sync/GERAR_CHAVES.ps1` no PowerShell.
6. Configure `SYNC_READ_TOKEN` e `SYNC_ADMIN_TOKEN` como variáveis secretas do serviço.
7. Gere um domínio HTTPS para o serviço.

### Conectar os dois computadores

No Painel Admin do NicoValBolaLibre:

1. Cole o domínio HTTPS do serviço.
2. Cole `SYNC_READ_TOKEN`.
3. Cole também `SYNC_ADMIN_TOKEN` neste computador, que será o administrador.
4. Clique em **Salvar conexão** e depois em **Publicar meus dados para todos**.

No computador do Val:

1. Cole o mesmo domínio HTTPS.
2. Cole somente `SYNC_READ_TOKEN`.
3. Clique em **Salvar conexão**.

Depois disso, o app busca automaticamente novos dados ao iniciar e aproximadamente a cada dois minutos enquanto está aberto. Também é possível clicar em **Buscar dados compartilhados**.

### O que sincroniza

- Catálogo de emissoras e fontes cadastradas;
- Vínculos de players por partida;
- Escudos personalizados.

Favoritos, idioma e preferências pessoais continuam locais. A sincronização atual combina os dados remotos com os dados locais, sem apagar o que já existe em cada computador.

**Segurança:** não envie `SYNC_ADMIN_TOKEN` ao Val. A chave de leitura deve ser compartilhada apenas entre os usuários pretendidos. As chaves ficam no armazenamento local do navegador/app e não são incluídas no arquivo de configuração publicado. A API guarda URLs HTTPS e metadados, não hospeda vídeos nem transmite conteúdo.

## Estrutura importante

- `index.html`: interface e lógica da agenda.
- `server.js`: servidor local e agregador de agenda.
- `electron/main.js`: aplicativo desktop, ciclo de vida e atualizador.
- `electron/preload.js`: ponte segura entre a interface e o Electron.
- `cloud-sync/server.js`: API remota de sincronização.
- `.github/workflows/release.yml`: build e publicação de versões Windows.

## Limites desta entrega

- O código do desktop e do atualizador está preparado, mas o instalador `.exe` ainda não foi compilado/publicado.
- A API de sincronização está incluída, mas ainda precisa ser implantada em hospedagem HTTPS com volume persistente.
- Até configurar a API e as chaves nos dois computadores, a sincronização entre eles não estará ativa.
