import { createFileRoute } from "@tanstack/react-router";
import { TvView } from "@/components/tv/TvView";

export const Route = createFileRoute("/tv/")({
  component: TvIndexPage,
  head: () => ({
    meta: [
      { title: "TV Ao Vivo — Zang Flix" },
      { name: "description", content: "Zang Live: catálogo atualizado, seleção de canais, EPG e reprodução por fontes alternativas." },
    ],
  }),
});

function TvIndexPage() {
  return <TvView />;
}
