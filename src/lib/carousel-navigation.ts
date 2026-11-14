/** Shared, deterministic carousel geometry for horror and catalogue rails. */
export type CarouselDirection = "left" | "right";

export interface CarouselDimensions {
  scrollLeft: number;
  clientWidth: number;
  scrollWidth: number;
}

const EDGE_EPSILON = 3;

export function carouselEdges({ scrollLeft, clientWidth, scrollWidth }: CarouselDimensions) {
  const remaining = Math.max(0, scrollWidth - clientWidth);
  return {
    canLeft: remaining > EDGE_EPSILON && scrollLeft > EDGE_EPSILON,
    canRight: remaining > EDGE_EPSILON && scrollLeft < remaining - EDGE_EPSILON,
  };
}

/** Advances an integral number of cards (or one card on narrow phones). */
export function nextCarouselPosition(
  dims: CarouselDimensions,
  direction: CarouselDirection,
  cardStride = 192,
): number {
  const max = Math.max(0, dims.scrollWidth - dims.clientWidth);
  if (max === 0) return 0;
  const stride = Math.max(1, cardStride);
  const cardsPerPage = Math.max(1, Math.floor((dims.clientWidth * 0.78) / stride));
  const amount = cardsPerPage * stride;
  return Math.min(max, Math.max(0, dims.scrollLeft + (direction === "left" ? -amount : amount)));
}
