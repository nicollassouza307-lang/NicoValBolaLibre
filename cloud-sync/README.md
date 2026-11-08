# NicoValBolaLibre Cloud Sync

Pequena API para compartilhar o catálogo de emissoras, vínculos por partida e escudos personalizados entre instalações.

## Implantação

A API precisa ficar online em HTTPS e usar armazenamento persistente. Ela pode ser implantada em qualquer host que execute o Docker.

1. Publique esta pasta (`cloud-sync/`) em um repositório privado ou público que você controle.
2. Crie um serviço Docker apontando para `cloud-sync/Dockerfile`.
3. Execute `GERAR_CHAVES.ps1` no PowerShell e configure `SYNC_READ_TOKEN` e `SYNC_ADMIN_TOKEN` com as duas chaves geradas.
4. Configure `DATA_FILE=/data/shared-config.json`.
5. Anexe um volume persistente no caminho `/data`.
6. Gere um domínio HTTPS para o serviço.
7. Cole esse endereço no painel de sincronização do NicoValBolaLibre.

Endpoints:
- `GET /health`: estado do serviço.
- `GET /v1/config`: última configuração publicada; requer `Authorization: Bearer <SYNC_READ_TOKEN>`.
- `POST /v1/publish`: publica uma nova configuração; requer `Authorization: Bearer <SYNC_ADMIN_TOKEN>`.

A chave de leitura deve ser configurada no computador do Nico e no do Val. A chave administrativa fica somente na instalação do administrador. Não publique nenhuma chave em repositórios; não envie a chave administrativa ao Val. A API não armazena favoritos nem preferência de idioma.

## Observações

- O arquivo de dados precisa estar em volume persistente. Sem volume, uma reinicialização ou novo deploy pode apagar os dados.
- Use HTTPS no domínio público.
- A API guarda somente URLs HTTPS e metadados; o serviço não hospeda players nem transmite vídeo. Qualquer pessoa com a chave de leitura pode consultar os dados compartilhados; mantenha essa chave somente entre os usuários do aplicativo.
