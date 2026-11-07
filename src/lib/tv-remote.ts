// src/lib/tv-remote.ts — pure spatial scoring + remote keyboard navigation.
export type RemoteDirection = "up" | "down" | "left" | "right";
export interface FocusRect { left: number; top: number; width: number; height: number; }

export function spatialFocusScore(from: FocusRect, to: FocusRect, direction: RemoteDirection): number | null {
  const fx = from.left + from.width / 2;
  const fy = from.top + from.height / 2;
  const tx = to.left + to.width / 2;
  const ty = to.top + to.height / 2;
  const dx = tx - fx, dy = ty - fy;
  const forward = direction === "right" ? dx : direction === "left" ? -dx
    : direction === "down" ? dy : -dy;
  if (forward <= 2) return null;
  const lateral = direction === "right" || direction === "left" ? Math.abs(dy) : Math.abs(dx);
  // Prefer a strongly aligned control, then its distance. Do not jump rows
  // when a closer button is on the current navigation line.
  return forward + lateral * 2.3 + (lateral > forward * 2 ? lateral * 0.7 : 0);
}

const SELECTOR = [
  "a[href]", "button:not([disabled])", "input:not([disabled])",
  "select:not([disabled])", "textarea:not([disabled])",
  "[role=button][tabindex]", "[tabindex]:not([tabindex='-1'])",
].join(",");

function visibleElement(node: HTMLElement): boolean {
  if (node.closest("[inert], [aria-hidden='true']")) return false;
  if (!node.getClientRects().length) return false;
  const style = window.getComputedStyle(node);
  if (style.visibility === "hidden" || style.display === "none" || style.pointerEvents === "none") return false;
  const r = node.getBoundingClientRect();
  return r.width > 1 && r.height > 1;
}

function asRect(rect: DOMRect): FocusRect {
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

export function installTvRemoteNavigation(): () => void {
  const handler = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey) return;
    const direction: RemoteDirection | null = event.key === "ArrowUp" ? "up"
      : event.key === "ArrowDown" ? "down" : event.key === "ArrowLeft" ? "left"
      : event.key === "ArrowRight" ? "right" : null;
    if (!direction || document.fullscreenElement) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest("input,textarea,select,[contenteditable='true'],[role='slider'],[data-native-arrows]")) return;
    const focusable = [...document.querySelectorAll<HTMLElement>(SELECTOR)]
      .filter(visibleElement);
    if (!focusable.length) return;
    const current = document.activeElement instanceof HTMLElement &&
      visibleElement(document.activeElement) ? document.activeElement : null;
    if (!current || !focusable.includes(current)) {
      event.preventDefault();
      (focusable.find(node => node.closest(".ydo-header")) || focusable[0])?.focus({ preventScroll:true });
      return;
    }
    const rect = asRect(current.getBoundingClientRect());
    let best: HTMLElement | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const candidate of focusable) {
      if (candidate === current) continue;
      const score = spatialFocusScore(rect, asRect(candidate.getBoundingClientRect()), direction);
      if (score !== null && score < bestScore) {
        bestScore = score;
        best = candidate;
      }
    }
    if (best) {
      event.preventDefault();
      best.focus({ preventScroll:true });
      best.scrollIntoView({ block:"nearest", inline:"nearest", behavior:"smooth" });
    }
  };
  document.addEventListener("keydown", handler);
  return () => document.removeEventListener("keydown", handler);
}
