// Gerenciamento de cache negativo de fontes que falharam no cliente (expiração: 1h)

const STORAGE_KEY = "zangflix_failed_sources_v1";
const ONE_HOUR = 60 * 60 * 1000;

interface FailedRecord {
  url: string;
  timestamp: number;
}

export function getFailedUrls(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const list: FailedRecord[] = JSON.parse(raw);
    const now = Date.now();
    const valid = list.filter((item) => now - item.timestamp < ONE_HOUR);
    if (valid.length !== list.length) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(valid));
    }
    return new Set(valid.map((v) => v.url));
  } catch {
    return new Set();
  }
}

export function recordFailedSource(url: string) {
  if (typeof window === "undefined" || !url) return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list: FailedRecord[] = raw ? JSON.parse(raw) : [];
    const now = Date.now();
    const updated = list.filter((i) => i.url !== url && now - i.timestamp < ONE_HOUR);
    updated.push({ url, timestamp: now });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // ignora
  }
}

export function clearFailedSources() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignora
  }
}

/**
 * Ordena fontes colocando as que falharam recentemente para o fim da lista
 */
export function sortStreamsByHealth<T extends { url: string }>(streams: T[]): T[] {
  const failed = getFailedUrls();
  const healthy: T[] = [];
  const degraded: T[] = [];

  for (const s of streams) {
    if (failed.has(s.url)) {
      degraded.push(s);
    } else {
      healthy.push(s);
    }
  }

  return [...healthy, ...degraded];
}
