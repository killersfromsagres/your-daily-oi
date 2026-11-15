# Fontes de TV ao vivo — configuração de produção

## O que o aplicativo consegue corrigir

O player alterna entre fontes declaradas do mesmo canal, tenta as rotas direta e proxy, monitora travamentos e solicita uma atualização real da lista ao esgotar as opções. O botão **Atualizar** usa `/api/canais?refresh=1`. Por segurança e para reduzir carga externa, o backend limita atualizações forçadas a uma vez por minuto por instância.

**Uma resposta HTTP 403/401 da origem não é um defeito de interface:** o ZANG FLIX não pode conceder permissão nem desbloquear DRM, assinatura ou georrestrição. Canais sem fontes cadastradas também não têm como iniciar vídeo.

## Substituir o catálogo legado por fontes autorizadas

No projeto **zangflix** da Vercel, em **Settings → Environment Variables**, configure estas variáveis na produção:

```env
ZANG_TV_CATALOG_URLS=https://SEU-DOMINIO-AUTORIZADO.example/playlist.m3u
ZANG_TV_LICENSED_ONLY=1
```

A primeira variável aceita uma lista M3U ou TXT publicada via HTTPS e autorizada para retransmissão ou incorporação. Várias URLs podem ser separadas por vírgula ou quebra de linha. A segunda faz o sistema usar **somente** as listas configuradas, sem misturar fontes antigas de `canais-saimo.pages.dev`. Sem ela, a configuração preserva o catálogo legado e acrescenta a fonte própria, por compatibilidade.

O formato TXT aceita entradas como:

```text
canal: Canal Autorizado
categoria: Esportes
fonte: https://stream.seu-provedor-autorizado.example/canal/index.m3u8
```

**Privacidade e direitos de transmissão:** `/api/canais` é público e exibe as URLs de mídia. Não use links com senhas, tokens pessoais permanentes ou credenciais de assinatura nessa rota. Utilize somente fontes que autorizem essa forma de distribuição. Links de serviços pagos precisam do fluxo oficial de login/licenciamento e das tecnologias DRM apropriadas; um M3U isolado não fornece esses direitos.

Depois de salvar as variáveis, publique novamente o deploy de produção. Verifique `/api/canais?refresh=1` e valide no Chrome/Android se o relógio do vídeo realmente avança. O status **Reprodução confirmada** só aparece após progresso efetivo da mídia.

## Auditoria e observabilidade

O workflow `.github/workflows/audit-all-tv-channels.yml` realiza verificações agendadas de fontes e diagnóstico no navegador. Seus relatórios registram respostas HTTP e amostras de canais, mas não comprovam que *todos* os canais estão acessíveis na rede de cada usuário. Preserve o feedback de disponibilidade no app: **Fonte não verificada**, **Reprodução confirmada** ou **Indisponível na última tentativa**.
