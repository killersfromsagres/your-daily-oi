# Zang Flix — Catálogo de TV com glassmorphism e programação em tempo real

## O que mudou

A seção **Explore a programação** na rota `/tv` foi redesenhada sem alterar o player de filmes, séries ou os endpoints de IPTV existentes.

Cada card agora tem identidade visual própria, com superfície de vidro translúcido, desfoque, borda iluminada, logo, badge do tipo de programação, favorito, estado de canal selecionado, contagem de fontes e botão funcional **Assistir**. Todos os elementos funcionam nos modos grade e lista. O layout usa quatro colunas em telas largas, três em notebooks, duas em tablets e uma em celulares menores.

### Programa atual e próximo

A aplicação consulta `GET /api/epg/agora` uma única vez por atualização para obter a grade de todos os canais, em vez de realizar 261 chamadas separadas. O retorno fornece:

- Nome do canal usado para associar o programa ao card.
- `atual.titulo`, categoria, sinopse curta e faixa de horário.
- `proximo.titulo` e o próximo horário.
- `inicioEm` e `fimEm`, timestamps ISO que permitem conferir o conteúdo no ar sem depender do fuso do servidor.

O backend EPG é alimentado pelos arquivos XMLTV públicos BrazilTVEPG utilizados anteriormente. Apenas eventos cujo início é anterior (ou igual) ao momento atual e cujo fim é posterior são rotulados **AGORA PASSANDO**. Eventos futuros são rotulados **EM BREVE**. Se o cliente permanecer aberto na virada do programa, ele promove o próximo à condição de atual conforme o relógio, checado a cada 30 segundos.

O guia é revalidado automaticamente a cada aproximadamente três minutos enquanto a página estiver visível. A gaveta lateral do guia e todos os cards compartilham os mesmos dados.

### Filmes, séries, animes e outras categorias

Os badges distinguem conteúdo identificado como **Filme**, **Série**, **Anime**, **Esportes**, **Notícias**, **Documentário**, **Infantil** e outros, usando a classificação do próprio EPG quando disponível. Se o EPG não informa gênero, o badge usa a categoria do canal. Isso **não** equivale a afirmar que se conhece o título do vídeo.

A busca encontra canais por nome, categoria e título dos programas. O filtro **Com programação identificada** limita a visualização aos canais com dados de EPG.

**Importante:** canais sem dados de grade exibem "Programação não informada", não um nome de filme ou episódio inventado. A contagem de fontes representa endereços cadastrados, não uma garantia de que todas estão no ar.

## Auditoria de integração

Na verificação de 7 de novembro de 2026, realizada via Cloudflare Wrangler e Chromium:

- **261** canais retornados pelo catálogo.
- **261** registros no endpoint `/api/epg/agora`.
- **226** canais com título atual reconhecido no XMLTV e horários precisos.
- **225** canais com indicação do próximo programa.
- **0** eventos vencidos classificados incorretamente como atuais.
- **48** cards iniciais renderizados pelo Chrome, com a nova identidade visual e filtro de programação.

Como os canais e grades mudam, esses totais são um retrato da execução de teste, não uma quantidade garantida permanentemente.

## Branding

Textos visíveis, rótulos de fonte no player, erros da API e a descrição da página inicial foram padronizados para **Zang Flix**. Os domínios reais de mídia e caminhos `/api/saimo-vod` permanecem inalterados, pois são dependências técnicas e alterá-los quebraria a reprodução. Os documentos de auditoria preservam o nome dos provedores originais para transparência.

## Arquivos

- `src/components/tv/ChannelCard.tsx` — novo componente visual e informações atuais/próximas.
- `src/components/tv/TvView.tsx` — carregamento da grade, busca, filtros, sincronização e interações.
- `src/lib/tv-program.ts` — classificação e validação de horário, estados sem EPG.
- `src/lib/epg.ts` — dados XMLTV estruturados, programa efetivamente atual e próximo.
- `src/styles/tv-glass.css` — estilos de vidro, responsividade e cores por tipo.
- `src/routes/__root.tsx` — inclusão do CSS.
- `tests/tv-program.test.ts` — testes de classificação, programação vencida e transição.
- `scripts/smoke-tv-glass.mjs` — valida EPG em lote e cards renderizados em Cloudflare Worker e Chrome.

## Comandos de teste

```bash
bun install --frozen-lockfile
bun run test
bun scripts/typecheck-tv-glass.mjs
bun run build
bun scripts/smoke-tv-glass.mjs
bun scripts/scan-visible-branding.mjs
```

O deploy de produção deve incluir a versão Nitro/Cloudflare do servidor; hospedar somente os arquivos estáticos não disponibiliza a rota `/api/epg/agora`.
