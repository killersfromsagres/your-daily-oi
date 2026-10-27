import { createServerFn } from "@tanstack/react-start";
import type { StreamSource } from "@/lib/types";

async function isStreamAlive(url: string, timeoutMs = 5000): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timer);
    return res.ok;
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
