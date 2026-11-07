# Integrações Saimo TV

Esta aplicação usa o catálogo público da Saimo TV para metadados e referências de reprodução. O Saimo separa o frontend (`saimo-tv.pages.dev`), o VOD (`filmes-saimo.pages.dev`) e os canais (`canais-saimo.pages.dev`). Os endpoints podem variar.

## Executar

```sh
bun install --frozen-lockfile
bun run test
bun run build
bun run dev
```

Verifique os endpoints locais:

- `GET /api/catalogo` — itens, destaques, gêneros e `sourceStatus` (remote/fallback).
- `GET /api/item?id=...&tipo=movie|series|anime` — detalhe e temporadas quando disponíveis.
- `GET /api/resolve-vod?id=...&tipo=movie|series|anime&temp=1&ep=1` — lista de fontes obtidas, não validação de playback.
- `GET /api/stream?tipo=movie&id=550&versao=dub&json=1` — URL resolvida/404.
- `GET /api/canais` — canais de TV (503 quando nenhuma fonte está disponível).
- `GET /api/integrations/status` — saúde do catálogo VOD e da lista de TV.
- `GET /api/live-proxy?url=... ` — proxy para formatos live, incluindo HLS e DASH.
  
## Variáveis de ambiente opcionais

| Variável | Descrição |
|---|---|
| `SAIMO_VOD_PAGES` | URL base para arquivos `fichas.txt`, `indice.txt`, etc. |
| `SAIMO_VOD_MIRRORS` | Bases adicionais HTTPS, separadas por vírgula ou ponto e vírgula. |
| `SAIMO_VOD_RAW` | Espelho do catálogo em raw GitHub (quando existir). |
| `ANIMES_VOD_PAGES` | Origem HTTPS dos arquivos de animes. |
| `SAIMO_STREAM_API` | Endpoint HTTPS do redirecionador `/api/stream`. |
| `SAIMO_CANAIS_URLS` | URLs absolutas HTTPS de `catalogo.txt` ou listas `.m3u`, separadas por ponto e vírgula. |
| `TMDB_READ_TOKEN` / `TMDB_API_KEY` | Credenciais TMDB configuradas no servidor. |

Exemplo:

```env
SAIMO_VOD_PAGES=https://filmes-saimo.pages.dev
SAIMO_STREAM_API=https://saimo-tv.pages.dev/api/stream
SAIMO_CANAIS_URLS=https://canais-saimo.pages.dev/catalogo.txt
```

Mantenha as URLs personalizadas sob sua administração, sem injetar credenciais ou parâmetros privados nos relatórios.

## Como diagnosticar

1. Execute `bun scripts/probe-saimo.mjs` para medir códigos HTTP e tipos das origens, sem baixar os arquivos completos.
2. Abra `/api/integrations/status` no ambiente implantado.
3. Em caso de erros, inspecione `/api/resolve-vod` para um ID TMDB conhecido e `/api/canais` para confirmar canais.
4. Verifique o player no navegador, aba **Network**, para identificar falhas de CORS, manifesto HLS/DASH, mídia não encontrada ou upstream bloqueado.

HTTP 200 do catálogo **não** garante que as mídias funcionem; a origem dos streams pode mudar, exigir cabeçalhos/DRM, limitar regiões ou sair do ar. Nenhuma chave DRM é obtida automaticamente. Não existe conversão genérica de um iframe/HTML para um vídeo reproduzível.

## Comportamento em falhas

Catálogos remotos são consultados com timeout e failover. Quando o VOD principal falha, parte dos animes locais permanece navegável com aviso no frontend; os vídeos indisponíveis permanecem identificados como sem fonte. TV devolve erro HTTP 503 quando não há canais, em vez de responder com lista vazia silenciosamente. Consultas a arquivos segmentados são feitas sob demanda e resultados negativos são renovados rapidamente.
