"use client";
// src/components/player/CastControl.tsx — React 19/browser; Chromecast, AirPlay and native remote playback.
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Airplay, Cast, LoaderCircle, MonitorPlay, X } from "lucide-react";
import type { FonteTV } from "@/lib/canais";
import { classifyLiveSource } from "@/lib/live-source";
import "@/styles/cast-control.css";

interface CastSession {
  loadMedia: (request: object) => Promise<unknown>;
}
interface CastContext {
  setOptions: (options: { receiverApplicationId: string; autoJoinPolicy?: string }) => void;
  getCurrentSession: () => CastSession | null;
  requestSession: () => Promise<unknown>;
  endCurrentSession: (stopCasting: boolean) => void;
}
interface MediaInfo {
  streamType?: string;
  metadata?: { metadataType: number; title: string };
}
interface CastGlobals {
  __onGCastApiAvailable?: (available: boolean) => void;
  cast?: { framework?: { CastContext?: { getInstance: () => CastContext } } };
  chrome?: { cast?: {
    AutoJoinPolicy?: { ORIGIN_SCOPED: string };
    media?: {
      DEFAULT_MEDIA_RECEIVER_APP_ID: string;
      MediaInfo: new (url: string, contentType: string) => MediaInfo;
      LoadRequest: new (info: MediaInfo) => object;
      StreamType?: { LIVE: string };
    };
  } };
}
type RemoteVideo = HTMLVideoElement & {
  remote?: { prompt: () => Promise<void> };
  webkitShowPlaybackTargetPicker?: () => void;
};
function getCastWindow(): Window & CastGlobals { return window as Window & CastGlobals; }
function getCastContext(): CastContext | null {
  const w = getCastWindow();
  const factory = w.cast?.framework?.CastContext;
  const media = w.chrome?.cast?.media;
  if (!factory || !media) return null;
  const context = factory.getInstance();
  context.setOptions({
    receiverApplicationId: media.DEFAULT_MEDIA_RECEIVER_APP_ID,
    autoJoinPolicy: w.chrome?.cast?.AutoJoinPolicy?.ORIGIN_SCOPED,
  });
  return context;
}
function getCastMime(source?: FonteTV): string | null {
  if (!source || source.chave) return null; // Default receiver does not accept external ClearKey keys.
  switch (classifyLiveSource(source)) {
    case "dash": return "application/dash+xml";
    case "ts": return null; // Raw MPEG-TS requires a compatible receiver/transmuxer.
    case "mp4": return "video/mp4";
    default: return "application/x-mpegURL";
  }
}

