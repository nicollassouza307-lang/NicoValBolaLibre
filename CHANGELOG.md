# Histórico de versões

## V0.22.15
- Corrigido um ciclo infinito de timers na persistência dos caches de partidas e classificação: cada timer agora grava uma vez e termina, evitando trabalho contínuo no renderer.
- Otimizado o carregamento da 365Scores: cache limitado e local-first, persistência assíncrona e agrupada, gravação compartilhada fora do caminho da resposta e deduplicação de requisições simultâneas.
- Classificação, chaveamento e rankings passam a ser carregados sob demanda; o detalhe da partida não dispara essas consultas em toda atualização do Livescore.
- Associação automática consulta primeiro a data selecionada e só expande para datas vizinhas quando necessário; comparação manual continua podendo pesquisar a janela completa.
- Adicionadas abas Chaveamento e Rankings a partir dos endpoints já existentes da 365Scores, sem inserir jogos na agenda original.
- Vínculos manuais da agenda são preservados; apenas os caches antigos e volumosos de detalhes/classificação são descartados e reconstruídos.

## V0.22.14 · Cache 365Scores e abas de competição
- Reduzido o trabalho síncrono do renderer ao persistir cache da 365Scores: cache de partidas limitado, persistência com debounce e gravação silenciosa espaçada.
- Removido o carregamento automático de classificação ao abrir/atualizar uma partida; classificação, chaveamento e rankings passam a carregar sob demanda.
- Adicionadas abas Chaveamento e Rankings usando os endpoints já existentes de brackets e estatísticas da competição.
- Otimizada a associação automática: consulta primeiro o dia selecionado e só busca datas vizinhas quando necessário; comparação manual continua podendo pesquisar a janela completa.
- Cache do servidor consultado localmente antes do cache compartilhado; gravação de cache compartilhado só ocorre após nova resposta da origem.
- Persistência do cache local de provedores passou a ser assíncrona e agrupada para reduzir bloqueios do processo local.
- Removidos do objeto normalizado os arrays brutos duplicados que não eram consumidos pela interface.
- Primeiro polling de relógios da agenda adiado para depois da renderização inicial.
- Não foram alteradas as fontes de agenda, nem a regra de que a 365Scores apenas enriquece partidas já existentes.

## V0.22.13 · Redução de travamentos e trabalho redundante na interface

- Atualizações silenciosas de partidas da 365Scores deixam de chamar `render()` da agenda inteira; atualizam somente o painel da partida selecionada e os elementos de placar/relógio necessários.
- A reavaliação automática do catálogo de emissoras foi removida do caminho global de renderização; continua sendo executada nos fluxos de carregamento/atualização da agenda.
- A atualização periódica de cinco minutos passa a reutilizar o cache do agregador, em vez de forçar consultas externas a cada ciclo. Atualização manual continua forçada.
- Mantém cache, deduplicação de requisições, intervalos de atualização da 365Scores e tratamento de 403/429.

## V0.22.12 · Seleções multilíngues, escalações, eventos, classificação e áudio

- Normaliza nomes exatos de seleções nacionais em português, espanhol, inglês e outros idiomas comuns, permitindo deduplicação das mesmas partidas entre Rei dos Canais e fontes hispanas; preserva marcadores femininos e de base.
- Corrige aliases de seleções com prefixos como “Seleção de Alemanha” e amplia a lista de países reconhecidos.
- Amplia a leitura de eventos da 365Scores para objetos aninhados de assistência/substituição e aliases adicionais de atletas que entram e saem.
- Eventos de substituição dos titulares ficam no trilho esquerdo; gols, gols contra e assistências ficam no direito. Os trilhos usam espaçamento independente e não se empilham no mesmo ponto.
- Cabeçalho das escalações mostra média das notas dos titulares disponíveis, com cor por faixa, nome e formação.
- Refina a classificação para exibir hierarquia de divisões e grupos (ex.: League A · Group 1), reconhecer mais envelopes da API, filtrar temporada/fase e normalizar os dados de tabela. A deduplicação de linhas agora é local a cada grupo para não apagar equipes de outra divisão.
- Adiciona Volume Booster de 100% a 300% para players compatíveis no Electron. O ganho é aplicado apenas na árvore do iframe do player, com compressor/limitador, reset rápido para 100%, aviso acima de 200% e reaplicação após o carregamento. Players que não permitem Web Audio/CORS podem não aceitar a amplificação.
- Adiciona testes de regressão para deduplicação multilíngue, classificação aninhada, enriquecimento de eventos, layout e Volume Booster.

