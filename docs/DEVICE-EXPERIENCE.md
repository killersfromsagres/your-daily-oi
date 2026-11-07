# ZANG FLIX — experiências Mobile, Web e Smart TV

O site aplica a interface adequada usando características do navegador e tamanho real da janela. A prioridade é **Smart TV identificada por navegador/UA**, **mobile ou tablet por largura/entrada touch**, ou **web desktop** como padrão. Nenhum serviço externo identifica o dispositivo.

## Mobile e tablets

- Cabeçalho compacto com logotipo, busca dedicada (campo com fonte de 16px, evitando zoom involuntário no iOS) e botão Menu.
- Navegação inferior com Início, Filmes, TV ao vivo, Jogos e Menu. O catálogo completo inclui séries, animes, lançamentos, Minha Lista, gêneros e pesquisa.
- Painel lateral com bloqueio de rolagem do fundo, tecla Escape, foco inicial e ciclo de Tab para acessibilidade. Fecha ao mudar de página.
- Insets para notch e home indicator, botões confortáveis ao toque, carrosséis roláveis e ajustes de layout para orientações diferentes.
- Rotas de reprodução /assistir/* omitem a navegação fixa, mantendo o player imersivo.

## Desktop

Continua com navegação horizontal, busca e submenus. O auto-hide por mouse ocioso permanece apenas no desktop, sem afetar touch ou controle remoto. Os submenus também abrem por foco de teclado.

## Smart TV

Detecção de sistemas Tizen, WebOS, Roku, Android TV/Google TV, Fire TV, Apple TV, HbbTV e outros identificadores conhecidos. Interface de 10 pés com elementos maiores, margem de segurança e destaque de foco. Setas direcionais escolhem o controle focável mais próximo na direção indicada; Enter aciona o controle pela ação nativa. Campos de edição, sliders e player em fullscreen mantêm suas próprias teclas.

**Limite:** não é possível identificar com certeza todos os navegadores de TVs por user-agent; alguns se apresentam como desktop. Compatibilidade com codecs, DRM, Cast, controles e engines varia por modelo e versão do aparelho. O site não instala aplicativos nativos.

## Verificações

    bun run test
    bun run build
    bun scripts/smoke-adaptive-navigation.mjs

O último comando exige Chrome ou Chromium e testa a hidratação em três user-agents por meio do Worker construído.
