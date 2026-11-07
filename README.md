# Zang Flix

Plataforma de streaming completa estilo Netflix com catálogo em português (dublado e legendado), consumindo o acervo oficial Saimo TV e metadados TMDB.

## Zang Live 2.0 — TV ao vivo

A seção de TV foi remodelada com interface responsiva, canais, busca, favoritos, programação/EPG e player HLS/MPEG-TS/DASH com fontes alternativas.

- Catálogos públicos Saimo: `catalogo.txt` + `canais.txt` (M3U), com atualização automática.
- API de streaming por canal: `/api/tv/stream?canal=band&fonte=0`.
- Verificação de backend: indica quando a publicação não disponibiliza os endpoints Nitro/Cloudflare.
- Diagnóstico e testes: [Zang Live 2.0](docs/ZANG-LIVE-2.md).

**Publicação:** após sincronizar o GitHub com Lovable, publique uma implantação que inclua as funções de servidor. Uma versão apenas estática consegue listar canais públicos, mas não pode retransmitir as fontes que exigem proxy.

## Zang Flix — TV com glassmorphism e programação

O catálogo de canais de TV agora tem cartões translúcidos, busca por filmes, séries, animes e programas, filtro por canais com grade e informações **Agora passando / Em seguida** de uma única consulta EPG para toda a lista. Nomes específicos só aparecem quando identificados pela grade XMLTV. Favoritos, modo lista/grade, navegação e streaming continuam disponíveis.

[Arquitetura, cobertura da grade e validação visual](docs/ZANG-TV-GLASS.md).

## Experiência premium: episódios, ícones e futebol

A navegação recebeu ícones editoriais profissionais e botão verde de **Jogos do Dia**. Séries e animes agora salvam progresso por episódio: não iniciado, parcial com porcentagem, assistido automático e marcação manual. O histórico antigo é preservado.

A TV ao vivo apresenta apenas oito partidas de maior destaque. A rota **`/futebol`** mostra todos os confrontos do dia (no horário de Brasília) com os mais relevantes primeiro, escudos e canais identificados no EPG.

[Documentação técnica, testes e limites](docs/ZANG-PREMIUM-EPISODES-FOOTBALL.md).

## Zang Sports — Central de jogos

A área de TV agora apresenta uma agenda esportiva responsiva com **Brasileirão, Champions League, Libertadores, Copa do Brasil e grandes ligas europeias**. O calendário permite consultar os sete dias seguintes, com horários convertidos para Brasília, escudos, confrontos, placares, status ao vivo, filtros e cards clicáveis para as transmissões identificadas no guia brasileiro.

- **API:** `/api/jogos-agenda?data=YYYY-MM-DD` (a rota `/api/jogos-hoje` continua compatível).
- **Fonte:** ESPN Soccer Scoreboard, com atualização automática a cada dois minutos.
- **Transmissão correta:** correspondência específica por jogo e emissora via EPG brasileiro, metadados BR ou mapeamento editorial, sem escolher Premiere/SporTV arbitrariamente.
- **Diagnóstico, configuração de canais e testes:** [Zang Sports](docs/ZANG-SPORTS.md).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/04b00ea6-c4b2-4756-b9f8-9a12ffa7c2d7).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
