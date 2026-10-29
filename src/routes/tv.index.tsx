import { createFileRoute } from "@tanstack/react-router";
import { TvView } from "@/components/tv/TvView";

export const Route = createFileRoute("/tv/")({
  component: TvIndexPage,
  head: () => ({
    meta: [
      { title: "TV Ao Vivo — Zang Flix" },
      { name: "description", content: "Assista a mais de 400 canais de TV ao vivo com alta definição e transmissão contínua." },
    ],
  }),
});

function TvIndexPage() {
  return <TvView />;
}
