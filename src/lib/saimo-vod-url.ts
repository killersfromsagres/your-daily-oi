// src/lib/saimo-vod-url.ts — shared browser/server source URL normalization.
export type VodType = "movie" | "series";
export type VodAudio = "dub" | "leg";

export interface SaimoVodParams {
  tipo: VodType;
  id: string;
  versao: VodAudio;
  temp?: number;
  ep?: number;
}

export function parseSaimoVodParams(search: URLSearchParams): SaimoVodParams | null {
  const rawType = search.get("tipo") || search.get("type") || "movie";
  if (!["movie", "series"].includes(rawType)) return null;
  const tipo = rawType as VodType;
  const id = search.get("id") || "";
  if (!/^(?:[1-9]\d{0,11}|tt\d{4,12})$/.test(id)) return null;
  const versao = search.get("versao") === "leg" ? "leg" : "dub";
  const temp = Number(search.get("temp") ?? search.get("s") ?? 1);
  const ep = Number(search.get("ep") ?? search.get("e") ?? 1);
  if (!Number.isInteger(temp) || !Number.isInteger(ep) || temp < 1 || ep < 1 || temp > 1000 || ep > 1000) {
    return null;
  }
  return { tipo, id, versao, temp, ep };
}

export function buildSaimoVodProxyUrl(params: SaimoVodParams): string {
  const query = new URLSearchParams({
    tipo: params.tipo,
    id: params.id,
    versao: params.versao,
  });
  if (params.tipo === "series") {
    query.set("temp", String(params.temp ?? 1));
    query.set("ep", String(params.ep ?? 1));
  }
  return `/api/saimo-vod?${query.toString()}`;
}

/** Public browser-side fallback when the datacenter cannot reach a media CDN. */
export function buildSaimoVodPublicUrl(params: SaimoVodParams): string {
  const upstream = new URL("https://saimo-tv.pages.dev/api/stream");
  upstream.searchParams.set("tipo", params.tipo);
  upstream.searchParams.set("id", params.id);
  upstream.searchParams.set("versao", params.versao);
  if (params.tipo === "series") {
    upstream.searchParams.set("temp", String(params.temp ?? 1));
    upstream.searchParams.set("ep", String(params.ep ?? 1));
  }
  return upstream.toString();
}

export function proxyUrlForSaimoRelay(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.hostname !== "saimo-tv.pages.dev" || url.pathname !== "/api/stream") return null;
    const params = parseSaimoVodParams(url.searchParams);
    return params ? buildSaimoVodProxyUrl(params) : null;
  } catch {
    return null;
  }
}
