"use client";
import { AnimeIcon } from "@/components/icons/ContentIcons";

// src/components/tv/ChannelCard.tsx — glass channel card with actual EPG programme.
import { useEffect, useState } from "react";
import { Clapperboard, Film, Music2, Newspaper, Play, Heart, Trophy, Tv2 } from "lucide-react";
import type { CanalTV } from "@/lib/canais";
import { resolveChannelProgram, type ProgramSlot } from "@/lib/tv-program";

export interface ChannelCardProps {
  channel: CanalTV;
  active: boolean;
  favorite: boolean;
  onSelect: () => void;
  onFavorite: () => void;
  listMode: boolean;
  slot?: ProgramSlot | undefined;
  guideLoading: boolean;
  nowMs: number;
}

function ChannelCrest({ channel }: { channel: CanalTV }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [channel.logo]);
  return (
    <span className="ztv-logo">
      {channel.logo && !failed && /^https?:\/\//i.test(channel.logo) ? (
        <img src={channel.logo} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
      ) : <span aria-hidden="true">{channel.nome.trim().slice(0, 3).toUpperCase() || "TV"}</span>}
    </span>
  );
}

export function ChannelCard({
  channel, active, favorite, onSelect, onFavorite, listMode, slot, guideLoading, nowMs,
}: ChannelCardProps) {
  const available = channel.fontes.length > 0;
  const preview = resolveChannelProgram(slot, channel.categoria + " " + channel.nome, nowMs);
  const KindIcon = preview.kind === "Filme" ? Film :
    preview.kind === "Série" || preview.kind === "Filmes e séries" ? Clapperboard :
    preview.kind === "Anime" ? AnimeIcon :
    preview.kind === "Esportes" ? Trophy :
    preview.kind === "Notícias" ? Newspaper :
    preview.kind === "Música" ? Music2 : Tv2;
  const tone = preview.kind === "Filme" ? "is-movie" :
    preview.kind === "Série" ? "is-series" :
    preview.kind === "Anime" ? "is-anime" :
    preview.kind === "Esportes" ? "is-sports" : "is-tv";
  const onAir = preview.status === "agora";
  const title = preview.title || (
    guideLoading ? "Buscando programação…" :
    preview.nextTitle ? "Aguardando próximo programa" : "Programação não informada"
  );
  const label = onAir ? "AGORA PASSANDO" :
    preview.status === "em-breve" ? "EM BREVE" : "GRADE DO CANAL";
  const time = [preview.startTime, preview.endTime].filter(Boolean).join(" – ");
  return (
    <article className={"ztv-card ztv-card-glass" + (active ? " is-active" : "") +
      (!available ? " is-unavailable" : "") + (listMode ? " is-list" : "")}>
      <button
        className="ztv-card-main" type="button" onClick={onSelect}
        aria-label={"Assistir " + channel.nome +
          (preview.title ? ", agora: " + preview.title : "") +
          (available ? "" : " — sem fontes")}
        aria-current={active ? "true" : undefined}
      >
        <span className="ztv-card-topline">
          <span className={"ztv-type-pill " + tone}><KindIcon size={12} /> {preview.kind}</span>
          {active ? <span className="ztv-card-active-pill">ASSISTINDO</span> :
            onAir ? <span className="ztv-card-live-pill"><span className="ztv-pulse" /> AGORA</span> : null}
        </span>
        <span className="ztv-card-identity">
          <ChannelCrest channel={channel} />
          <span className="ztv-card-body">
            <strong title={channel.nome}>{channel.nome}</strong>
            <span className="ztv-card-category">{channel.categoria}</span>
          </span>
        </span>
        <span className={"ztv-card-program" + (onAir ? " has-guide" : "")}>
          <span className="ztv-card-program-top">
            <span className="ztv-card-program-kicker">{label}</span>
            {onAir && time && <span className="ztv-card-program-time">{time}</span>}
          </span>
          <strong className={"ztv-card-program-title" + (!preview.title ? " is-placeholder" : "")}
            title={preview.title || undefined}>{title}</strong>
          {preview.description &&
            <span className="ztv-card-program-desc" title={preview.description}>{preview.description}</span>}
          <span className="ztv-card-next">
            {onAir && preview.nextTitle
              ? <>Em seguida: <b title={preview.nextTitle}>{preview.nextTitle}</b>
                  {preview.nextTime && <small> · {preview.nextTime}</small>}</>
              : preview.status === "em-breve" && preview.nextTitle
              ? <>Próximo: <b title={preview.nextTitle}>{preview.nextTitle}</b>
                  {preview.nextTime && <small> · {preview.nextTime}</small>}</>
              : preview.status === "sem-grade"
              ? "Horários ainda não divulgados" : "Confira os próximos horários no guia"}
          </span>
        </span>
        <span className="ztv-card-bottom">
          <span className="ztv-card-meta">
            <span className={"ztv-status-dot" + (available ? " is-on" : " is-off")} />
            {available ? channel.fontes.length + (channel.fontes.length === 1 ? " fonte" : " fontes") : "Sem fonte"}
          </span>
          <span className="ztv-card-watch"><Play size={13} fill="currentColor" /> Assistir</span>
        </span>
      </button>
      <button
        type="button" className={"ztv-card-star" + (favorite ? " is-favorite" : "")}
        onClick={onFavorite} aria-label={(favorite ? "Remover " : "Favoritar ") + channel.nome}
        title={favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
      >
        <Heart size={17} fill={favorite ? "currentColor" : "none"} />
      </button>
    </article>
  );
}