## V0.22.11 · Recuperação e gerenciamento de vínculos históricos 365Scores

- Corrige a comparação de vínculos antigos criados quando o parser anexava o nome da competição ao visitante (ex.: “Chipre UEFA Nations League”). O reconhecimento remove sufixos de competições conhecidos antes de comparar equipes, na mesma data.
- Ao abrir o diagnóstico de associação, vínculos reconhecidos por essa regra são migrados para a chave atual da partida, preservando o gameId e os dados esportivos em cache.
- Adiciona inventário global dos vínculos salvos no Admin, incluindo registros de outras datas que não estão na agenda carregada, com ação de desvincular cada gameId.
- Em conflitos reais, a sugestão passa a oferecer “Desvincular e vincular aqui”, com confirmação explícita e identificação da partida que perderá o vínculo. A transferência preserva o cache antigo e carrega os dados da nova partida.
- Adiciona testes de regressão para vínculos com nomes de visitantes contaminados por sufixos de competição e para os novos controles de gerenciamento.

## V0.22.9
- Corrigida a inicialização da agenda removendo dependência de helper externo de vínculos 365Scores.
- Recuperação de vínculos antigos embutida no HTML; inicialização da agenda protegida contra falha de renderização inicial.

# NicoValBolaLibre V0.22.9

## V0.22.9 · Correção de vínculos 365Scores após mudança na chave da agenda

- A identificação de vínculo agora considera o eventId da agenda e, como fallback, os dois clubes na mesma data, além da chave composta que inclui competição.
- Vínculos antigos da mesma partida podem ser recuperados e migrados quando a competição ou a chave da agenda muda, evitando o falso aviso de gameId já vinculado.
- A exclusividade 1:1 continua bloqueando o uso do mesmo gameId em partidas realmente diferentes; a mensagem de conflito agora identifica a partida que já possui o vínculo.
- A ação de desvincular também localiza vínculos antigos pela identidade da partida e remove as entradas obsoletas correspondentes.
- A associação automática preserva vínculos manuais mesmo quando a chave composta muda e limpa chaves antigas da mesma partida antes de salvar a nova.
- Adicionado teste de regressão para chaves alteradas, IDs regenerados, conflitos reais e separação por data.

## V0.22.7 · Correção de sufixos de competições nos visitantes

- Corrige a extração de visitantes quando a fonte concatena o nome da equipe com a competição, incluindo UEFA Nations League e Champions League Feminina.
- Amplia o reconhecimento de competições UEFA masculinas e femininas e qualificatórias, mantendo a regra de correspondência mais longa primeiro.
- Adiciona testes de regressão baseados nos exemplos da captura: Bélgica, Chipre, Bielorrússia, Finlândia e Arsenal Feminino.

## V0.22.6 · Organização de agenda, competições e escalações

- Corrige nomes de visitantes com cauda duplicada e amplia o reconhecimento de competições no parser PelotaLibre, evitando que campeonatos sejam anexados ao nome do visitante.
- Adiciona remoção local de partidas da agenda com confirmação e restauração em Admin → Partidas. A remoção não altera as fontes externas nem apaga a partida do provedor.
- Amplia os metadados normalizados de competições 365Scores: categoria, gênero, idade, divisão, grupo, etapa, temporada, país e rodada/fase. Usa categoria/divisão/grupo/etapa para separar divisórias quando a informação existe, preservando a ordem manual antiga nas competições sem subdivisão.
- Mostra metadados de categoria, divisão, grupo, etapa e temporada no resumo da partida quando fornecidos pela fonte; a rodada/fase também pode aparecer na divisória da agenda.
- Aumenta o tamanho visual dos atletas na formação, desloca a primeira linha defensiva para longe do goleiro e oculta o número da camisa quando o valor é zero ou ausente.
- Ocultar partidas na agenda não as envia à associação automática da 365Scores nem as inclui na classificação de competições; a restauração continua disponível em Admin → Partidas.

