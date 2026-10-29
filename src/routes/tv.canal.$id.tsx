import { createFileRoute } from "@tanstack/react-router";
import { TvView } from "@/components/tv/TvView";

export const Route = createFileRoute("/tv/canal/$id")({
  component: TvCanalPage,
  head: () => ({
    meta: [
      { title: "Canal Ao Vivo — Zang Flix" },
      { name: "description", content: "Assista a canais de TV ao vivo com alta definição no Zang Flix." },
    ],
  }),
});

function TvCanalPage() {
  const { id } = Route.useParams();
  return <TvView initialCanalId={id} />;
}
