/** Deterministic D-pad focus manager for the TV-only routes.
 * Uses one capture listener; never participates in the desktop/mobile UI.
 */
import { useEffect, type RefObject } from "react";
import { remoteKey } from "@/lib/tv-remote";

export type TvDirection = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown";
export interface TvPosition { row: number; column: number }
export const TV_FOCUS_SELECTOR = "[data-tv-focus]:not([disabled])";

export function tvNextPosition(position: TvPosition, lengths: readonly number[], key: TvDirection): TvPosition {
  const row = Math.max(0, Math.min(lengths.length - 1, position.row));
  const col = Math.max(0, Math.min((lengths[row] ?? 1) - 1, position.column));
  if (key === "ArrowLeft") return { row, column: Math.max(0, col - 1) };
  if (key === "ArrowRight") return { row, column: Math.min((lengths[row] ?? 1) - 1, col + 1) };
  const next = Math.max(0, Math.min(lengths.length - 1, row + (key === "ArrowDown" ? 1 : -1)));
  return { row: next, column: Math.max(0, Math.min((lengths[next] ?? 1) - 1, col)) };
}

export function tvPersistFocus(route: string, id: string) {
  try { window.sessionStorage.setItem("zf-tv-focus:" + route, id); } catch { /* private mode */ }
}
export function tvReadFocus(route: string) {
  try { return window.sessionStorage.getItem("zf-tv-focus:" + route) ?? ""; } catch { return ""; }
}

function canFocus(el: HTMLElement) {
  if (!el.getClientRects().length || el.closest("[inert],[hidden],[aria-hidden='true']")) return false;
  return window.getComputedStyle(el).visibility !== "hidden";
}

function focusTarget(el: HTMLElement | undefined) {
  if (!el) return false;
  el.focus({ preventScroll: true });
  // Avoid expensive smooth scrolling and focus animations on lower-end TV SoCs.
  el.scrollIntoView({ behavior: "instant", block: "nearest", inline: "nearest" });
  return true;
}

export interface TvFocusOptions {
  route: string;
  root: RefObject<HTMLElement | null>;
  onBack?: () => void;
  /** When a player is open, let it handle its own control bar. */
  playerOpen?: boolean;
}

export function useTvFocus({ route, root, onBack, playerOpen = false }: TvFocusOptions) {
  useEffect(() => {
    const container = root.current;
    if (!container) return;
    let frame = requestAnimationFrame(() => {
      const remembered = tvReadFocus(route);
      const controls = [...container.querySelectorAll<HTMLElement>(TV_FOCUS_SELECTOR)].filter(canFocus);
      const target = controls.find(el => el.dataset["tvFocus"] === remembered) ??
        controls.find(el => el.hasAttribute("data-tv-start")) ?? controls[0];
      focusTarget(target);
    });
    const remember = (ev: FocusEvent) => {
      if (ev.target instanceof HTMLElement && ev.target.dataset["tvFocus"])
        tvPersistFocus(route, ev.target.dataset["tvFocus"]!);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey) return;
      const key = remoteKey(event);
      if (key === "BrowserBack" || key === "Escape" ||
        (key === "Backspace" && !(event.target instanceof HTMLInputElement))) {
        if (!onBack) return;
        event.preventDefault(); event.stopImmediatePropagation(); onBack();
        return;
      }
      if (playerOpen) return;
      const active = document.activeElement;
      if (key === "Select" || (key === "Enter" && event.keyCode === 23)) {
        if (active instanceof HTMLElement && container.contains(active)) {
          event.preventDefault(); event.stopImmediatePropagation(); active.click();
        }
        return;
      }
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(key)) return;
      if (active instanceof HTMLElement && active.matches("input,textarea,[contenteditable='true']")) {
        // TV keyboard owns horizontal arrows; Down can enter the suggestions list.
        if (key !== "ArrowDown") return;
      }
      const controls = [...container.querySelectorAll<HTMLElement>(TV_FOCUS_SELECTOR)].filter(canFocus);
      if (!controls.length) return;
      if (!(active instanceof HTMLElement) || !controls.includes(active)) {
        event.preventDefault(); event.stopImmediatePropagation();
        focusTarget(controls.find(el => el.hasAttribute("data-tv-start")) ?? controls[0]);
        return;
      }
      const rows = new Map<string, HTMLElement[]>();
      for (const element of controls) {
        const name = element.closest<HTMLElement>("[data-tv-row]")?.dataset["tvRow"] ?? "header";
        if (!rows.has(name)) rows.set(name, []);
        rows.get(name)!.push(element);
      }
      const groups = [...rows.values()];
      const currentRow = groups.findIndex(group => group.includes(active));
      if (currentRow < 0) return;
      const position: TvPosition = { row: currentRow, column: groups[currentRow]!.indexOf(active) };
      const next = tvNextPosition(position, groups.map(group => group.length), key as TvDirection);
      const destination = groups[next.row]?.[next.column];
      // Trap end-of-row: do not jump from a card to an unrelated menu item.
      event.preventDefault(); event.stopImmediatePropagation();
      focusTarget(destination);
    };
    container.addEventListener("focusin", remember);
    document.addEventListener("keydown", onKey, true);
    return () => {
      cancelAnimationFrame(frame);
      container.removeEventListener("focusin", remember);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [route, root, onBack, playerOpen]);
}
