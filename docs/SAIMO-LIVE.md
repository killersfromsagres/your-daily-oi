# Integração de TV ao vivo: Saimo TV

## Fonte pública verificada

Catálogo: `https://canais-saimo.pages.dev/catalogo.txt`

Auditoria realizada no GitHub Actions (2026-11-07):
- O arquivo declara **253 canais**, com **637 entradas de fonte**.
- O cabeçalho antigo do arquivo menciona 408 canais, mas esse número **não corresponde aos registros atuais**.
- 272 fontes apontavam para `/error.txt` (marcadores de indisponibilidade, não são playlists HLS).
- Após excluir esses links e servidores declarados desativados, **211 canais tinham pelo menos um link cadastrado utilizável**, somando 362 fontes. 42 canais permanecem listados como temporariamente indisponíveis.
- CDN de diversos canais respondeu `HTTP 403` nos testes externos. A API do catálogo responder `200` não significa que cada mídia esteja disponível.

Os números são um retrato temporário. A API `/api/canais` apresenta as contagens atuais.

## Fluxo de reprodução

1. `GET /api/canais` carrega o catálogo Saimo com cache de 15 minutos e aceita espelhos/playlist M3U adicionados em `SAIMO_CANAIS_URLS`.
2. O parser preserva URL, logo, categoria, qualidade, Referer, User-Agent e ClearKey fornecidos pelo catálogo.
3. Canais sem fontes utilizáveis **continuam visíveis**, identificados como *SEM FONTE*.
4. O player determina HLS (`.m3u8`, `.txt`), MPEG-TS (`.ts`), DASH (`.mpd`, ClearKey) ou MP4 (`.mp4`). Quando a URL não revela o formato, consulta `/api/live-format?canal=<slug>&fonte=<índice>`, que testa apenas links do catálogo.
5. Fontes com Referer/User-Agent específico ou HTTP são abertas primeiro via `/api/live-proxy`, evitando CORS ou mixed content. Com fonte HTTPS, há tentativa alternativa entre proxy e acesso direto.
6. Erros fatais, timeout ou falha de decodificação avançam entre as fontes cadastradas para o mesmo canal. Nunca repete infinitamente o mesmo caminho.
7. Playlists HLS obtidas pelo proxy têm URLs de segmentos e chaves reescritas para a mesma origem. A reprodução funciona com hls.js, mpegts.js, Shaka Player ou mídia nativa, conforme o formato.

Não é possível tornar disponíveis mídias que a origem retorne como `403`, `404`, `error.txt` ou que dependam de credenciais não publicadas. A aplicação mantém esses canais listados e sinaliza a indisponibilidade.

## Adicionar playlists e espelhos

Defina no servidor o valor opcional `SAIMO_CANAIS_URLS` com **URLs absolutas HTTPS** separadas por ponto e vírgula:

```env
SAIMO_CANAIS_URLS=https://example.org/minha-lista.m3u;https://example.net/catalogo.txt
```

As listas são combinadas com o catálogo oficial do Saimo, e fontes duplicadas são deduplicadas por URL. Os itens com o mesmo nome são agrupados em um canal com múltiplos servidores. Apenas use listas que você administra ou tem autorização para redistribuir.

## Testes

```sh
bun install --frozen-lockfile
bun run test
bun run build
bun scripts/audit-saimo-live.mjs
bun scripts/smoke-saimo-live.mjs
```

O smoke-test sobe o bundle Cloudflare no Wrangler, valida a resposta de `/api/canais`, identifica o formato de Band e valida um manifesto HLS real com segmentos reescritos. Não verifica todos os 253 canais simultaneamente, nem transfere programas completos.

Para incidentes, verifique os endpoints no deploy:

- `/api/integrations/status`: contagem atual de canais, fontes e itens temporariamente indisponíveis.
- `/api/canais`: lista completa, fontes e disponibilidade cadastral por canal.
- `/api/live-format?canal=band&fonte=0`: tipo de mídia da primeira fonte Band.
- `/api/live-proxy?url=...`: resposta e erros da origem; parâmetros Referer/UA são preenchidos pelo player.

Se a lista retornar `503`, o catálogo remoto está sem fontes válidas ou temporariamente inacessível. Configure um espelho HTTPS, ou aguarde recuperação da origem.
