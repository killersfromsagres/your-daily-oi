/**
 * ZANG FLIX's versioned, self-contained metadata backups.
 *
 * These imports are intentionally lazy: catalog.ts is also referenced by
 * browser pages, and a multi-MB archive must NOT enter the initial JS bundle.
 * Never store media URLs, DRM keys, cookies, tokens or other credentials in
 * these public Git files. Restoring a title does not restore playback rights.
 */
import type { CanalTV } from "./canais";
import type { SushiAnimeCard } from "./sushianimes";

export interface ZangCatalogArchive {
  fichas: string;
  destaques: string;
  updatedAt: string | null;
}
const cleanText = (value: unknown, max: number): string =>
  typeof value === "string" ? value.slice(0, max) : "";

export async function loadZangCatalogArchive(): Promise<ZangCatalogArchive | null> {
  try {
    const data: unknown = (await import("../data/zang-backup/catalog.json")).default;
    if (!data || typeof data !== "object") return null;
    const archive = data as Record<string, unknown>;
    if (archive.version !== 1 || typeof archive.fichas !== "string") return null;
    // Only catalog records; reject anything that resembles a stream URL or key.
    const validLines = archive.fichas.split("\n").filter(line => {
      const fields = line.split("\t");
      return ["f", "s", "a"].includes(fields[0] || "") &&
        fields.length >= 4 && Boolean(fields[1]?.trim()) &&
        !/[\r]/.test(line) && !/(?:https?:\/\/|(?:dub|leg|chave|token)=)/i.test(line);
    });
    if (!validLines.length) return null;
    return {
      fichas: validLines.join("\n") + "\n",
      destaques: cleanText(archive.destaques, 2_000_000),
      updatedAt: typeof archive.updatedAt === "string" ? archive.updatedAt : null,
    };
  } catch {
    return null;
  }
}

export async function loadZangTvArchive(): Promise<CanalTV[]> {
  try {
    const data: unknown = (await import("../data/zang-backup/tv.json")).default;
    const records = (data as { version?: unknown; channels?: unknown })?.channels;
    if ((data as {version?: unknown})?.version !== 1 || !Array.isArray(records)) return [];
    const channels: CanalTV[] = [];
    const seen = new Set<string>();
    for (const row of records) {
      if (!row || typeof row !== "object") continue;
      const item = row as Record<string, unknown>;
      if (typeof item.id !== "string" || !/^[a-z0-9-]{1,120}$/.test(item.id) ||
          typeof item.nome !== "string" || !item.nome.trim() ||
          seen.has(item.id)) continue;
      seen.add(item.id);
      const logo = typeof item.logo === "string" && /^https:\/\//i.test(item.logo)
        ? item.logo.slice(0, 512) : undefined;
      channels.push({
        id: item.id,
        nome: item.nome.slice(0, 180),
        categoria: typeof item.categoria === "string" ? item.categoria.slice(0, 100) : "Variedades",
        ...(logo ? {logo} : {}),
        // The archive deliberately does not imply a working broadcast.
        fontes: [],
        indisponivel: true,
      });
    }
    return channels;
  } catch {
    return [];
  }
}

export async function loadZangSushiArchive(): Promise<SushiAnimeCard[]> {
  try {
    const data: unknown = (await import("../data/zang-backup/sushi.json")).default;
    const records = (data as {version?: unknown; items?: unknown})?.items;
    if ((data as {version?: unknown})?.version !== 1 || !Array.isArray(records)) return [];
    const items: SushiAnimeCard[] = [];
    const seen = new Set<string>();
    for (const row of records) {
      if (!row || typeof row !== "object") continue;
      const item = row as Record<string, unknown>;
      if (typeof item.slug !== "string" ||
          !/^[a-z0-9-]{2,160}$/i.test(item.slug) ||
          typeof item.title !== "string" || !item.title.trim() ||
          seen.has(item.slug)) continue;
      seen.add(item.slug);
      const posterUrl = typeof item.posterUrl === "string" &&
        /^https:\/\//i.test(item.posterUrl) ? item.posterUrl.slice(0, 512) : "";
      items.push({
        id: item.slug, slug: item.slug, title: item.title.slice(0, 220),
        posterUrl,
        genres: Array.isArray(item.genres) ? item.genres.filter((g): g is string =>
          typeof g === "string").map(g => g.slice(0, 90)).slice(0, 12) : [],
        audio: item.audio === "dub" ? "dub" : "leg",
        ...(typeof item.quality === "string" ? {quality:item.quality.slice(0, 32)} : {}),
        ...(typeof item.year === "number" && item.year > 1900 && item.year < 2100
          ? {year:item.year} : {}),
      });
    }
    return items;
  } catch {
    return [];
  }
}
