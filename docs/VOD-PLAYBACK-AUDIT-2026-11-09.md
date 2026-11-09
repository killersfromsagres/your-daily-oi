# ZANG FLIX — Auditoria de reprodução VOD (09/11/2026)

## Escopo
Revisão estática do fluxo público de filmes, séries e animes, catálogo Saimo, resolução dos servidores, proxy de mídia, seleção de episódios e player. Os testes automatizados cobrem comportamento de código e payloads simulados. **Uma aprovação de build não prova disponibilidade de todos os títulos:** cada URL precisa de uma fonte de vídeo acessível, e os CDNs podem variar por região/horário.

## Defeitos identificados e corrigidos

| Componente | Falha identificada | Correção |
|---|---|---|
| `src/lib/saimo-stream.ts` | Provedores de fontes eram consultados em sequência, prolongando a espera por vários timeouts | Saimo, RedeFlix, Fenix e catálogo consultados em paralelo, deduplicados; caches negativos curtos |
| `src/server.ts /api/resolve-vod` | Resolvedor geral atrasava a resposta de episódios e só depois consultava o backup de anime | Resolução das fontes exatas de episódio, provedores independentes e backup de anime em paralelo |
| `src/routes/assistir.serie.$id.$temp.$ep.tsx` | `Promise.allSettled` mantinha spinner até o fim de todas as chamadas | Player entra ao receber a primeira resposta reproduzível; consultas abortam após prazo limitado |
| `src/routes/assistir.anime.$id.$temp.$ep.tsx` | Mesmo bloqueio de carregamento das séries | Início incremental e prazo limitado |
| `src/components/player/OwnPlayer.tsx` | O índice da fonte ativa podia passar a apontar para outra URL quando o agregador acrescentava resultados | Mantém ordem estável das fontes em uso e acrescenta links novos sem reinicializar o player |
| `src/components/player/OwnPlayer.tsx` | Falhas no relay eram retidas por toda a sessão | TTL de 90s para tentar recuperar origens novamente |
| `src/components/player/usePlayerEngine.ts` | Duração estimada pelo TMDB rejeitava episódios especiais/animes curtos, confundindo vídeo legítimo com anúncio | Removida rejeição ampla por duração; só clips extremamente breves em longas-metragens entram na suspeita |
| `src/routes/assistir.filme.$id.tsx` | Sem alternativa direta se o proxy Vercel fosse bloqueado pelo CDN | Tentativa via endereço público no navegador como fallback ao proxy same-origin |
| `src/lib/catalog.ts` | Links de vídeo positivos podiam permanecer em cache por 6h | Renovação a cada 15min; metadados a cada 30min |
| `src/lib/sushianimes.ts` | Parser de temporadas só reconhecia links de episódio absolutos; resolver aguardava embeds serialmente | Links absolutos/relativos, números corretos, deduplicação e concorrência dos embeds; extração de mídia em HTML/JSON |
| `scripts/smoke-vod-preview.mjs` | Smoke teste tratava HLS como falha porque esperava MP4 fixo | Testa HLS e MP4 separadamente sem baixar os vídeos completos |

## Prioridade do episódio

1. Arquivo exatamente correspondente à temporada e ao episódio selecionados.
2. Fonte externa da mesma temporada e episódio, quando localizada.
3. Demais provedores compatíveis.
4. Se nenhuma fonte responder, exibir indisponibilidade; não inventar stream nem retornar silenciosamente episódio diferente.

## Como validar

```bash
bun install --frozen-lockfile
bun test tests/saimo-playback.test.ts tests/saimo-integration.test.ts tests/player-recovery.test.ts tests/vod-reliability.test.ts
bun scripts/typecheck-vod.mjs
bun run build
bun scripts/smoke-vod-preview.mjs
```

Workflow: `.github/workflows/verify-vod-playback.yml` foi configurado para commits da branch `main`.

## Verificação de produção pendente

- Confirmar no deploy Vercel que `/api/item`, `/api/resolve-vod`, `/api/saimo-vod?probe=1` e `/api/anime-sushi/episodio` respondem.
- Testar amostras reais de filme, série (vários episódios) e anime em navegador desktop e Android; verificar Network (CORS, código HTTP, MP4 206, HLS, codecs e disponibilidade regional).
- Confirmar no player que cada temporada/episódio toca o conteúdo correto, e que a próxima fonte entra quando a primeira falha.
- Validar acesso à conta/equipe Vercel para consultar logs de erros HTTP; um commit pronto no GitHub não garante que a mídia esteja acessível em produção.

## Limites observáveis

- Fontes externas podem exigir permissão, sessão, assinatura, DRM ou regiões específicas; uma URL presente no catálogo não significa reprodução garantida.
- Não foi possível executar uma auditoria ponta a ponta de **todos** os filmes, séries e animes; não há evidência de disponibilidade individual de cada CDN.
- O diagnóstico de playback deve registrar `contentType`, `status` e contagens, sem expor URLs assinadas nem conteúdo de vídeos.
