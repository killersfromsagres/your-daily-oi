# Integração de TV ao vivo: Saimo TV

**Atualização:** veja [Zang Live 2.0](./ZANG-LIVE-2.md) para a auditoria da aplicação pública, a segunda lista M3U e o novo sistema de reprodução/visual.

## Fonte pública verificada

Catálogo principal: `https://canais-saimo.pages.dev/catalogo.txt`

Catálogo complementar M3U: `https://canais-saimo.pages.dev/canais.txt`

Auditoria realizada no GitHub Actions (2026-11-07):
- O arquivo declara **253 canais**, com **637 entradas de fonte**.
- O cabeçalho antigo do arquivo menciona 408 canais, mas esse número **não corresponde aos registros atuais**.
- 272 fontes apontavam para `/error.txt` (marcadores de indisponibilidade, não são playlists HLS).
- Após excluir esses links e servidores declarados desativados, **211 canais tinham pelo menos um link cadastrado utilizável**, somando 362 fontes. 42 canais permanecem listados como temporariamente indisponíveis.
- CDN de diversos canais respondeu `HTTP 403` nos testes externos. A API do catálogo responder `200` não significa que cada mídia esteja disponível.

Esses números se referem ao catálogo principal antes da inclusão de oito canais da lista M3U complementar. O Worker atualizado retornou **261 canais e 369 fontes cadastradas** no teste de integração. Os números são um retrato temporário. A API `/api/canais` apresenta as contagens atuais.

## Fluxo de reprodução

1. `GET /api/canais` combina catálogo principal e M3U complementar do Saimo com cache de 10 minutos e aceita espelhos/playlist M3U adicionados em `SAIMO_CANAIS_URLS`.
2. O parser preserva URL, logo, categoria, qualidade, Referer, User-Agent e ClearKey fornecidos pelo catálogo.
3. Canais sem fontes utilizáveis **continuam visíveis**, identificados como *SEM FONTE*.
4. O player determina HLS (`.m3u8`, `.txt`), MPEG-TS (`.ts`), DASH (`.mpd`, ClearKey) ou MP4 (`.mp4`). Quando a URL não revela o formato, consulta `/api/live-format?canal=<slug>&fonte=<índice>`, que testa apenas links do catálogo.
5. A maioria das fontes HTTPS é aberta **diretamente primeiro**, como no Saimo, com fallback para o proxy `/api/tv/stream?canal=<slug>&fonte=<índice>`. URLs HTTP, TXT e hosts específicos exigem proxy primeiro; os cabeçalhos Referer e User-Agent são obtidos do catálogo no servidor.
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

O smoke-test sobe o bundle Cloudflare no Wrangler, valida a resposta de `/api/canais`, identifica o formato de Band e valida um manifesto HLS real com segmentos reescritos. Não verifica todos os 261 canais simultaneamente, nem transfere programas completos.

Para incidentes, verifique os endpoints no deploy:

- `/api/integrations/status`: contagem atual de canais, fontes e itens temporariamente indisponíveis.
- `/api/canais`: lista completa, fontes e disponibilidade cadastral por canal.
- `/api/live-format?canal=band&fonte=0`: tipo de mídia da primeira fonte Band.
- `/api/tv/stream?canal=band&fonte=0`: rota preferencial de fallback para mídia de canal catalogado.
- `/api/live-proxy?url=...`: resposta para playlists filhas e segmentos HLS após reescrita.

Se a lista retornar `503`, o catálogo remoto está sem fontes válidas ou temporariamente inacessível. Configure um espelho HTTPS, ou aguarde recuperação da origem.
