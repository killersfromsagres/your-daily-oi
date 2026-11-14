import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { carouselEdges, nextCarouselPosition } from "../src/lib/carousel-navigation";
import { MediaCarousel } from "../src/components/catalog/MediaCarousel";

describe("ZANG FLIX glass rails", () => {
  test("hides both controls when every poster already fits", () => {
    expect(carouselEdges({ scrollLeft: 0, clientWidth: 900, scrollWidth: 840 }))
      .toEqual({ canLeft: false, canRight: false });
    expect(nextCarouselPosition({ scrollLeft: 0, clientWidth: 900, scrollWidth: 840 }, "right")).toBe(0);
  });

  test("only shows the forward arrow at the beginning", () => {
    expect(carouselEdges({ scrollLeft: 0, clientWidth: 600, scrollWidth: 1800 }))
      .toEqual({ canLeft: false, canRight: true });
  });

  test("both arrows are enabled after scrolling and backward closes at zero", () => {
    expect(carouselEdges({ scrollLeft: 450, clientWidth: 600, scrollWidth: 1800 }))
      .toEqual({ canLeft: true, canRight: true });
    expect(nextCarouselPosition({ scrollLeft: 80, clientWidth: 600, scrollWidth: 1800 }, "left", 192)).toBe(0);
  });

  test("advances whole cards and never overshoots the last card", () => {
    expect(nextCarouselPosition({ scrollLeft: 0, clientWidth: 400, scrollWidth: 1500 }, "right", 192)).toBe(192);
    expect(nextCarouselPosition({ scrollLeft: 1090, clientWidth: 400, scrollWidth: 1500 }, "right", 192)).toBe(1100);
    expect(carouselEdges({ scrollLeft: 1100, clientWidth: 400, scrollWidth: 1500 }))
      .toEqual({ canLeft: true, canRight: false });
  });

  test("renders accessible named rail and separate left/right controls", () => {
    const html = renderToStaticMarkup(createElement(MediaCarousel, {
      label: "Mais terror na sua noite",
      itemCount: 2,
      children: [
        createElement("article", { key: "a", className: "ydo-card" }, "Primeiro"),
        createElement("article", { key: "b", className: "ydo-card" }, "Segundo"),
      ],
    }));
    expect(html).toContain('role="region"');
    expect(html).toContain('aria-label="Mais terror na sua noite"');
    expect(html).toContain('aria-label="Ver anteriores em Mais terror na sua noite"');
    expect(html).toContain('aria-label="Ver próximos em Mais terror na sua noite"');
    expect(html).toContain("zf-media-carousel__arrow--left");
    expect(html).toContain("zf-media-carousel__arrow--right");
  });
});
