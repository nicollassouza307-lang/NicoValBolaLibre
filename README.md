# NicoValBolaLibre V0.18.11

Aplicativo desktop para acompanhar a agenda de futebol e enriquecer partidas com dados esportivos. A agenda continua sendo fornecida pelas fontes configuradas do Rei dos Canais/PelotaLibre; provedores esportivos externos apenas complementam eventos já carregados.

## Novidades da V0.18.11

- A área pública **Competições** possui as abas **Jogos**, **Classificação** e **Ao vivo**.
- **Jogos** filtra a agenda já carregada pela competição selecionada. Não busca nem adiciona partidas externas à agenda.
- **Classificação** consulta as tabelas do football-data.org fora do Painel Admin.
- **Ao vivo** consulta a rota API-Football `/fixtures?live=all` sob demanda. O cache é de 60 segundos para evitar chamadas repetidas; o livescore não é atualizado em segundo plano.
- **TheSportsDB V1 gratuita** está integrada como fonte auxiliar de escudos de clubes e ligas. A chave pública `123` já está no aplicativo; não é necessário criar conta nem colar token.
- A busca de escudos considera competição, país e ID de equipe da API-Football quando disponível. Correspondências de outro país ou com nome insuficientemente parecido são recusadas.
- O fallback de logos existente (GitHub/FootyLogos) permanece disponível quando a TheSportsDB não encontrar o clube.
- O teste de conexão da TheSportsDB verifica o retorno de um clube de teste, e não apenas uma resposta HTTP vazia.

## APIs e limites

| Provedor | Uso nesta versão | Credencial |
|---|---|---|
| API-Football | Escalações, estatísticas, eventos, placares e livescore manual | Chave pessoal configurada localmente |
| football-data.org | Resultados/calendários complementares e classificações das competições cobertas | Token pessoal configurado localmente |
| TheSportsDB V1 | Escudos de clubes e competições | Chave gratuita pública `123` integrada; sem cadastro |
| GitHub/FootyLogos | Fallback de escudos | Sem chave pessoal |

**Limitações da TheSportsDB gratuita:** a pesquisa geral de equipes por liga/país pode retornar no máximo 10 equipes por consulta. Portanto, nem todos os clubes serão encontrados; o aplicativo mantém os fallbacks e não escolhe escudos por semelhança fraca. O limite interno do aplicativo é de 25 chamadas por minuto, abaixo do limite publicado pelo serviço. O livescore V2 da TheSportsDB é Premium; por isso, a aba **Ao vivo** usa API-Football.

A conta gratuita do football-data.org tem cobertura limitada. Resultados/calendários podem sofrer atraso; escalações, assistências e estatísticas detalhadas continuam dependendo da API-Football.

## Como usar

### Área Competições

1. Instale a V0.18.11.
2. Clique em **Competições** na barra superior.
3. Use **Atualizar competições** para carregar a lista liberada no football-data.org.
4. Escolha uma competição.
5. Na aba **Jogos**, visualize somente as partidas da competição que já estão carregadas na agenda.
6. Na aba **Classificação**, clique em **Atualizar classificação**.
7. Na aba **Ao vivo**, clique em **Atualizar ao vivo** para consultar as partidas em andamento na API-Football. A consulta é manual para proteger a cota diária.

### Painel Admin

- **API-Football:** configure a chave pessoal neste computador e acompanhe o consumo.
- **football-data.org:** salve/teste/apague o token. O token fica criptografado pelo Electron `safeStorage` no perfil local do Windows. Não é enviado ao navegador, GitHub, Cloudflare ou computador do Val.
- **TheSportsDB:** clique em **Testar conexão**. Não há campo de token: o app usa a chave pública gratuita V1 `123` integrada.
- **Cloudflare:** o cache compartilhado pode permitir que o computador do Val reutilize respostas já publicadas, sem receber as chaves pessoais das APIs.

## Cache e compartilhamento

- Escudos: cache por até 30 dias; resultados negativos por 24 horas.
- Classificações football-data.org: cache por 6 horas.
- Competições football-data.org: cache por 12 horas.
- Partidas football-data.org: cache por 30 minutos.
- Livescore API-Football: cache por 60 segundos.
- A TheSportsDB mantém cache separado por provedor e pode reutilizar o cache compartilhado do Cloudflare se estiver configurado.

A V0.18.11 não exige nova migração do Worker/D1 se o cache `provider_cache` da V0.18.7 ou posterior já foi implantado. Não publique chaves de APIs no Worker ou em GitHub Secrets.

## Testes e validação

Os testes automatizados usam respostas simuladas para verificar os fluxos e não substituem a validação ao vivo com os provedores. Depois de instalar, use **Testar conexão** no Painel Admin para verificar a disponibilidade real da TheSportsDB. A disponibilidade e cobertura do serviço podem variar.

Comandos individuais:

```bash
node scripts/test-thesportsdb-service.js
node scripts/test-competitions-tabs.js
node scripts/test-apifootball-livescore.js
```

## Publicar V0.18.11

1. Extraia o ZIP e copie todo o conteúdo para a raiz do repositório local, substituindo os arquivos antigos e preservando a pasta `.git`.
2. Mantenha os segredos de sincronização já configurados no GitHub Actions. Não adicione tokens pessoais da API-Football ou football-data.org ao repositório.
3. Faça commit `NicoValBolaLibre V0.18.11` e `Push origin`.
4. Crie e envie a tag `v0.18.11`.
5. Confira o GitHub Actions. Considere a release pronta somente quando o instalador `*-Setup.exe` e os arquivos de atualização esperados (`latest.yml`, quando aplicável) estiverem nos assets da Release.

O ZIP contém o código-fonte. O instalador Windows ainda precisa ser compilado pelo GitHub Actions; não está incluído neste pacote.

## Referências oficiais

- TheSportsDB: https://www.thesportsdb.com/docs/api
- API-Football: https://www.api-football.com/documentation-v3
- Football-Data.org: https://docs.football-data.org/general/v4/index.html
