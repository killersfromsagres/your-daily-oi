import { useSyncExternalStore } from "react";

// One shared 15-second clock for every game card on both Zang Live and /futebol.
// Avoid 100 intervals for a full league schedule and SSR hydration mismatches.
let value = 0;
let interval: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();
const snapshot = () => value;
const serverSnapshot = () => 0;

function tick() {
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
  value = Date.now();
  listeners.forEach(notify => notify());
}
function onVisible() {
  if (document.visibilityState === "visible") tick();
}
function subscribe(notify: () => void): () => void {
  listeners.add(notify);
  if (interval === null) {
    interval = setInterval(tick, 15_000);
    document.addEventListener("visibilitychange", onVisible);
  }
  tick();
  return () => {
    listeners.delete(notify);
    if (listeners.size === 0 && interval !== null) {
      clearInterval(interval);
      interval = null;
      document.removeEventListener("visibilitychange", onVisible);
    }
  };
}

export function useMatchCardClock(): number {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
