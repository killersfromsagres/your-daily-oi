# Diagnóstico de reprodução de TV no deploy — 07/11/2026

## Problemas confirmados

A captura enviada mostra a lista de 261 canais carregada, mas uma falha ao reproduzir o canal Amazon Prime Video 01, que possui uma única fonte cadastrada.

Foram verificados HTTP e formato de vídeo em ambos os ambientes:

| Endereço testado | Resultado |
| --- | --- |
| zangflix.vercel.app/api/canais | 200: lista carrega |
| zangflix.vercel.app/api/live-format?canal=band&fonte=0 | 200: formato HLS |
| zangflix.vercel.app/api/tv/stream?canal=band&fonte=0 | 404 HTML: rota não publicada |
| zangflix.vercel.app/api/live-proxy | 400: proxy antigo existe |
| zangflix.vercel.app/api/integrations/status | 253 canais e 362 fontes, revisão antiga |
| Worker compilado da branch main | 261 canais e 369 fontes |

A captura com 261 canais pode pertencer a outro deploy. A URL exibida nela não foi informada. O site Vercel analisado respondia com catálogo e APIs de uma revisão anterior à principal.

A única fonte de Amazon Prime Video 01 retornou HTTP 403 HTML no teste direto do GitHub Actions. A tentativa pelo proxy público do Saimo também retornou HTTP 403 a partir desse ambiente; o proxy legado de zangflix.vercel.app retornou HTTP 502. Não é possível concluir que esses acessos falham em todas as redes/países, pois a origem pode aplicar regras diferentes por IP e região.

Em contraste, a Band foi reproduzida em um Chrome real contra o Cloudflare Wrangler: o tempo do vídeo avançou de 3,32 s para 21,32 s em 23 segundos de teste. SBT também reproduziu via uma fonte alternativa com avanço de 3,53 s para 21,53 s, mesmo simulando indisponibilidade da API /api/tv/stream.

## Mudanças implementadas

1. O site verifica se /api/tv/stream retorna 400 JSON ao receber um identificador inválido.
2. Se a rota não existe, verifica se o backend anterior responde a /api/live-proxy.
3. O player escolhe a rota de proxy que realmente existe no deploy atual, mantendo conexão direta como prioridade quando apropriado.
4. A rota de compatibilidade preserva a URL da fonte, Referer e User-Agent catalogados.
5. Se a fonte retornar erros HTTP 403, 404, 410 ou 429, o player mostra uma mensagem específica em vez de apenas Nenhum servidor disponível.
6. Após falhar em ambas as modalidades de uma fonte, avança para os próximos servidores; quando não houver mais, disponibiliza ação de trocar de canal.

## Verificação do deploy

No navegador, verifique os caminhos abaixo no mesmo domínio onde a TV falha:

- /api/version — versão do backend;
- /api/canais — catálogo e quantidade;
- /api/tv/stream?canal=%21&fonte=0 — deve retornar 400 JSON no backend novo;
- /api/live-proxy — deve retornar 400 texto com URL ausente no backend legado;
- /tv/canal/band — confirme que o tempo do vídeo avança;
- /tv/canal/sbt — confirme fallback entre fontes.

O código novo precisa ser publicado no Vercel para que essas mudanças cheguem ao site público. O merge no GitHub, por si só, não prova que houve deploy.

## Testes

- bun run test
- bun scripts/typecheck-tv.mjs
- bun run build
- bun scripts/smoke-saimo-live.mjs
- LIVE_TEST_CHANNEL=band bun scripts/diagnose-live-browser.mjs
- LIVE_TEST_CHANNEL=sbt LIVE_BLOCK_CATALOG_PROXY=1 bun scripts/diagnose-live-browser.mjs
- LIVE_TEST_CHANNEL=band LIVE_BLOCK_CATALOG_PROXY=1 LIVE_BLOCK_DIRECT_HOST=vipwaytvcdn.multtv.tv.br LIVE_REQUIRE_LEGACY_PLAYBACK=1 bun scripts/diagnose-live-browser.mjs

A pipeline de verificação executa os cenários reais em Cloudflare Worker + Chrome e não concede acesso a conteúdo de origem bloqueado.

## Limitações

Uma origem que exige licenças, credenciais, autorização IP, tokens ou restrição regional pode continuar retornando 403. A solução resolve incompatibilidades de deploy e de player; não garante reprodução de links que o servidor remoto recusa.
