import { createServerFn } from "@tanstack/react-start";
import type { StreamSource } from "@/lib/types";

const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/**
 * Testa a saúde do stream seguindo redirects com timeout de 5s
 * e User-Agent de navegador.
 */
async function isStreamAlive(url: string, timeoutMs = 5000): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    // Tenta HEAD primeiro
    let res = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": BROWSER_USER_AGENT,
        Accept: "*/*",
      },
    });

    // Se o servidor rejeitar HEAD (405 Method Not Allowed), tenta GET com Range mínimo
    if (res.status === 405) {
      res = await fetch(url, {
        method: "GET",
        signal: controller.signal,
        redirect: "follow",
        headers: {
          "User-Agent": BROWSER_USER_AGENT,
          Range: "bytes=0-100",
          Accept: "*/*",
        },
      });
    }

    clearTimeout(timer);
    return res.ok || res.status === 206;
  } catch {
    return false;
  }
}

export const resolveVod = createServerFn({ method: "GET" })
  .validator((streams: StreamSource[]) => streams)
  .handler(async ({ data: streams }) => {
    // Testa streams em paralelo
    const results = await Promise.all(
      streams.map(async (s) => ({ ...s, alive: await isStreamAlive(s.url) }))
    );
    const alive = results.filter((r) => r.alive);
    const dead = results.filter((r) => !r.alive);
    return {
      stream: alive[0] ?? streams[0],
      alternatives: [...alive.slice(1), ...dead],
    };
  });
