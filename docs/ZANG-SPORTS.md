# Zang Sports — Central inteligente de jogos

## Interface

A seção **Jogos de hoje**, na rota /tv (logo abaixo do player), foi reconstruída como central de futebol. Exibe os próximos sete dias com seleção de data, escudos dos clubes, confronto, horário de Brasília, competição, indicação de partida ao vivo e placar quando disponível. Há filtros: Destaques, Todos, Brasileirão, Champions, Copas e Europa. O catálogo de TV permanece na mesma página; filmes e séries não foram alterados.

O frontend usa /api/jogos-agenda?data=YYYY-MM-DD. A rota /api/jogos-hoje continua como alias compatível. A data padrão é **a data atual em America/Sao_Paulo**, mesmo quando o backend está hospedado em outro fuso. O relógio local do espectador não modifica o horário apresentado.

Os cards possuem escudos obtidos diretamente do feed esportivo e fallback tipográfico quando a imagem não é acessível. O placar só aparece quando a fonte informa status de jogo em andamento/encerrado. O rótulo AO VIVO depende do estado retornado pelo provedor, não de estimativa baseada apenas no horário.

## Dados esportivos

Fonte principal: ESPN Site API v2, placares por dia no futebol.

- Brasileirão Série A: bra.1
- Brasileirão Série B: bra.2
- Champions League: uefa.champions
- Libertadores: conmebol.libertadores
- Sul-Americana: conmebol.sudamericana
- Copa do Brasil: bra.copa_do_brazil
- Premier League: eng.1
- LaLiga: esp.1
- Serie A Italiana: ita.1
- Bundesliga: ger.1
- Ligue 1: fra.1
- Liga Portugal: por.1
- Europa League: uefa.europa

Os endpoints são solicitados por **uma data YYYYMMDD**; o ESPN Site API retorna HTTP 400 quando se tenta um intervalo, então o usuário navega por sete dias e o backend consulta somente o dia selecionado, sem realizar 91 solicitações automaticamente. Requisições são agrupadas (até cinco simultâneas), possuem timeout, cache em memória de dois minutos, deduplicação entre requests concorrentes, retorno parcial se alguma liga falhar e recuperação de cache anterior em caso de indisponibilidade.

Algumas ligas não têm jogos em determinado dia; um cartão nunca é criado para preencher espaço. No teste de integração de 07/11/2026, a API combinada retornou 27 partidas, entre elas jogos da Premier League, LaLiga, Itália, Alemanha, França, Portugal e Série B. Série A e Champions não tiveram partida nessa data nas respostas consultadas. Outras datas podem ter resultados diferentes.

## Horários e estados

- A data da partida é calculada a partir do timestamp UTC original com Intl.DateTimeFormat, timezone America/Sao_Paulo.
- Partidas perto de meia-noite são filtradas pelo **dia no Brasil** e não pelo dia UTC.
- Horário visual usa 24 horas (HH:mm).
- Status vindo do provedor: agendado, em andamento, encerrado ou adiado.
- Placar não é mostrado antes do início; resultados da fonte são atualizados periodicamente.
- O frontend consulta novamente a API a cada dois minutos e ao voltar à aba; a data troca automaticamente na virada de dia no horário de Brasília.
- Se o provedor não responder, aparece uma mensagem de indisponibilidade ou uma indicação de dados parciais. Ausência de jogos é diferente de erro do provedor.

## Como os cards vão ao canal correto

**Foi removida a atribuição genérica de todo jogo ao primeiro canal Premiere/SporTV/ESPN.** Essa regra estava tecnicamente errada, pois direitos de TV mudam a cada partida.

Um link direto para /tv/canal/:id só é mostrado quando há informação específica e rastreável da partida:

1. Configuração editorial por ID do evento, confirmada pelo operador.
2. Guia de programação brasileiro (BrazilTVEPG/Claro XMLTV) que contenha os nomes **dos dois clubes** numa faixa próxima ao horário programado, com correspondência exata ao canal ativo no Zang Flix.
3. Dados de emissora no ESPN \`geoBroadcasts\` com região Brasil (br/bra/brazil/brasil), correspondentes a um canal ativo no catálogo.

**Importante:** feeds ESPN retornam normalmente emissoras dos Estados Unidos. ESPN+, USA Network, Peacock e outros canais dos EUA **não** são tratados como prova de que um jogo será transmitido pelo ESPN ou outro canal no Brasil.

Quando não há comprovação, aparece **"Transmissão no Brasil não confirmada"**, com ação **"Explorar canais"** que abre os canais esportivos do site, sem inventar uma emissora. Isso significa que nem todos os cards possuem um botão de assistir automaticamente.

### Confirmar jogos específicos no painel de implantação

Adicione a variável de ambiente opcional \`ZANG_JOGOS_CANAIS_JSON\` em Vercel/Lovable, com um objeto JSON cujas chaves são o ID de jogo, e cujos valores são o slug exato do canal no catálogo Zang Flix. O identificador tem o formato \`<liga>:<idEvento>\`, exibido em \`/api/jogos-agenda\`.

Exemplo de estrutura, **com identificadores fictícios apenas ilustrativos**:

    {"bra.1:ID123":"canal-existente","uefa.champions:ID456":["canal-a","canal-b"]}

Também é aceito \`YYYY-MM-DD|clube-casa|clube-fora\`, com nomes normalizados e hífens. O servidor valida o ID e confirma que o canal existe e possui uma fonte cadastrada; caso contrário, não mostra botão de assistir.

Não são adicionados tokens de mídia, logins, credenciais nem cópias dos streams. A presença de um link de canal não garante que o servidor esteja online no momento do jogo.

## Arquivos

- \`src/lib/jogos-match.ts\` — normalização, calendário, data/hora de Brasília, estado, escudos, status e informações de transmissão BR.
- \`src/lib/jogos.ts\` — consulta múltiplas ligas, cache, resultados e resolução de canal.
- \`src/lib/epg.ts\` — confirmação cruzada do confronto e faixa de programação.
- \`src/components/tv/JogosShelf.tsx\` — cards interativos, seleção de datas, filtros e status.
- \`src/styles/jogos-center.css\` — visual responsivo.
- \`src/components/tv/TvView.tsx\` — integração com o player e navegação à categoria Esportes.
- \`src/server.ts\` — API de agenda com data validada.
- \`tests/jogos-match.test.ts\` — cobertura de virada de dia, horário, escudos, placar e validação de emissoras.
- \`scripts/smoke-sports-center.mjs\` — teste real em Worker Cloudflare e Chrome.

## Verificar localmente

    bun install --frozen-lockfile
    bun run test
    bun scripts/typecheck-sports.mjs
    bun run build
    bun scripts/smoke-sports-center.mjs

Em um deploy atualizado, acesse \`/tv\`, navegue pelas datas e verifique a API \`/api/jogos-agenda?data=2026-11-07\`. O backend precisa estar implantado, não apenas o frontend. Um erro 404 HTML na rota de jogos indica que a versão publicada ainda é antiga.

O ESPN Site API é uma fonte pública de dados sem SLA ou garantia de cobertura de todas as competições. O projeto não garante horário/placar corretos se o provedor alterar partidas sem atualizar sua resposta ou indisponibilizar uma liga. As correspondências de emissoras exigem evidência específica de transmissão no Brasil.
