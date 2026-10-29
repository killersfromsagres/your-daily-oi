import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/tv")({
  component: TvLayout,
});

function TvLayout() {
  return <Outlet />;
}
