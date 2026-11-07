# Zang Flix — Ícones premium, progresso de episódios e central de futebol

## Ícones e identidade visual

- Menu principal **Jogos do Dia** com bola de futebol vetorial original e animação verde de destaque. A animação é desabilitada em \`prefers-reduced-motion\`.
- Menus de gêneros de Filmes, Séries e Animes receberam ícones semânticos próprios (terror, romance, ficção científica, animação, shounen, documentários, etc.), molduras luminosas e estados de hover consistentes.
- Cartões de episódios de anime usam um emblema vetorial específico para reprodução episódica.
- Jogos exibem os **escudos reais dos clubes** e, quando o provedor fornece, o **emblema oficial da competição**. Na ausência de emblema, um selo vetorial neutro identifica a liga sem inventar um logotipo.

## Episódios de séries e animes

O progresso do episódio é salvo sob a chave \`zangflix:episode-progress:v2\` do \`localStorage\` no dispositivo. A identidade inclui **tipo (série/anime), ID do título, temporada e episódio** para não misturar histórias.

O player \`OwnPlayer\` comunica tempo atual e duração real aos players de anime/série; as rotas salvam o progresso novo e preservam também o histórico antigo \`ydo-progress\`. O registro é persistente e não é apagado pelo procedimento de limpeza de fontes de vídeo.

**Estados na ficha de cada título:**

- Não iniciado: o episódio não tem tempo assistido registrado.
- Em andamento: o usuário assistiu pelo menos 4 segundos; com duração válida do vídeo, aparece a porcentagem precisa e uma barra âmbar.
- Assistido: marcado manualmente, ao chegar a pelo menos 92% da duração real do vídeo ou ao concluir o evento \`ended\`. Cor verde.
- Controles acessíveis permitem marcar assistido e desmarcar caso o usuário deseje rever o episódio.

O histórico anterior de progresso continua sendo lido, incluindo vídeos antigos salvos antes da atualização. Um episódio já concluído não é marcado como inacabado por uma reprodução posterior.

**Limites:** a informação é local ao navegador/dispositivo; não há login nem sincronização entre aparelhos. Quando a duração ainda não é conhecida, o sistema informa "Em andamento" em vez de inventar um percentual.

## Central esportiva em duas camadas

O Zang Flix já consultava uma agenda esportiva da ESPN por dia e verificava transmissões específicas pelo EPG do Brasil. Esta mudança preserva essa fonte e os resultados, sem criar uma segunda API incompatível.

**TV ao vivo (\`/tv\`)**: a seção "Hoje tem jogo" apresenta **até 8 partidas** de maior relevância, priorizando o Brasileirão Série A, UEFA Champions League e grandes clubes. Inclui botão para abrir a agenda completa.

**Página \`/futebol\`**: mostra **todos os jogos encontrados na data selecionada**, ordenados por importância (Série A, Champions, Libertadores, outras ligas e principais times), sem esconder partidas menores. Inclui:
- Navegação por 7 dias, começando pela data corrente no fuso \`America/Sao_Paulo\`.
- Campeonatos e logos reais quando disponíveis, escudos, horário, placar, estados ao vivo/encerrado.
- Indicação de emissora somente quando ela for identificada para **aquele jogo no Brasil**.
- Clique no card com transmissão identificada → \`/tv/canal/<slug>\`, abrindo automaticamente o canal correto pelo mesmo player existente.
- Sem correspondência confirmada: exibe "Transmissão no Brasil não confirmada", com opção de explorar os canais; não adivinha Premiere ou ESPN.
- Atualização automática de dois em dois minutos e ao retornar à aba, com estados de erro e programação parcial.

A data da API é sempre local ao Brasil. Na verificação de 7 de novembro de 2026, a agenda retornou 28 partidas de 13 ligas; é um retrato de teste, não uma lista fixa.

## Arquivos novos

- \`src/lib/episode-progress.ts\`: histórico de séries/animes, leitura de legado, marcação e percentual.
- \`src/components/catalog/EpisodeProgressControls.tsx\`: controles de conclusão.
- \`src/components/catalog/EpisodeIcon.tsx\`: emblema de episódio.
- \`src/styles/episode-progress.css\`: estados e barras de progresso.
- \`src/lib/football-ranking.ts\`: critérios de relevância e resumo limitado à TV.
- \`src/components/sports/FootballIcon.tsx\`: bola e emblema de competição vetoriais.
- \`src/routes/futebol.tsx\`: agenda completa.
- \`src/styles/football-center.css\`: página de jogos e botão pulsante.
- \`tests/episode-progress.test.ts\`, \`tests/football-ranking.test.ts\`: validação dos estados, isolamento e ranking.
- \`scripts/smoke-premium-experience.mjs\`: teste real no Worker e no Chrome.
- \`.github/workflows/verify-premium.yml\`: testes, build, typecheck e navegação.

## Testes de aceitação

\`\`\`bash
bun install --frozen-lockfile
bun run test
bun run build
bun scripts/typecheck-premium.mjs
bun scripts/smoke-premium-experience.mjs
\`\`\`

A mudança não altera a infraestrutura de reprodução de vídeos, listas M3U, links do Saimo, redes de transmissão ou APIs VOD; apenas integra a persistência e os acessos às rotas existentes.

O commit na branch \`main\` não garante por si só que o domínio Vercel publicou o build; verificar a implantação e consultar \`/futebol\` após integrar.
