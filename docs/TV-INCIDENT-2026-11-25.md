# Incidente TV — 25/11/2026 (BRT)

## Evidência histórica
- 05h41: auditoria do catálogo externo, 237 canais / 599 fontes declaradas (461 após filtragem). Run 45578423371.
- 11h24: auditoria geral, 275 canais (incluindo metadados), 437 fontes sondadas, 70 canais sem fontes, 178 com candidato a mídia, 27 com todas as sondagens falhas. Run 45633706474.
- 18h44: catálogo externo, 199 canais / 435 fontes declaradas (434 após filtragem). Run 45707060907.
- 20h45: auditoria geral, 275 canais, 351 fontes sondadas, 88 canais sem fontes, 186 com candidato a mídia, 1 com todas as sondagens falhas. Run 45723680352. 49 dos 79 canais de esportes estavam sem fonte.
- A comparação de produção interrompeu-se em HTTP 402 de /api/canais às 11h24 e 20h45. Nenhum teste completo de reprodução no navegador foi executado nessa auditoria. Os resultados anteriores usam MIME como heurística, não comprovam reprodução, autorização, nem disponibilidade no Brasil.
- Não há medida exatamente às 18h00. A perda de entradas externas foi observada entre as duas auditorias do catálogo, não prova o minuto nem o motivo do fornecedor.

## Correções locais
Catálogo degradado por falha de download ou falta total de mídia volta a ser consultado após 60 s, em vez de 10 min. A auditoria exige evidência textual de HLS/DASH e não classifica HTTP 218 como candidato válido. A falha da comparação de produção deixa de impedir build e diagnósticos locais no mesmo workflow. As falhas continuam registradas; nenhum bloqueio HTTP é contornado e nenhuma URL de mídia é adicionada.

## Dependências externas
Restaurar o serviço de hospedagem da produção, verificar a disponibilidade da API e obter fontes autorizadas do fornecedor quando faltarem. Não confundir sondagem com reprodução. Não há evidência suficiente para afirmar que todos os canais foram restaurados.
