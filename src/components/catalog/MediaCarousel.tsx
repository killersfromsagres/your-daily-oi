import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { carouselEdges, nextCarouselPosition, type CarouselDirection } from "@/lib/carousel-navigation";

interface Props {
  children: ReactNode;
  label: string;
  itemCount: number;
}

/**
 * One reusable rail for horror, films, series and anime.
 * Native touch-swiping remains enabled, while controls work with mouse,
 * keyboard and screen readers without changing the individual media cards.
 */
export function MediaCarousel({ children, label, itemCount }: Props) {
  const id = useId();
  const trackRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ canLeft: false, canRight: false });

  const updateEdges = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const next = carouselEdges({
      scrollLeft: el.scrollLeft,
      clientWidth: el.clientWidth,
      scrollWidth: el.scrollWidth,
    });
    setEdges(previous =>
      previous.canLeft === next.canLeft && previous.canRight === next.canRight
        ? previous : next,
    );
  }, []);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const frame = requestAnimationFrame(updateEdges);
    el.addEventListener("scroll", updateEdges, { passive: true });
    window.addEventListener("resize", updateEdges);

    const observer = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(updateEdges) : null;
    observer?.observe(el);

    // On desktop, the ordinary mouse wheel navigates sideways while it can
    // move the rail. At the first/last card, vertical page scroll works again.
    // Trackpads that already send horizontal delta use native scrolling.
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.defaultPrevented ||
          Math.abs(event.deltaY) <= Math.abs(event.deltaX) ||
          !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
      const direction = event.deltaY > 0 ? "right" : "left";
      const available = carouselEdges(el);
      if (!(direction === "right" ? available.canRight : available.canLeft)) return;
      const scale = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? el.clientWidth : 1;
      event.preventDefault();
      el.scrollLeft += event.deltaY * scale;
    };
    el.addEventListener("wheel", wheel, { passive: false });

    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      el.removeEventListener("scroll", updateEdges);
      el.removeEventListener("wheel", wheel);
      window.removeEventListener("resize", updateEdges);
    };
  }, [itemCount, updateEdges]);

  const navigate = (direction: CarouselDirection) => {
    const el = trackRef.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>(".ydo-card");
    const css = window.getComputedStyle(el);
    const gap = parseFloat(css.columnGap || css.gap || "0") || 0;
    const stride = card ? card.getBoundingClientRect().width + gap : 192;
    const left = nextCarouselPosition(el, direction, stride);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ left, behavior: reducedMotion ? "instant" : "smooth" });
  };

  return (
    <div className="zf-media-carousel">
      <div
        id={id}
        ref={trackRef}
        className="ydo-row-track zf-media-carousel__track"
        role="region"
        aria-label={label}
        tabIndex={0}
      >
        {children}
      </div>
      <div
        className="zf-media-carousel__fade zf-media-carousel__fade--left"
        data-visible={edges.canLeft}
        aria-hidden="true"
      />
      <div
        className="zf-media-carousel__fade zf-media-carousel__fade--right"
        data-visible={edges.canRight}
        aria-hidden="true"
      />
      <button
        type="button"
        className="zf-media-carousel__arrow zf-media-carousel__arrow--left"
        onClick={() => navigate("left")}
        disabled={!edges.canLeft}
        aria-label={"Ver anteriores em " + label}
        aria-controls={id}
        aria-hidden={!edges.canLeft}
        tabIndex={edges.canLeft ? 0 : -1}
      >
        <ChevronLeft size={23} strokeWidth={2.15} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="zf-media-carousel__arrow zf-media-carousel__arrow--right"
        onClick={() => navigate("right")}
        disabled={!edges.canRight}
        aria-label={"Ver próximos em " + label}
        aria-controls={id}
        aria-hidden={!edges.canRight}
        tabIndex={edges.canRight ? 0 : -1}
      >
        <ChevronRight size={23} strokeWidth={2.15} aria-hidden="true" />
      </button>
    </div>
  );
}
