"use client";
// src/components/catalog/EpisodeProgressControls.tsx — shared anime / series completion status.
import { CheckCheck, CircleCheck, CirclePlay, PlayCircle, RotateCcw } from "lucide-react";
import { getEpisodePercentage, getEpisodeProgress, getEpisodeStatus, setEpisodeWatched,
  type EpisodeKey } from "@/lib/episode-progress";

interface Props {
  episode: EpisodeKey;
  onUpdate?: (() => void) | undefined;
}
export function EpisodeProgressControls({ episode, onUpdate }: Props) {
  const progress = getEpisodeProgress(episode);
  const state = getEpisodeStatus(progress);
  const percentage = getEpisodePercentage(progress);
  const watched = state === "watched";
  return (
    <div className={"zf-episode-progress-controls is-" + state}>
      <span className="zf-episode-progress-label" aria-live="polite">
        {watched ? <><CheckCheck size={15} /> Assistido</> :
          state === "started" ?
          <><CirclePlay size={15} /> {percentage !== null ? percentage + "% assistido" : "Em andamento"}</> :
          <><PlayCircle size={15} /> Não iniciado</>}
      </span>
      <button
        type="button"
        className={"zf-episode-mark" + (watched ? " is-complete" : "")}
        aria-label={(watched ? "Desmarcar" : "Marcar") + " episódio " + episode.episode + " como assistido"}
        aria-pressed={watched}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setEpisodeWatched(episode, !watched);
          onUpdate?.();
        }}
      >
        {watched ? <RotateCcw size={14} /> : <CircleCheck size={14} />}
        <span>{watched ? "Marcar não assistido" : "Marcar assistido"}</span>
      </button>
      {percentage !== null && !watched && state === "started" &&
        <div className="zf-episode-progress-track" role="progressbar"
          aria-label={"Progresso do episódio " + episode.episode}
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentage}>
          <span style={{ width: percentage + "%" }} />
        </div>}
    </div>
  );
}
