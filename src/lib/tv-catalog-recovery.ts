import type { CanalTV } from "./canais";

/**
 * A metadata-only snapshot must not disconnect an already-playing TV channel.
 * Preserve the actual in-memory source only while playback was confirmed;
 * never fabricate a URL or override a fresh playable provider source.
 */
export function retainLiveCatalogOnMetadataOutage(
  previous: CanalTV[],
  incoming: CanalTV[],
  active: { channelId?: string; playbackConfirmed?: boolean } = {},
): CanalTV[] {
  if (!previous.some(channel => channel.fontes.length > 0)) return incoming;

  // A full metadata-only fallback is not a new playable catalog. Keep the
  // session's sources, as before, while still exposing newly archived names.
  if (!incoming.some(channel => channel.fontes.length > 0)) {
    const known = new Set(previous.map(channel => channel.id));
    const extraMetadata = incoming.filter(channel => !known.has(channel.id));
    return extraMetadata.length ? [...previous, ...extraMetadata] : previous;
  }

  // Partial outages are common with rotating sports feeds. Do not discard
  // the channel that is CURRENTLY playing simply because this snapshot has
  // its metadata but no stream. Other channels use the fresh catalog.
  if (!active.playbackConfirmed || !active.channelId) return incoming;
  const playing = previous.find(channel =>
    channel.id === active.channelId && channel.fontes.length > 0);
  if (!playing) return incoming;

  const refreshed = incoming.find(channel => channel.id === playing.id);
  if (refreshed?.fontes.length) return incoming;
  if (!refreshed) return [...incoming, playing];
  return incoming.map(channel => channel.id === playing.id
    ? { ...channel, fontes: playing.fontes, indisponivel: false }
    : channel);
}

/**
 * Keep object identity for unchanged channels when other entries rotate.
 * Otherwise LivePlayer sees a new fontes array and unnecessarily restarts
 * a perfectly healthy stream after every unrelated catalog change.
 */
export function reuseUnchangedLiveChannels(previous: CanalTV[], incoming: CanalTV[]): CanalTV[] {
  if (!previous.length) return incoming;
  const oldById = new Map(previous.map(channel => [channel.id, channel]));
  return incoming.map(channel => {
    const old = oldById.get(channel.id);
    if (!old || old.nome !== channel.nome || old.logo !== channel.logo ||
        old.categoria !== channel.categoria ||
        old.indisponivel !== channel.indisponivel ||
        old.fontes.length !== channel.fontes.length) return channel;
    const identicalSources = old.fontes.every((source, index) => {
      const next = channel.fontes[index];
      return next && source.url === next.url &&
        source.nome === next.nome && source.qualidade === next.qualidade &&
        source.referer === next.referer && source.agente === next.agente &&
        source.chave === next.chave && source.formato === next.formato;
    });
    return identicalSources ? old : channel;
  });
}