## V0.22.5 · Restauração da lógica de formação da V0.22.0
- Voltada a lógica de distribuição e posicionamento do campo para a versão anterior às mudanças de reconstrução automática das linhas.
- Grid válido da escalação volta a ser a referência principal; formação e posição são fallback apenas quando o grid não é utilizável.
- Removidas as heurísticas que reinterpretavam coordenadas válidas como conflito de função e deslocavam atletas entre defesa, meio e ataque.
- Mantidas as alterações visuais e funcionais posteriores: eventos, notas, estatísticas, pênaltis, chamadas 365Scores e banco de reservas.

## V0.22.4 · Correção de posições e banco de reservas
- Posições táticas específicas da escalação passam a ter prioridade sobre metadados globais contraditórios do atleta.
- Pontas e zagueiros são reposicionados conforme suas siglas táticas quando o grid da fonte vier invertido.
- Banco de reservas reorganizado em duas colunas (foto e informações), com melhor leitura em telas estreitas.

## V0.22.3 · Escalações FotMob-style, notas e disputa de pênaltis

- Campo e escalações centralizados, retratos circulares, nomes e números mais próximos e melhor distribuição dos atletas. Quando a grade da fonte contradiz claramente a função do jogador, a profundidade é reconstruída pela posição e pela formação, sem trocar os jogadores.
- Marcadores de gols, gols contra, assistências, cartões e substituições padronizados em círculos com fundo `#132638`, incluindo os eventos dos reservas.
- Notas sobre as fotos dos titulares, no centro inferior, sem invadir o nome; cores variam conforme a faixa da nota. A estimativa considera as estatísticas individuais recebidas, os eventos, a função e os minutos, com pesos e limites para evitar que uma métrica isolada domine a nota. Percentuais ausentes não geram penalidade artificial.
- xGOT reconhece também o rótulo completo “Gols esperados em chutes no alvo”.
- Disputa de pênaltis separada dos eventos de jogo, com divisória e placar próprio. Cobranças não são contadas como gols normais nem alimentam as notas dos atletas. O placar da decisão aparece abaixo do resultado na agenda e na central da partida quando a fonte fornece os dados.
- Removidos os limites locais artificiais de 200 chamadas/dia e 12/min para 365Scores. Cache, fila e espaçamento entre chamadas continuam ativos. HTTP 429 gera pausa progressiva e respeita `Retry-After`; HTTP 403 pausa consultas e orienta a não contornar a recusa.
- Mantidos os intervalos de atualização moderados, os vínculos existentes da agenda e todas as fontes de agenda. 365Scores continua enriquecendo partidas já existentes, sem inserir jogos.


## V0.22.2 · Redução do consumo de consultas 365Scores

- Polling da partida aberta reduzido para 90 segundos e passa a respeitar o cache do servidor.
- Atualização de partidas ao vivo na agenda reduzida para um jogo por ciclo de 120 segundos; suspensa enquanto uma partida está aberta.
- Cache de detalhes da partida ampliado para 90 segundos e cache da classificação para 10 minutos.
- Busca sem correspondência é lembrada por partida por até 6 horas, evitando repetir três consultas de datas ao reabrir o mesmo jogo; o botão de nova tentativa manual continua disponível.
- Painel Admin exibe chamadas locais usadas/restantes e informa que o contador reinicia à meia-noite UTC.
- O teto de 200 chamadas/dia e o teto de 12/min continuam sendo limites de proteção do aplicativo, não limites oficiais publicados pela 365Scores.

## V0.22.1 · Correções de escalação, eventos e dados individuais

