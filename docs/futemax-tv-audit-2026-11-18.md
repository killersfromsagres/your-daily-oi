# Auditoria pública: FuteMAX e Corinthians x Botafogo — 18/11/2026

## Escopo verificável

URL fornecida: https://futemax.gmbh/corinthians-x-botafogo-ao-vivo-18-11-2026/

- O índice público https://futemax.gmbh/ apresenta um catálogo de jogos com links para confrontos e uma área “TV ao vivo” com nomes de canais como Premiere, SporTV e Globo.
- A URL individual da partida, assim como a página de Premiere do terceiro, não pôde ser carregada pelo ambiente de auditoria (cache miss); uma tentativa de acesso HTTP direto não resolveu DNS. Sem HTML, DevTools/network trace ou autorização do operador, **não foi possível verificar os iframes reais, hosts de mídia, CDNs, manifests HLS/DASH, tokens, cadeia de redirecionamento, direitos de distribuição ou reprodução contínua**.
- A afirmação de qualidade HD/múltiplos players no catálogo é marketing do site e não comprova disponibilidade do sinal ou permissões de retransmissão.
- Não foram copiadas URLs de mídia ou iframes de terceiros para o catálogo ZANG FLIX.

## Transmissora confirmada para a partida

O ge (18/11/2026) e o SBT News (18/11/2026) anunciam **Premiere** como transmissora de **Corinthians x Botafogo, 18/11/2026, 21h30 BRT**.

- https://ge.globo.com/sp/futebol/brasileirao-serie-a/noticia/2026/11/18/corinthians-x-botafogo-onde-assistir-ao-vivo-horario-e-escalacoes.ghtml
- https://sbtnews.sbt.com.br/noticia/brasil/corinthians-x-botafogo-onde-assistir-ao-vivo-e-horario
- Serviço oficial: https://globoplay.globo.com/canais/premiere/ (assinatura exigida)

As fontes editoriais não identificam Premiere 2, Premiere 3 ou outra variante numerada. O jogo **não deve ser ligado arbitrariamente** a esses canais. Caso o catálogo ofereça no futuro um canal Premiere inequivocamente identificado e licenciado, a resolução por nome continua disponível, sem inventar um stream.

## Integrações implementadas

1. Evidência de transmissão específica para o confronto e a data; normalização limitada de aliases de Corinthians e Botafogo RJ (sem confundir Botafogo-SP).
2. Destina o card ao serviço oficial de Premiere quando não existe canal identificável com fonte confirmada para a partida.
3. Player interno continua mostrando as opções existentes do mesmo canal. Nas partidas com mais de uma emissora identificada, mantém a escolha de cada emissora, sem misturar canais diferentes ou reproduzir outro jogo.
4. Mostra o resultado real da última tentativa de reprodução no card de transmissão quando esse status existe no navegador; uma URL cadastrada não é prova de vídeo funcionando.
5. Links externos só são aceitos por lista explícita de domínios e caminhos de serviços oficiais.

## Limites restantes

- Não há nova fonte de transmissão de Premiere integrada. A auditoria anterior mostrou HTTP 403 na única URL de Premiere 2-8 de cada canal e não identificou alternativa autorizada.
- A disponibilidade de servidores e a reprodução devem ser verificadas em rede/browser de produção; não confundir o catálogo com a mídia.
- O deploy na Vercel depende da liberação do limite de uso da equipe (HTTP 402), conforme bloqueio observado em 18/11/2026.
- Para ingestão própria, configurar uma playlist HTTPS licenciada via `ZANG_TV_CATALOG_URLS` e `ZANG_TV_LICENSED_ONLY=1`, como descrito em `docs/tv-authorized-sources.md`. Uma URL pública de outro portal não confere direitos de retransmissão.
