import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import appCss from "../styles.css?url";
import headerCss from "../styles/header.css?url";
import cardsCss from "../styles/cards.css?url";
import heroCss from "../styles/hero.css?url";
import homeCss from "../styles/home.css?url";
import playerCss from "../styles/player.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Header } from "@/components/layout";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0b14] px-4 text-white">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-black text-[#e8b44a]">404</h1>
        <h2 className="mt-4 text-2xl font-bold">Página não encontrada</h2>
        <p className="mt-2 text-sm text-white/60">Este endereço não existe ou foi movido.</p>
        <Link to="/" className="ydo-btn-primary mt-6 inline-flex">Voltar ao Zang Flix</Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  useEffect(() => { reportLovableError(error, { boundary: "tanstack_root_error_component" }); }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0b14] px-4 text-white">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-bold text-white">Erro ao carregar o Zang Flix</h1>
        <p className="mt-2 text-sm text-white/60">Tente novamente ou volte para o catálogo.</p>
        <div className="mt-6 flex justify-center gap-3">
          <button onClick={() => { router.invalidate(); reset(); }} className="ydo-btn-primary">Tentar novamente</button>
          <a href="/" className="ydo-btn-secondary">Ir para o início</a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#0a0b14" },
      { httpEquiv: "Cache-Control", content: "no-cache, no-store, must-revalidate" },
      { httpEquiv: "Pragma", content: "no-cache" },
      { httpEquiv: "Expires", content: "0" },
      { title: "Zang Flix — Filmes e Séries em Alta Definição" },
      { name: "description", content: "Zang Flix reúne filmes e séries em uma experiência cinematográfica completa e fluida." },
      { property: "og:title", content: "Zang Flix — Seu próximo play começa aqui" },
      { property: "og:description", content: "Filmes, séries, animes e doramas com visual premium e player customizado." },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "stylesheet", href: headerCss },
      { rel: "stylesheet", href: cardsCss },
      { rel: "stylesheet", href: heroCss },
      { rel: "stylesheet", href: homeCss },
      { rel: "stylesheet", href: playerCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "preconnect", href: "https://image.tmdb.org" },
      { rel: "preconnect", href: "https://saimo-filmes.pages.dev" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className="dark">
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <div className="ambient-glow" aria-hidden />
      <Header />
      <Outlet />
    </QueryClientProvider>
  );
}