- Separação de goleiro e zaga na formação, com profundidades progressivas ajustadas à referência.
- Eventos de atletas vinculados por ID ou nome; resolução ampliada de jogadores nas substituições.
- Normalização de rodada numérica e distinção entre rodada e fase eliminatória.
- Notas individuais com mais métricas ofensivas, de criação, passe, defesa, duelos e goleiros, usando percentuais e dados completos disponíveis.
- Cores neutras nos nomes dos times em estatísticas.
- Busca e carregamento 365Scores automáticos ao abrir cada partida, com loading localizado e associação conservadora.

# Changelog NicoValBolaLibre

## V0.22.0 · Mega atualização

- Restaura eventos individuais nas escalações e calcula notas de 0 a 10 usando rating oficial ou estimativa baseada em eventos e estatísticas por posição.
- Reestrutura o posicionamento tático com prioridade para coordenadas válidas e fallback pela formação/posições; aproxima as linhas e mantém o goleiro e os demais jogadores bem distribuídos no campo.
- Simplifica o campo e as escalações, oculta treinador sem nome e compara as estatísticas com cor clara para o valor maior, escura para o menor e neutra para empate/ausência.
- Corrige o Livescore: minuto, escudo do time, PNG personalizado, assistência em gols, jogador que entra/sai e remoção de texto repetido em cartões.
- Automatiza a associação 365Scores após carregar a agenda, preservando vínculos manuais, alta confiança, exclusividade 1:1 e revisão de casos ambíguos.
- Atualiza os relógios dos jogos ao vivo também na agenda em lotes de até quatro jogos por ciclo de 30 segundos; 30s é o intervalo de cache/consulta interno, não um mínimo oficial declarado pela 365Scores. O player/iframe não é reconstruído.
- Atualiza a classificação junto aos dados da partida, com cache de 3 minutos, UI compacta e destaque das posições dos clubes.
- Retira o bloco separado “Onde Assistir” do detalhe da partida, mantendo as emissoras nos cartões da agenda.

# Changelog

## V0.21.1 · Correções do campo e Match Center

- Placas das logos de competições em #101d30, mantendo a transparência/fundo sem placa branca dos escudos de clubes e seleções.
- Atribuição dos eventos da 365Scores ao time correto e eventos de substituição refletidos nos jogadores que saem e entram, titulares ou reservas.
- Titulares e reservas maiores, goleiros posicionados dentro da pequena área, camisa ao lado do nome e nota separada.
- Símbolos de gols/assistências em badges retangulares com contagem; PNGs opcionais configuráveis no Admin.
- Estatísticas em coluna única com as cores de cada equipe.
- Data por extenso, horário, estádio/capacidade, rodada, árbitro e emissoras em blocos separados.
- Melhor extração do nome/foto do técnico quando a resposta da 365Scores contém esses dados.

## V0.21.0 · Mega atualização

- Livescore 365Scores com polling silencioso de 30 segundos, sem reconstruir o iframe do player.
- Exclusividade 1:1 nas associações automáticas de gameId.
- Campo 16:9 minimalista, eventos ao redor dos jogadores, notas quando fornecidas e reservas compactas.
- Metadados de estádio, árbitros, público, emissoras e rodada.
- Estatísticas de equipe e jogadores ampliadas e reorganizadas.
- Escudos 365Scores com fallback GitHub; TheSportsDB fora do fluxo visual ativo.
- Escudos nas tabelas, eventos com identificação do time e melhorias no espanhol argentino.
- Port para iPhone deliberadamente adiado.

## V0.20.1

- Remoção do limite de 500 jogos na comparação 365Scores e diagnóstico dos três melhores registros.


## V0.22.4
- Corrige prioridade das posições específicas da escalação sobre metadados globais contraditórios da ficha do atleta.
- Reforça a reconstrução das linhas para impedir pontas no setor defensivo e zagueiros no ataque quando a fonte fornece códigos táticos válidos.
- Reorganiza o banco em duas colunas reais (foto + informações), com uma coluna por equipe em telas estreitas para evitar texto espremido.
