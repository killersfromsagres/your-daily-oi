import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { loadCatalog, getGenres, searchItems } from "./lib/catalog";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

function jsonResponse(payload: unknown, status = 200, cacheControl = "public, max-age=3600, stale-while-revalidate=86400"): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": cacheControl,
      "access-control-allow-origin": "*",
    },
  });
}

/**
 * Route Handler /api/catalogo com cache de 6 a 24 horas
 */
async function handleCatalogoApi(url: URL): Promise<Response> {
  try {
    const q = url.searchParams.get("q");
    const { items, highlights } = await loadCatalog();

    if (q) {
      const results = searchItems(items, q).slice(0, 50);
      return jsonResponse({ items: results });
    }

    return jsonResponse({
      items: Array.from(items.values()),
      highlights,
      genres: getGenres(items),
    });
  } catch (error) {
    console.error("Erro na API /api/catalogo:", error);
    return jsonResponse(
      { error: "Falha ao carregar acervo do Saimo TV", details: String(error) },
      502
    );
  }
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const url = new URL(request.url);

      // Route Handler dedicado para o catálogo
      if (url.pathname === "/api/catalogo") {
        return await handleCatalogoApi(url);
      }

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