export function CastControl({ videoRef, source, streamUrl, channelName }: {
  videoRef: RefObject<HTMLVideoElement | null>;
  source?: FonteTV;
  streamUrl: string;
  channelName: string;
}) {
  const [open, setOpen] = useState(false);
  const [castReady, setCastReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [casting, setCasting] = useState(false);
  const [feedback, setFeedback] = useState("");
  const previousStream = useRef<string | null>(null);
  const castMime = useMemo(() => getCastMime(source), [source]);

  const publicStreamUrl = useMemo(() => {
    if (typeof window === "undefined" || !streamUrl) return null;
    try {
      const url = new URL(streamUrl, window.location.href);
      return url.protocol === "https:" ? url.href : null;
    } catch { return null; }
  }, [streamUrl]);
  const airplayAvailable = typeof window !== "undefined" &&
    typeof (videoRef.current as RemoteVideo | null)?.webkitShowPlaybackTargetPicker === "function";
  const remoteAvailable = typeof window !== "undefined" &&
    typeof (videoRef.current as RemoteVideo | null)?.remote?.prompt === "function";

  useEffect(() => {
    if (!open) return;
    let alive = true;
    const w = getCastWindow();
    const ready = () => {
      if (!alive) return;
      try { setCastReady(Boolean(getCastContext())); }
      catch { setCastReady(false); }
    };
    if (w.cast?.framework?.CastContext) {
      ready();
      return () => { alive = false; };
    }
    const oldHandler = w.__onGCastApiAvailable;
    const handler = (available: boolean) => {
      oldHandler?.(available);
      if (available) ready();
      else if (alive) setFeedback("Google Cast indisponível neste navegador.");
    };
    w.__onGCastApiAvailable = handler;
    const id = "zang-google-cast-sender";
    if (!document.getElementById(id)) {
      const script = document.createElement("script");
      script.id = id;
      script.async = true;
      script.src = "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1";
      script.onerror = () => { if (alive) setFeedback("Não foi possível carregar o Google Cast."); };
      document.head.appendChild(script);
    }
    const timer = window.setTimeout(() => {
      if (alive && !w.cast?.framework?.CastContext) setFeedback("Google Cast não encontrado. Tente o Chrome ou o AirPlay.");
    }, 9000);
    return () => {
      alive = false;
      window.clearTimeout(timer);
      if (w.__onGCastApiAvailable === handler) w.__onGCastApiAvailable = oldHandler;
    };
  }, [open]);

  const loadCastMedia = useCallback(async (context: CastContext) => {
    const media = getCastWindow().chrome?.cast?.media;
    const session = context.getCurrentSession();
    if (!session || !publicStreamUrl || !castMime || !media) throw new Error("Esta fonte não é compatível com a TV.");
    const info = new media.MediaInfo(publicStreamUrl, castMime);
    info.streamType = media.StreamType?.LIVE;
    info.metadata = { metadataType: 0, title: channelName };
    await session.loadMedia(new media.LoadRequest(info));
    videoRef.current?.pause();
    previousStream.current = publicStreamUrl;
  }, [publicStreamUrl, castMime, channelName, videoRef]);

  const connectGoogleCast = async () => {
    if (busy) return;
    setBusy(true); setFeedback("");
    try {
      const context = getCastContext();
      if (!context) throw new Error("Google Cast não disponível. Abra no Chrome e conecte sua TV à mesma rede.");
      if (!publicStreamUrl || !castMime) throw new Error("A fonte atual não pode ser enviada diretamente. Selecione outra fonte no player.");
      if (!context.getCurrentSession()) await context.requestSession();
      await loadCastMedia(context);
      setCasting(true);
      setFeedback("Transmitindo na TV. O controle continua disponível aqui.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Falha ao conectar com a televisão.");
    } finally { setBusy(false); }
  };

  useEffect(() => {
    if (!casting || !publicStreamUrl || previousStream.current === publicStreamUrl) return;
    const context = getCastContext();
    if (!context?.getCurrentSession()) {
      setCasting(false);
      return;
    }
    void loadCastMedia(context).catch(() => {
      setCasting(false);
      setFeedback("A TV não conseguiu mudar para esta fonte.");
    });
  }, [casting, publicStreamUrl, loadCastMedia]);

  const connectNative = () => {
    const video = videoRef.current as RemoteVideo | null;
    if (!video) return;
    setFeedback("");
    if (typeof video.webkitShowPlaybackTargetPicker === "function") {
      video.webkitShowPlaybackTargetPicker();
      return;
    }
    if (video.remote?.prompt) {
      void video.remote.prompt().catch(() => setFeedback("Nenhuma TV compatível encontrada para esta fonte."));
      return;
    }
    setFeedback("Seu navegador não oferece transmissão remota para este vídeo.");
  };

  const stopCasting = () => {
    try { getCastContext()?.endCurrentSession(true); } catch { /* Session already closed. */ }
    previousStream.current = null;
    setCasting(false);
    setFeedback("Transmissão encerrada. Você pode continuar assistindo neste dispositivo.");
    void videoRef.current?.play().catch(() => {});
  };

  return (
    <div className="zang-cast-control">
      <button type="button" className={"ydo-live-ctrl-btn zang-cast-trigger" + (casting ? " is-casting" : "")}
        title="Transmitir para a TV" aria-label="Transmitir para a TV"
        aria-expanded={open} onClick={() => { setOpen(value => !value); setFeedback(""); }}>
        <Cast size={19} /><span>Transmitir</span>
      </button>
      {open && (
        <div className="zang-cast-menu" role="dialog" aria-label="Transmitir para a televisão">
          <div className="zang-cast-head">
            <span className="zang-cast-head-icon"><MonitorPlay size={21} /></span>
            <div><strong>Assistir na TV</strong><small>Escolha como conectar</small></div>
            <button type="button" aria-label="Fechar" onClick={() => setOpen(false)}><X size={16} /></button>
          </div>
          <button type="button" className="zang-cast-option" onClick={() => void connectGoogleCast()}
            disabled={!castReady || !publicStreamUrl || !castMime || busy}>
            {busy ? <LoaderCircle size={21} className="zang-cast-spin" /> : <Cast size={21} />}
            <span><strong>Chromecast / Google TV</strong><small>{castReady ? "Selecionar televisão" : "Procurando Google Cast..."}</small></span>
          </button>
          <button type="button" className="zang-cast-option" onClick={connectNative} disabled={!airplayAvailable && !remoteAvailable}>
            <Airplay size={21} />
            <span><strong>AirPlay / reprodução remota</strong><small>{airplayAvailable || remoteAvailable ? "Procurar dispositivo compatível" : "Indisponível neste navegador"}</small></span>
          </button>
          {casting && <button type="button" className="zang-cast-stop" onClick={stopCasting}>Encerrar transmissão</button>}
          {feedback && <p className="zang-cast-feedback" role="status">{feedback}</p>}
          <p className="zang-cast-hint">A TV precisa estar na mesma rede e aceitar o formato do canal. Fontes com DRM ou bloqueios de origem podem não funcionar.</p>
        </div>
      )}
    </div>
  );
}
