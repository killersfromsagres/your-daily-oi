/** Pure navigation utilities for the existing ZANG FLIX horror selection. */
export const HORROR_SPOTLIGHT_PAGE_SIZE = 4;

export function horrorSpotlightWindow<T>(
  items: readonly T[],
  selectedIndex: number,
): {item: T; index: number; offset: number}[] {
  const total = items.length;
  if (!total) return [];
  const offsets = total >= 5 ? [-2, -1, 0, 1, 2] :
    total === 4 ? [-1, 0, 1, 2] :
    total === 3 ? [-1, 0, 1] :
    total === 2 ? [0, 1] : [0];
  const safeIndex = ((selectedIndex % total) + total) % total;
  return offsets.map(offset => {
    const index = (safeIndex + offset + total) % total;
    return { item: items[index], index, offset };
  });
}

export function horrorSpotlightNext(index: number, direction: -1 | 1, total: number): number {
  return total > 0 ? ((index + direction) % total + total) % total : 0;
}

export function horrorSpotlightPages(total: number): number {
  return Math.ceil(Math.max(0, total) / HORROR_SPOTLIGHT_PAGE_SIZE);
}
