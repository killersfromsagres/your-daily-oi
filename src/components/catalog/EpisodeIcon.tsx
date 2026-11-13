import { SeriesIcon } from "@/components/icons/ContentIcons";

export function EpisodeIcon({ size=22, className }: {size?:number; className?:string|undefined}) {
  return <SeriesIcon size={size} className={className} role="img" aria-label="Episódio" />;
}
