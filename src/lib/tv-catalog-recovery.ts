import type { CanalTV } from "./canais";

/**
 * A metadata-only snapshot must not disconnect an already-playing TV channel.
 *
 * When an entire live catalog suddenly contains zero playable sources, the
 * response was likely generated from ZANG's saved *metadata* backup while the
 * upstream/Vercel API was offline. Keep the already connected source objects
 * within this browser session; do not mistake channel metadata for new media.
 *
 * A live catalog with at least one source is always authoritative and may
 * legitimately remove or rotate broken source URLs. No new URLs are invented,
 * and a 401/403 from a provider still prevents playback.
 */
export function retainLiveCatalogOnMetadataOutage(
  previous: CanalTV[],
  incoming: CanalTV[],
): CanalTV[] {
  if (!previous.some(channel => channel.fontes.length > 0) ||
      incoming.some(channel => channel.fontes.length > 0)) {
    return incoming;
  }

  const known = new Set(previous.map(channel => channel.id));
  const extraMetadata = incoming.filter(channel => !known.has(channel.id));
  return extraMetadata.length ? [...previous, ...extraMetadata] : previous;
}
