# Zang Live 2.0 — Auditoria pública do Saimo e TV reformulada

## Escopo da análise

Auditoria da superfície pública do Saimo TV em 07/11/2026: página principal, rota /ao-vivo, scripts JavaScript e arquivos de catálogo. O sistema interno e as credenciais privadas do Saimo não foram acessados; o fluxo foi reproduzido de maneira independente.

A reestruturação altera a seção /tv e /tv/canal/:id, sem substituir a experiência de filmes, séries ou animes.

## Descobertas

| Item público | Uso observado |
|---|---|
| https://canais-saimo.pages.dev/catalogo.txt | Catálogo principal com canais, logo, fontes e cabeçalhos |
| https://canais-saimo.pages.dev/canais.txt | M3U complementar com oito nomes distintos |
| https://saimo-tv.pages.dev/fontes-desativadas.json | Hosts desativados |
| HLS.js (1.7.3 no frontend Saimo) | Reprodução HLS |
| MPEGTS.js | MPEG-TS ao vivo |
| Shaka Player | MPEG-DASH e ClearKey fornecido |
| /api/proxy?url=...&referer=...&ua=... | Proxy de mídia do próprio Saimo |

Na lógica pública do player Saimo, a maioria das URLs HTTPS é tentada diretamente no navegador e depois pelo proxy. Fontes HTTP, arquivos TXT e alguns hosts específicos partem do proxy. A ordem importa: um servidor pode aceitar o IP do espectador, mas rejeitar o IP de um Cloudflare Worker.

O catálogo principal continha 253 entradas de canais e 637 fontes. Havia 272 links de erro TXT. O arquivo M3U complementar continha oito nomes adicionais. No smoke-test da aplicação reestruturada, foram retornados 261 canais e 369 links candidatos após a combinação e filtragem.

A declaração de 408 canais no cabeçalho do catálogo estava desatualizada. A disponibilidade dos links muda com o tempo.

## Arquitetura implementada

1. GET /api/canais: carrega catálogo principal e M3U secundária, mescla os dados, remove fontes marcadas como erro e mantém os canais temporariamente sem fontes.
2. GET /api/live-format?canal=band&fonte=0: classifica o tipo de stream de uma fonte conhecida, sem aceitar URLs arbitrárias de clientes.
3. Reprodução direta para a maioria das fontes HTTPS, alinhada ao player público Saimo.
4. GET /api/tv/stream?canal=band&fonte=0: proxy com URL, Referer e User-Agent obtidos exclusivamente do catálogo do servidor.
5. /api/live-proxy: acompanha redirecionamentos, retransmite HLS, DASH e MPEG-TS; em playlists HLS, reescreve playlists filhas, chaves e segmentos.
6. HLS.js e MPEGTS.js carregados diretamente dos pacotes do projeto, sem dependência do jsDelivr em tempo de reprodução. Shaka é carregado sob demanda com fallback de CDN.
7. Tenta o caminho alternativo e depois a próxima fonte do mesmo canal quando a reprodução falha.
8. Atualiza os dados periodicamente sem trocar a fonte se o catálogo não mudou.

A rota /api/tv/stream não recebe URLs arbitrárias: exige slug do canal e índice existentes no catálogo. Os segmentos HLS continuam usando o proxy de mídia legado com as validações já existentes.

## Visual TV Studio

- Player em destaque, com nome, logo, categoria, programa atual, fonte e próxima atração quando houver EPG.
- Escolha rápida de canais e navegação anterior/próximo.
- Grade e lista responsivas, busca, categorias, favoritos, histórico e filtro por fontes cadastradas.
- Guia agora/a seguir em painel lateral.
- Cartões com status e contagem de fontes; indisponíveis permanecem visíveis.
- Seção de eventos esportivos preservada.
- Carregamento progressivo para listas extensas, atualização e mensagens de erro.
- Volume, seletor de fonte, tela cheia e Picture-in-Picture oferecidos pelo player.

## Testes

Comandos:

    bun install --frozen-lockfile
    bun run test
    bun run build
    bun scripts/smoke-saimo-live.mjs
    bun scripts/smoke-tv-ui.mjs
    bun scripts/typecheck-tv.mjs
    bun scripts/audit-saimo-ui.mjs

Na primeira validação completa: 23 testes automatizados e build de produção aprovados. O Cloudflare Worker retornou 261 canais e 369 links, uma playlist HLS válida da Band por /api/tv/stream e um segmento MPEG-TS real com HTTP 206 e 512 bytes. A interface foi renderizada no Chrome headless, com 48 cartões iniciais.

O verificador de tipos específico dos arquivos de TV não detectou erros. O TypeScript global ainda registra diagnósticos antigos fora dos módulos atualizados.

## Publicação e limites

O deploy do site deve executar o backend Nitro/Cloudflare, não apenas servir HTML/CSS/JS estáticos. A publicação do GitHub não garante por si só que a versão online tenha sido implantada.

A existência da URL no catálogo não garante que um canal toque. Uma origem pode devolver 403, 404, exigir credenciais, ficar indisponível ou usar codecs não suportados. A aplicação não obtém permissões nem remove restrições de terceiros. A validação automatizada cobre exemplos reais, não os 261 canais individualmente.

Para verificar o deploy, abra /api/integrations/status, /api/canais e /api/live-format?canal=band&fonte=0; depois teste Band e SBT no navegador, com as ferramentas de rede abertas.

## Arquivos principais

- src/components/tv/TvView.tsx — nova experiência Zang Live.
- src/styles/tv-studio.css — design responsivo.
- src/components/player/LivePlayer.tsx — player com seleção de formato e fallback.
- src/lib/live-source.ts e src/lib/live-probe.ts — classificação.
- src/lib/canais.ts — catálogo principal e M3U.
- src/server.ts — /api/tv/stream.
- scripts/audit-saimo-ui.mjs — inspeção pública.
- scripts/smoke-saimo-live.mjs — media real.
- scripts/smoke-tv-ui.mjs — browser.
