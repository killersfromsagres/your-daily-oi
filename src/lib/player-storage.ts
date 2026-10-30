// Gerenciamento e limpeza automática de cache do player (TTL: 5 min, self-healing e auto-invalidação por versão)

import { APP_VERSION } from "./version";

const VERSION_KEY = "zangflix:app_build_version";
const STORAGE_KEY = "zangflix_failed_sources_v2";
const LEGACY_STORAGE_KEY = "zangflix_failed_sources_v1";
const SEM_CORS_KEY = "zangflix:sem-cors";
const FAILED_TTL = 5 * 60 * 1000; // 5 minutos (evita bloquear servidores recuperados)

interface FailedRecord {
  url: string;
  timestamp: number;
}

/**
 * Sistema automático de limpeza de cache:
 * 1. Limpa versões legadas e caches de builds anteriores
 * 2. Purga fontes expiradas (> 5 minutos)
 * 3. Evita acúmulo excessivo de memória em navegadores móveis/Smart TVs
 */
export function autoCleanPlayerCache(): { cleaned: boolean; purgedCount: number } {
  if (typeof window === "undefined") return { cleaned: false, purgedCount: 0 };
  let purgedCount = 0;

  try {
    // 1. Limpeza por troca de versão do app
    const storedVersion = localStorage.getItem(VERSION_KEY);
    const currentVersion = `${APP_VERSION.version}-${APP_VERSION.commit}`;

    if (storedVersion !== currentVersion) {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(SEM_CORS_KEY);
      localStorage.setItem(VERSION_KEY, currentVersion);
      console.info(`[AutoClean] Cache de reprodução renovado para a versão ${currentVersion}`);
      return { cleaned: true, purgedCount: 1 };
    }

    // 2. Limpeza de registros expirados no storage atual
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const list: FailedRecord[] = JSON.parse(raw);
      const now = Date.now();
      const valid = list.filter((item) => now - item.timestamp < FAILED_TTL);
      purgedCount = list.length - valid.length;

      if (valid.length === 0) {
        localStorage.removeItem(STORAGE_KEY);
      } else if (valid.length !== list.length) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(valid));
      }
    }

    // 3. Limpeza de chaves legadas soltas
    if (localStorage.getItem(LEGACY_STORAGE_KEY)) {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      purgedCount++;
    }
  } catch (err) {
    console.warn("[AutoClean] Erro ao limpar cache do player:", err);
  }

  return { cleaned: purgedCount > 0, purgedCount };
}

// Execução imediata no carregamento do módulo no navegador
if (typeof window !== "undefined") {
  try {
    autoCleanPlayerCache();
    (window as any).__cleanZangflixCache = clearAllPlayerCaches;
  } catch {}
}

export function getFailedUrls(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const list: FailedRecord[] = JSON.parse(raw);
    const now = Date.now();
    const valid = list.filter((item) => now - item.timestamp < FAILED_TTL);
    if (valid.length !== list.length) {
      if (valid.length > 0) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(valid));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
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
    const updated = list.filter((i) => i.url !== url && now - i.timestamp < FAILED_TTL);
    updated.push({ url, timestamp: now });
    // Mantém no máximo 50 registros recentes para não sobrecarregar
    const capped = updated.slice(-50);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(capped));
  } catch {
    // ignora
  }
}

export function clearFailedSources() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // ignora
  }
}

export function clearAllPlayerCaches() {
  if (typeof window === "undefined") return;
  try {
    clearFailedSources();
    localStorage.removeItem(SEM_CORS_KEY);
    console.info("[ZangFlix] Todos os caches do player foram completamente redefinidos.");
  } catch {}
}

const AUDIO_PREF_KEY = "zangflix:preferred-audio";

export function getPreferredAudio(): "dub" | "leg" {
  if (typeof window === "undefined") return "dub";
  try {
    const val = localStorage.getItem(AUDIO_PREF_KEY);
    if (val === "leg" || val === "dub") return val;
    return "dub";
  } catch {
    return "dub";
  }
}

export function setPreferredAudio(a: "dub" | "leg"): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(AUDIO_PREF_KEY, a);
  } catch {
    // ignora
  }
}

/**
 * Ordena fontes colocando as que falharam recentemente para o fim da lista,
 * com recuperação automática (self-healing) quando todas falham.
 */
export function sortStreamsByHealth<T extends { url: string }>(streams: T[]): T[] {
  autoCleanPlayerCache();
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

  // Self-Healing: se todas as fontes estiverem marcadas como falhas, limpa o cache imediatamente
  // e dá uma nova chance a todas as fontes
  if (healthy.length === 0 && degraded.length > 0) {
    clearFailedSources();
    return degraded;
  }

  return [...healthy, ...degraded];
}
