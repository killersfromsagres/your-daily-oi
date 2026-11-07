/**
 * Fontes remotas Saimo: timeout, failover, validação e erros observáveis.
 * Não confunde HTML de bloqueio/404 com dados válidos.
 */
export interface SourceResult {
  url: string;
  text: string;
}

export function sourceUrls(input: string | undefined, defaults: string[] = []): string[] {
  const supplied = (input ?? "")
    .split(/[\n,;]+/)
    .map((url) => url.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  return [...new Set([...supplied, ...defaults.map((u) => u.replace(/\/+$/, ""))])].filter(
    (url) => /^https:\/\//i.test(url),
  );
}

export class SourceUnavailableError extends Error {
  constructor(
    public readonly details: string[],
    public readonly context: string,
  ) {
    super(`Fontes de ${context} indisponíveis: ${details.join("; ")}`);
    this.name = "SourceUnavailableError";
  }
}

export async function fetchFirstText(
  urls: string[],
  context: string,
  options: { timeoutMs?: number; maxBytes?: number } = {},
): Promise<SourceResult> {
  const timeoutMs = options.timeoutMs ?? 6500;
  const maxBytes = options.maxBytes ?? 12 * 1024 * 1024;
  const errors: string[] = [];
  for (const url of [...new Set(urls)]) {
    if (!/^https:\/\//i.test(url)) {
      errors.push("URL não HTTPS ignorada");
      continue;
    }
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { Accept: "text/plain, application/x-mpegURL, */*" },
        redirect: "follow",
        cache: "no-store",
      });
      if (!response.ok) {
        errors.push(`${new URL(url).host}: HTTP ${response.status}`);
        continue;
      }
      const size = Number(response.headers.get("content-length") ?? 0);
      if (size > maxBytes) {
        errors.push(`${new URL(url).host}: tamanho excedido`);
        continue;
      }
      const text = await response.text();
      if (text.length > maxBytes) {
        errors.push(`${new URL(url).host}: resposta excedeu limite`);
        continue;
      }
      if (!text.trim() || /^\s*<(?:!doctype\s+html|html|head|body)\b/i.test(text)) {
        errors.push(`${new URL(url).host}: arquivo vazio ou HTML inesperado`);
        continue;
      }
      return { url, text };
    } catch (error) {
      const reason = error instanceof Error ? error.name : "erro de rede";
      errors.push(`${new URL(url).host}: ${reason}`);
    }
  }
  throw new SourceUnavailableError(errors, context);
}
