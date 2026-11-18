# ZANG FLIX — arquivo de catálogos independente

## O que fica salvo no GitHub

A pasta src/data/zang-backup/ contém snapshots versionados:

| Arquivo | Preserva | Não preserva |
| --- | --- | --- |
| catalog.json | Filmes, séries e animes (IDs, títulos originais, TMDB, capas e gêneros), destaques | Arquivos de vídeo, links temporários |
| tv.json | Identificação dos canais, categorias e logos | Fluxos IPTV, licenças, chaves DRM |
| sushi.json | Títulos, slugs, gêneros e artes de animes do catálogo externo | Vídeos ou URLs assinadas de episódios |

Os dados ficam **embutidos no build**. A aplicação não precisa de outra chamada ao Saimo para recuperar os nomes quando a origem está indisponível; as importações são lazy para não aumentar o JavaScript inicial.

**Importante:** conservar uma lista de títulos/canais não substitui hospedagem de mídia nem direitos de distribuição. Links de terceiros podem expirar, responder 403 ou mudar de endereço. Os backups públicos deliberadamente não incluem URLs de vídeo, chaves DRM, tokens, cookies ou cabeçalhos privados.

## Recuperação automática no aplicativo

- A API /api/catalogo mescla o catálogo atual com a cópia local. Títulos antigos persistem quando a origem falha ou reduz o catálogo.
- A API /api/canais mescla os nomes salvos dos canais com as fontes atuais. Canais sem transmissão aparecem identificados como indisponíveis, sem inventar reprodução.
- O catálogo /api/animes-sushi usa cards preservados quando o provedor de animes não responde.
- A rotina não substitui um arquivo válido por listas vazias e não cria commits quando nada mudou.

## Backup automático e manual

Abra **GitHub → Actions → Preserve ZANG FLIX catalogs → Run workflow**. A rotina também roda diariamente e após alterações no sistema de backup.

Comando manual (Node 20+): node scripts/backup-zang-metadata.mjs

O script consulta primeiro as APIs dos seus deployments: https://zangflix.lovable.app e https://zangflix.vercel.app. Se não responderem, tenta recuperações de metadados públicos do catálogo. Os dados antigos são sempre conservados. A variável opcional ZANG_BACKUP_OWN_ORIGINS aceita origens HTTPS próprias separadas por vírgulas. Não grave credenciais ou tokens nos arquivos.

O histórico do Git preserva versões anteriores, caso um backup novo venha errado. Os três arquivos em src/data/zang-backup/ são a cópia permanente.

## Como tornar a reprodução independente de terceiros

É necessário usar **provedores de mídia próprios ou licenciados**, não apenas arquivar catálogos. A aplicação suporta:

- ZANG_VOD_CATALOG_URLS — URLs-base HTTPS dos catálogos VOD sob seu controle, com arquivos TXT no formato já utilizado;
- ZANG_TV_CATALOG_URLS — listas M3U/TXT de provedores de TV autorizados;
- ZANG_TV_LICENSED_ONLY=1 — impede fallback automático para as listas externas antigas no servidor de TV;
- NEXT_PUBLIC_SNAPSHOT_URL — espelho de arquivos de catálogo na infraestrutura própria;
- SAIMO_VOD_MIRRORS e SAIMO_VOD_RAW — compatibilidade antiga, que pode ser desabilitada depois da migração.

Defina as variáveis no ambiente de hospedagem. Não publique links com assinaturas, URLs com segredos, credenciais ou arquivos de mídia que você não tem autorização para distribuir.

A disponibilidade final requer origin/CDN licenciado, HLS/MP4/MPEG-TS entregues corretamente, URLs renováveis quando necessário e testes de reprodução reais (não apenas HTTP 200 nas listagens).

## Estado inicial

catalog.json foi iniciado com as fichas locais de animes que já existiam no repositório. tv.json e sushi.json começam vazios e serão preenchidos quando uma fonte consultada estiver acessível. Se os seus próprios sites e os provedores já estiverem fora do ar, não é possível recuperar retroativamente dados que nunca foram copiados.
