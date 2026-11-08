# NicoValBolaLibre Cloudflare Sync

Worker Cloudflare + banco D1. Serviço configurado para o projeto:

- Worker: `nicoval-sync`
- D1: `nicoval-db`
- Binding: `DB`
- URL: `https://nicoval-sync.tracker-mps.workers.dev`

## Secrets (Production)

Crie as duas variáveis do tipo Secret no Worker:

- `SYNC_READ_TOKEN`: chave compartilhada usada pelo app para ler a configuração.
- `SYNC_ADMIN_TOKEN`: chave privada usada apenas pelo computador administrador para publicar.

## Banco

Execute (ou reexecute) `schema.sql` no Console do banco D1. A V0.18.7 adiciona a tabela `provider_cache`; o script é idempotente e preserva os dados existentes.

## Implantar Worker

Cole `worker.js` no editor do Worker e clique Deploy. Confirme o binding D1 chamado `DB` apontando para `nicoval-db`.

## Rotas

- `GET /health`: diagnóstico público; retorna somente estado e revisão.
- `GET /v1/config`: requer `Authorization: Bearer <SYNC_READ_TOKEN>`.
- `POST /v1/publish`: requer `Authorization: Bearer <SYNC_ADMIN_TOKEN>`.
- `GET /v1/provider-cache?provider=api-football&key=...`: requer chave de leitura e retorna apenas entradas não expiradas.
- `POST /v1/provider-cache`: requer chave administrativa; aceita TTL entre 1 segundo e 30 dias e payload individual de até 512 KB.
- `GET /v1/provider-cache/status`: requer chave de leitura.

## Integração com o aplicativo desktop

A partir da V0.17.1 e nas versões seguintes, o instalador recebe URL e token de leitura via GitHub Actions Secret `NVB_SYNC_READ_TOKEN`. A chave administrativa não é incorporada ao app. O computador administrador conserva a chave localmente; o computador do Val usa somente leitura e conecta automaticamente.

O token de leitura embutido no instalador pode ser extraído por um usuário tecnicamente experiente. Ele não concede escrita. Nunca inclua `SYNC_ADMIN_TOKEN` no GitHub ou no instalador.
