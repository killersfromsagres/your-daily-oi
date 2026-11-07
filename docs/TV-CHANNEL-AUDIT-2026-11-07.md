# Auditoria de TV ao vivo — 7 de novembro de 2026

## Cobertura

**261 canais** e **369 fontes** dos dois arquivos públicos Saimo (`catalogo.txt` e `canais.txt`) foram avaliados. A verificação usou uma única requisição GET com `Range: bytes=0-1535` por fonte, concorrência máxima 7, timeout de 5 s, cancelamento imediato do corpo e nenhum armazenamento de vídeo. Foram identificados **86 hosts** e **43 canais sem fontes após filtragem**. Esse resultado é um retrato de uma rede de GitHub Actions nos Estados Unidos — não uma medição da Internet brasileira, nem confirmação de que o navegador consegue reproduzir todo link que devolve manifesto.

A lista completa de **todos os 261 canais**, status HTTP de cada fonte, categoria, erros e identificação dos hosts (sem URLs assinadas nem tokens) está em [TV-CHANNEL-HEALTH-2026-11-07.csv](TV-CHANNEL-HEALTH-2026-11-07.csv). A execução GitHub Actions publica ainda o JSON completo como artefato por sete dias.

## Diagnóstico por tipo de resposta

| Resultado | Fontes |
| --- | ---: |
| Manifesto HLS/DASH ou conteúdo de vídeo reconhecido | 221 |
| HTTP 403 — acesso negado | 138 |
| HTTP 404 — fonte não encontrada | 5 |
| HTTP 400 | 1 |
| HTTP 502 | 1 |
| Timeout ou erro de rede | 3 |
| **Total** | **369** |

Dos **138 HTTP 403**, **137** ocorreram exclusivamente em três subdomínios `d1/d2/d3-*.cdn13embed.xyz` (60, 38, 39 fontes). Muitos canais fechados começam pelo mesmo host e demoram a alcançar seus servidores alternativos.

Em 63 canais com 403 na primeira fonte havia pelo menos uma URL alternativa que respondeu com dados de mídia no teste. Exemplos: HBO e variantes, Telecine Action/Pipoca/Fun/Cult, ESPN e variantes, TNT, Cartoon Network, Discovery, CNN Brasil e Band Sports. Isso **não certifica** a reprodução dos segmentos de cada um, mas justifica reordenar as tentativas no player.

Sem alternativa de fonte reconhecida: Amazon Prime Video 01/02, SporTV, SporTV 3, parte dos Premiere e Disney+, Telecine Premium, Telecine Touch e vários canais regionais. Esses não podem ser corrigidos apenas mudando a ordem do player.

## Diagnóstico por categoria

| Categoria (normalizada) | Canais | Fonte cadastrada e resposta de mídia em pelo menos uma |
| --- | ---: | ---: |
| Esportes | 77 | 17 |
| TV aberta | 48 | 27 |
| Filmes e séries | 47 | 31 |
| Variedades | 26 | 21 |
| Infantil | 22 | 18 |
| Documentários | 12 | 8 |
| Notícias | 9 | 9 |
| Música | 4 | 4 |
| 24 Horas | 11 | 3 |
| PPV | 5 | 0 |

As diferenças de resposta podem ocorrer por localização, CORS, autenticação, políticas anti-hotlink e disponibilidade das redes originais. Um HTTP 200/206 de playlist **não equivale** a vídeo reproduzindo.

## Comparação técnica com o Saimo

A leitura dos scripts públicos do Saimo confirmou que o frontend monta tentativas diretas e via `/api/proxy`, alternando entre elas e entre as URLs da lista. Não é apenas uma lista M3U: cada canal pode ter origem, cabeçalhos Referer/User-Agent, modo HLS/TS/DASH, ajustes de buffer e fallback. Essa estratégia já existia em parte no Zang Flix, mas duas falhas concretas foram identificadas:

1. A ordem anterior do player priorizava **qualquer HTTPS** à frente de HTTP. Em dezenas de canais fechados isso colocava o CDN com 403 antes de um HLS HTTP acessível via proxy, multiplicando os tempos de falha.
2. O proxy HLS não reescrevia o manifesto quando o navegador enviava HTTP `Range`. Reprodução real da HBO falhou porque o manifesto de resposta 206 continha `tracks-v1a1/mono.m3u8` como URI relativa. O Hls.js resolveu essa linha incorretamente para `/api/tv/tracks-v1a1/mono.m3u8`, causando 404 e erro de vídeo. Requisições sem Range recebiam o manifesto reescrito corretamente. O proxy foi corrigido para ignorar Range apenas em URLs de playlists HLS/DASH e manter Range em fragmentos MPEG-TS/fMP4.

## Mudanças de código

- `src/lib/live-source.ts`: ordenação que deixa o CDN sistematicamente bloqueado **como último recurso somente onde existem fontes alternativas**; classificador de URLs de manifesto HLS/DASH.
- `src/components/player/LivePlayer.tsx`: priorização dessas alternativas, erro persistente HTTP 401/403/404/410/429 aciona fallback sem retentativa inútil e limpeza da mensagem de erro anterior.
- `src/server.ts`: propaga erros HTTP relevantes da origem; playlists são obtidas inteiras e reescritas mesmo quando o cliente solicita Range.
- `src/lib/canais.ts`: normaliza categorias M3U `ESPORTES`, `ESPN`, `FILMES E SÉRIES` para as categorias existentes.
- `scripts/audit-all-tv-channels.mjs`: diagnóstico reproduzível e relatório JSON.
- `scripts/smoke-saimo-live.mjs`: regressão que testa os manifestos da HBO com e sem Range.
- `tests/live-tv.test.ts`: testes de ordenação, categorias e classificação de playlists.

## Verificação do player

O teste de navegador Chrome com Cloudflare Wrangler verificou a reprodução real dos canais, medindo o tempo atual do elemento HTMLVideoElement. Após corrigir a reescrita de manifestos enviados com Range:

| Canal | Tempo aos 5 s | Tempo aos 23 s | Reprodução |
| --- | ---: | ---: | --- |
| Band | 3,41 s | 21,42 s | Aprovado |
| HBO | 3,46 s | 21,46 s | Aprovado |
| ESPN | 3,44 s | 21,45 s | Aprovado |
| Telecine Action | 0 s | 0 s | Não reproduziu; o espelho recebeu HLS mas não entregou vídeo antes do timeout, e a fonte principal retornou HTTP 403 |

A HBO inicialmente falhou com HTTP 404 em `/api/tv/tracks-v1a1/mono.m3u8`. Depois da correção, o mesmo teste recebeu playlist completa e reescrita (HTTP 200) com e sem Range, e reproduziu por 23 s. Isso demonstra causa e solução de um defeito do nosso proxy. O caso Telecine Action demonstra uma limitação real das fontes remotas, não um resultado a apresentar como resolvido.

A sondagem de 369 URLs é um snapshot de headers e manifestos. Os testes de vídeo são validações separadas, não prova de reprodução de todos os canais.

## Produção

O último commit de TV integrado à `main` antes desta auditoria não foi publicado em `zangflix.vercel.app`, pois o status de deploy Vercel reportou `build-rate-limit`. O merge desta auditoria não constitui confirmação de que o domínio de produção recebeu os arquivos novos.

## Limites

A correção de ordenação, reescrita HLS, fallback e erros não elimina autenticação, DRM, restrição geográfica ou bloqueios HTTP 403 do provedor. Para canais sem fonte acessível é necessário que a origem disponibilize um stream válido/autorizado; não é possível prometer reprodução apenas modificando o frontend.
