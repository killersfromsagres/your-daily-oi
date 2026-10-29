import { createFileRoute } from "@tanstack/react-router";
import { RadiosView } from "@/components/tv/RadiosView";

export const Route = createFileRoute("/tv/radios")({
  component: RadiosPage,
  head: () => ({
    meta: [
      { title: "Rádios Online — Zang Flix" },
      { name: "description", content: "Ouça a centenas de emissoras de rádio ao vivo no Zang Flix." },
    ],
  }),
});

function RadiosPage() {
  return <RadiosView />;
}
