// src/components/search/useLiveSuggestions.ts — browser; cancellable live search via compact catalog endpoint.
import { useEffect, useMemo, useState } from "react";
import type { SearchSuggestion } from "@/lib/search-suggestions";

export type SuggestionStatus = "idle" | "loading" | "ready" | "error";
type Result = { term: string; status: SuggestionStatus; items: SearchSuggestion[] };
const queryCache = new Map<string, { expires: number; items: SearchSuggestion[] }>();
const CACHE_MS = 90_000;
const MAX_CACHED_QUERIES = 45;

export function useLiveSuggestions(query: string, enabled: boolean) {
  const term = query.trim().replace(/\s+/g, " ").slice(0, 80);
  const [state, setState] = useState<Result>({ term: "", status: "idle", items: [] });

  useEffect(() => {
    if (!enabled || !term) {
      setState({ term, status: "idle", items: [] });
      return;
    }
    const key = term.toLocaleLowerCase("pt-BR");
    const cached = queryCache.get(key);
    if (cached && Date.now() < cached.expires) {
      setState({ term, status: "ready", items: cached.items });
      return;
    }
    const controller = new AbortController();
    setState({ term, status: "loading", items: [] });
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ q: term, suggest: "1" });
      fetch("/api/catalogo?" + params.toString(), {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
        headers: { Accept: "application/json" },
      }).then(async response => {
        if (!response.ok) throw new Error("Sugestões indisponíveis: HTTP " + response.status);
        const json: unknown = await response.json();
        if (!json || typeof json !== "object" || !("items" in json) ||
            !Array.isArray(json.items)) throw new Error("Resposta de sugestões inválida");
        return (json.items as unknown[]).filter((item): item is SearchSuggestion => {
          if (!item || typeof item !== "object") return false;
          const value = item as Partial<SearchSuggestion>;
          return typeof value.id === "string" && typeof value.title === "string" &&
            (value.type === "f" || value.type === "s" || value.type === "a");
        }).slice(0, 8);
      }).then(items => {
        if (controller.signal.aborted) return;
        if (queryCache.size >= MAX_CACHED_QUERIES) queryCache.delete(queryCache.keys().next().value!);
        queryCache.set(key, { expires: Date.now() + CACHE_MS, items });
        setState({ term, status: "ready", items });
      }).catch(error => {
        if (!controller.signal.aborted) {
          console.warn("[Search] Falha temporária nas sugestões:", error);
          setState({ term, status: "error", items: [] });
        }
      });
    }, 160);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [term, enabled]);

  return useMemo(() => {
    if (!enabled || !term) return { suggestions: [], status: "idle" as SuggestionStatus };
    if (state.term !== term) return { suggestions: [], status: "loading" as SuggestionStatus };
    return { suggestions: state.items, status: state.status };
  }, [enabled, state, term]);
}
