import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/tv/canal/")({
  beforeLoad: () => {
    throw redirect({ to: "/tv", replace: true });
  },
  component: () => null,
});
