import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
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

  test("installed app, mobile browser, and TV never show desktop carousel overlays", () => {
    const css = readFileSync(new URL("../src/styles/tv-experience.css", import.meta.url), "utf8");
    const source = readFileSync(new URL("../src/components/catalog/MediaCarousel.tsx", import.meta.url), "utf8");
    expect(css).toContain('html[data-zf-platform="mobile"] .zf-media-carousel__arrow');
    expect(css).toContain('html[data-zf-platform="tv"] .zf-media-carousel__fade');
    expect(css).toContain('.zf-media-carousel--installed .zf-media-carousel__arrow');
    expect(css).toContain('(hover: none)');
    expect(css).toContain('(pointer: coarse)');
    expect(css).toContain('(display-mode: standalone)');
    expect(css).toContain('display: none !important');
    expect(source).toContain('detectInstalledZangFlixRuntime()');
    expect(source).toContain('document.documentElement.dataset.zfPlatform !== "web"');
  });

  test("mobile shelves snap to cards and reveal a partial next poster without obscuring covers", () => {
    const css = readFileSync(new URL("../src/styles/tv-experience.css", import.meta.url), "utf8");
    expect(css).toContain('.zf-media-carousel__track > .ydo-card');
    expect(css).toContain('clamp(126px, 34vw, 162px)');
    expect(css).toContain('scroll-snap-type: x mandatory');
    expect(css).toContain('touch-action: pan-x pan-y');
  });

});
