# Auditoria comparativa ZANG FLIX × Saimo — 13 de novembro de 2026

## Escopo e método

Execução GitHub Actions [43422170559](https://github.com/killersfromsagres/your-daily-oi/actions/runs/43422170559), commit `b15dba768de3e45f7ddd69988291eb4ee6e62300`, sondou as duas listas públicas de TV do Saimo, consultou o catálogo de produção do ZANG FLIX e verificou as fontes por requisições HTTP curtas, sem armazenar vídeo. A comparação respeita a integridade dos catálogos e não prova a reprodução no navegador, a validade de credenciais/DRM nem a disponibilidade em todas as regiões.

- Canais da referência: **257**. Canais ZANG FLIX: **257**. Ausentes: **0**.
- Fontes declaradas e avaliadas: **360**. Canais sem fontes: **42**.
- Sondagem direta das 360 origens: **150** respostas compatíveis com mídia, **165** HTTP 403, **41** erros de rede e as restantes com outras respostas (incluindo HTTP 404).
- Comparação de endpoints Saimo `/api/proxy` e ZANG `/api/tv/stream`: **85** com resposta compatível com mídia em ambos; **62** apenas no ZANG; **1** apenas no Saimo; **212** sem comprovação em ambos.

Relatório completo: artefato `zang-saimo-full-tv-audit` na execução acima, contendo `tv-health-audit.json`, `tv-saimo-zang-parity.json` e `tv-saimo-zang-parity.csv`. Cada fonte tem código HTTP, categoria e resultado sem token de URL divulgado.

## Divergências reproduzíveis

| Canal | Observação | Situação |
|---|---|---|
| TV Câmara | Fonte oficial respondia no Saimo mas a ordem local privilegiava outra fonte. | **Corrigida a priorização**; ambas APIs entregaram candidato HLS no teste posterior. |
| NickOnline | Duas origens no Saimo respondiam HTTP 218 com MIME HLS, mas sem manifesto `#EXTM3U` válido. ZANG retornava erro de origem. | **Não há reprodução comprovada em nenhum lado**; não contar HTTP 218 como sucesso. |
| Globo Bahia | Saimo retorna HLS válido HTTP 200 em cerca de **280 ms**; ZANG não respondeu antes de **6 s** nem **20 s** em GitHub Actions US. | **Pendente**: diferença comprovada de conectividade entre as plataformas. Não há confirmação de reprodução no ZANG. |

A sonda independente da Globo Bahia foi executada em [43422652634](https://github.com/killersfromsagres/your-daily-oi/actions/runs/43422652634) e mediu `Saimo 200/280ms`, `ZANG timeout/6002ms`, `ZANG timeout/20001ms`. Um manifesto acessível numa rede não significa que a Vercel consegue alcançar o mesmo servidor.

## Defeitos corrigidos no repositório

1. **Índices de fonte desatualizados**: identificador de fonte vinculado à URL, busca correspondente no backend e tentativa de rota alternativa quando o catálogo remoto mudou.
2. **Detecção de formato divergente**: rota `/api/live-format` também valida a assinatura da fonte.
3. **Headers inventados**: para canais públicos sem identidade configurada, o proxy deixa de enviar Referer/Origin artificiais na primeira tentativa.
4. **Ordem de espelhos**: fonte oficial da TV Câmara priorizada; origens sem CORS tentam proxy primeiro.
5. **Falha Node/Undici**: um HLS/DASH inválido consumia `res.text()` e depois tentava reutilizar o corpo já consumido, gerando `TypeError: Response body object should not be disturbed or locked`. Agora a resposta inválida termina com erro 502 explícito e permite failover.
6. **Auditoria reproduzível**: workflow diário e disparo manual; valida assinatura, verifica origens e compara o Saimo com a versão publicada.

## Limites e próximos requisitos

- **257 canais comparados por catálogo e HTTP**, mas **não testados individualmente com reprodução contínua de vídeo**.
- Fontes protegidas por DRM não foram reproduzidas neste diagnóstico.
- Os **42 canais sem fontes** não podem ser recuperados apenas por mudança de interface.
- A **Globo Bahia ainda precisa de rota de rede ou origem autorizada acessível pela Vercel**, além de um teste de reprodução real no navegador. Não declarar como resolvido.

Verificador automatizado: `.github/workflows/audit-all-tv-channels.yml` (execução agendada diariamente e acionamento manual).
