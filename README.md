# NicoValBolaLibre V0.18.13

Aplicativo desktop para acompanhar a agenda de futebol e enriquecer partidas com dados esportivos. A agenda continua sendo fornecida pelas fontes configuradas do Rei dos Canais/PelotaLibre; provedores esportivos externos apenas complementam eventos já carregados.

## Correção visual da V0.18.13

- Fundo branco restrito às placas atrás dos logos PNG de clubes/competições. Os cartões de times, painéis, abas, estatísticas e conteúdo abaixo das partidas mantêm o tema escuro original.
- Barras e rótulos das estatísticas continuam usando as cores dos dois clubes.

## Novidades herdadas da V0.18.12

- Removida a página independente **Competições** da navegação principal. Jogos, classificações e livescore ficam dentro da tela de cada partida, no estilo de um Match Center.
- A central da partida possui as abas **Livescore**, **Escalações**, **Estatísticas** e **Classificação**.
- **Livescore** mostra placar, estado da partida, horário da última consulta e linha do tempo de gols, assistências, cartões, substituições e eventos fornecidos pela API-Football.
- **Escalações** e **Estatísticas** permanecem na própria partida. As barras e identificações estatísticas usam cores primárias conhecidas dos clubes, com cores alternativas quando o clube não está no mapa.
- A aba **Classificação** procura a liga correspondente à competição da partida no football-data.org; se não houver correspondência automática, permite carregar as competições e escolher manualmente. Pode usar a classificação da API-Football quando disponível como alternativa.
- Somente a placa atrás dos logos PNG de clubes e competições recebe fundo branco. Os cartões dos times, abas, estatísticas, classificação e todo o conteúdo abaixo das partidas mantêm o tema escuro original.
- TheSportsDB V1 gratuita continua como fonte auxiliar de escudos de clubes e ligas. A chave pública `123` já está no aplicativo; não é necessário criar conta nem colar token.
- A busca de escudos considera competição, país e ID de equipe da API-Football quando disponível. Correspondências de outro país ou com nome insuficientemente parecido são recusadas.
- O fallback de logos existente (GitHub/FootyLogos) permanece disponível quando a TheSportsDB não encontrar o clube.

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

### Central da partida

1. Abra uma partida na agenda.
2. Abaixo do player, use **Livescore**, **Escalações**, **Estatísticas** e **Classificação**.
3. Se ainda não houver dados da API-Football, clique em **Buscar dados da API-Football**. A consulta é manual para proteger a cota diária.
4. Na aba **Classificação**, a liga correspondente é selecionada automaticamente quando possível. Caso contrário, carregue a lista de competições e escolha a liga manualmente.
5. A tabela vem do football-data.org; quando houver uma tabela da API-Football já disponível para aquela partida, ela pode servir como alternativa.

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

A V0.18.12 não exige nova migração do Worker/D1 se o cache `provider_cache` da V0.18.7 ou posterior já foi implantado. Não publique chaves de APIs no Worker ou em GitHub Secrets.

## Testes e validação

Os testes automatizados usam respostas simuladas para verificar os fluxos e não substituem a validação ao vivo com os provedores. Depois de instalar, use **Testar conexão** no Painel Admin para verificar a disponibilidade real da TheSportsDB. A disponibilidade e cobertura do serviço podem variar.

Comandos individuais:

```bash
node scripts/test-thesportsdb-service.js
node scripts/test-competitions-tabs.js
node scripts/test-apifootball-livescore.js
```

## Publicar V0.18.13

1. Extraia o ZIP e copie todo o conteúdo para a raiz do repositório local, substituindo os arquivos antigos e preservando a pasta `.git`.
2. Mantenha os segredos de sincronização já configurados no GitHub Actions. Não adicione tokens pessoais da API-Football ou football-data.org ao repositório.
3. Faça commit `NicoValBolaLibre V0.18.13` e `Push origin`.
4. Crie e envie a tag `v0.18.13`.
5. Confira o GitHub Actions. Considere a release pronta somente quando o instalador `*-Setup.exe` e os arquivos de atualização esperados (`latest.yml`, quando aplicável) estiverem nos assets da Release.

O ZIP contém o código-fonte. O instalador Windows ainda precisa ser compilado pelo GitHub Actions; não está incluído neste pacote.

## Referências oficiais

- TheSportsDB: https://www.thesportsdb.com/docs/api
- API-Football: https://www.api-football.com/documentation-v3
- Football-Data.org: https://docs.football-data.org/general/v4/index.html
