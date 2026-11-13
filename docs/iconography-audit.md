# ZANG FLIX — revisão de iconografia

Auditoria de todas as telas e componentes TSX do aplicativo. O comando
`node scripts/audit-iconography.mjs` repete a inspeção em cada alteração.

## Convenção visual

Grade vetorial de 24 px, traço de 1,8 px, terminais arredondados e cor herdada.
Os tamanhos de cada botão e suas áreas de toque continuam definidos pela tela.
As marcas de canais, equipes, plataformas e o logotipo ZANG FLIX permanecem
como arte de marca; pictogramas de interface usam uma única família de contorno.

## Substituições aplicadas

| Área | Antes | Agora |
| --- | --- | --- |
| Animes: título, gêneros, estados vazios e clássicos | Brilho de estrela, TV com antena ou filme | Quadros de animação sobrepostos com reprodução |
| Animes: menu inferior e menu expandido | Órbita | Mesmo pictograma de animação |
| Animes: busca e programação de canais | Brilho de estrela | Mesmo pictograma de animação |
| Erro de conexão do catálogo de animes | TV decorativa | Servidor indisponível |
| Séries: gêneros, detalhes e falhas de episódios | TV com antena | Claquete de séries |
| Episódios | Emblema com preenchimentos e traços diferentes | Claquete de contorno da mesma família |
| Futebol no menu expandido | Controle de videogame | Troféu |
| Lançamentos no menu expandido | Bússola | Calendário |
| Competições sem escudo | Escudo com estrela | Troféu de contorno |
| Futebol e atualização da agenda | Bola com preenchimentos; brilho decorativo | Bola de contorno; atualização circular |
| Favoritos de canais | Estrela | Coração, como nos títulos salvos |
| Notas do banner e detalhes | Caractere de estrela dependente da fonte | Estrela SVG de avaliação |
| TV nos atalhos, carregamento e rádio | Televisor com antena | Tela plana |

## Auditoria de controles

Os controles de reprodução, volume, transmissão, tela cheia, pesquisa, fechar,
voltar, filtros e classificação já utilizavam pictogramas funcionais da família
Lucide. Seus significados foram preservados e o traço foi padronizado.
O controle de videogame permanece exclusivamente nas páginas de videogames.
A estrela permanece exclusivamente como símbolo vetorial de avaliação.

## Verificação

- Inspeção estática de todos os módulos TSX, incluindo rotas e controles do player.
- Build da aplicação e testes de regressão existentes.
- Chrome em telas de 320, 390 e 430 px, paisagem e desktop para navegação.
- Capturas específicas de Animes vazio e busca com resultado sem pôster,
  incluindo conferência do mesmo pictograma e do traço em mobile e desktop.
