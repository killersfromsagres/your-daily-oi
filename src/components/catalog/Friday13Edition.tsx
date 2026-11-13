"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { friday13NextBoundary, isFriday13EditionActive } from "@/lib/friday13-edition";

const Friday13Context = createContext(false);
export function useFriday13Edition() { return useContext(Friday13Context); }

/** The exact expiry is checked again on resume, including suspended mobile tabs. */
export function Friday13EditionProvider({children}:{children:ReactNode}) {
  const [active,setActive] = useState(false);
  useEffect(() => {
    let timer:ReturnType<typeof setTimeout>|undefined;
    const update = () => {
      if (timer) clearTimeout(timer);
      const now = Date.now();
      const enabled = isFriday13EditionActive(now);
      setActive(enabled);
      const root = document.documentElement;
      if (enabled) root.dataset.zfEdition = "friday13";
      else delete root.dataset.zfEdition;
      root.dataset.zfEditionPaused = String(document.hidden);
      const boundary = friday13NextBoundary(now);
      if (boundary !== null) timer = setTimeout(update,Math.min(2147483647,Math.max(1,boundary-now+20)));
    };
    update();
    document.addEventListener("visibilitychange",update);
    window.addEventListener("pageshow",update);
    window.addEventListener("focus",update);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange",update);
      window.removeEventListener("pageshow",update);
      window.removeEventListener("focus",update);
      delete document.documentElement.dataset.zfEdition;
      delete document.documentElement.dataset.zfEditionPaused;
    };
  },[]);
  return <Friday13Context.Provider value={active}>{children}</Friday13Context.Provider>;
}
