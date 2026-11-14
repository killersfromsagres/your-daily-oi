"use client";
// src/components/player/CastControl.tsx — React 19/browser; Chromecast, AirPlay and native remote playback.
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Airplay, Cast, LoaderCircle, MonitorPlay, Volume2, VolumeX, X } from "lucide-react";
import type { FonteTV } from "@/lib/canais";
import { liveCastCandidates } from "@/lib/cast-source";
import { clampVolume } from "@/lib/live-volume";
import "@/styles/cast-control.css";

interface CastSession {
  loadMedia: (request: object) => Promise<unknown>;
  getVolume?:()=>number|null;
  isMute?:()=>boolean|null;
  setVolume?:(volume:number)=>Promise<unknown>;
  setMute?:(muted:boolean)=>Promise<unknown>;
  getCastDevice?:()=>{friendlyName?:string};
  getMediaSession?:()=>unknown;
}
interface CastContext {
  setOptions: (options: { receiverApplicationId: string; autoJoinPolicy?: string }) => void;
  getCurrentSession: () => CastSession | null;
  requestSession: () => Promise<unknown>;
  endCurrentSession: (stopCasting: boolean) => void;
  addEventListener?:(type:string,handler:()=>void)=>void;
  removeEventListener?:(type:string,handler:()=>void)=>void;
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
  const policy = w.chrome?.cast?.AutoJoinPolicy?.ORIGIN_SCOPED;
  context.setOptions({
    receiverApplicationId: media.DEFAULT_MEDIA_RECEIVER_APP_ID,
    ...(policy ? { autoJoinPolicy: policy } : {}),
  });
  return context;
}
export function CastControl({ videoRef, source, streamUrl, channelName, onDialogChange, settingsOpen = false,channelId,sources }: {
  videoRef: RefObject<HTMLVideoElement | null>;
  source: FonteTV | undefined;
  streamUrl: string;
  channelName: string;
  channelId:string;
  sources:FonteTV[];
  onDialogChange?: (open: boolean) => void;
  settingsOpen?: boolean;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => { onDialogChange?.(open); }, [open, onDialogChange]);
  useEffect(() => { if (settingsOpen) setOpen(false); }, [settingsOpen]);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 740px), (pointer: coarse) and (max-width: 900px)");
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    if (!open || !compact) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, compact]);
  const [castReady, setCastReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [casting, setCasting] = useState(false);
  const [receiverVolume,setReceiverVolume]=useState<number|null>(null);
  const [receiverMuted,setReceiverMuted]=useState(false);
  const [receiverName,setReceiverName]=useState("");
  const [feedback, setFeedback] = useState("");
  const previousStream = useRef<string | null>(null);
  const candidates=useMemo(()=>typeof window==="undefined"?[]:liveCastCandidates({
    origin:window.location.origin,channelId,source,streamUrl,sources,
  }),[channelId,source,streamUrl,sources]);

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
    let context:CastContext|null=null;
    const sync=()=>{
      const session=context?.getCurrentSession();
      setCasting(Boolean(session?.getMediaSession?.()));
      setReceiverName(session?.getCastDevice?.().friendlyName||"Sua TV");
      const level=session?.getVolume?.();setReceiverVolume(typeof level==="number"?clampVolume(level):null);
      setReceiverMuted(session?.isMute?.()===true);
    };
    const w = getCastWindow();
    const ready = () => {
      if (!alive) return;
      try { context=getCastContext();setCastReady(Boolean(context));
        if(context){context.addEventListener?.("sessionstatechanged",sync);sync();}
      }
      catch { setCastReady(false); }
    };
    if (w.cast?.framework?.CastContext) {
      ready();
      const timer=window.setInterval(sync,1200);
      return () => { alive = false;window.clearInterval(timer);context?.removeEventListener?.("sessionstatechanged",sync); };
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
    const poll=window.setInterval(()=>{if(context)sync();},1200);
    const timer = window.setTimeout(() => {
      if (alive && !w.cast?.framework?.CastContext) setFeedback("Google Cast não encontrado. Tente o Chrome ou o AirPlay.");
    }, 9000);
    return () => {
      alive = false;
      window.clearTimeout(timer);window.clearInterval(poll);context?.removeEventListener?.("sessionstatechanged",sync);
      if (w.__onGCastApiAvailable === handler) {
        if (oldHandler) w.__onGCastApiAvailable = oldHandler;
        else delete w.__onGCastApiAvailable;
      }
    };
  }, [open]);

  const loadCastMedia = useCallback(async (context: CastContext) => {
    const media = getCastWindow().chrome?.cast?.media;
    const session = context.getCurrentSession();
    if (!session || !candidates.length || !media) throw new Error("Selecione outra fonte ou abra o aplicativo na TV.");
    let loaded=false;
    for(const candidate of candidates){
      try{
        const info=new media.MediaInfo(candidate.url,candidate.mime);
        if(media.StreamType?.LIVE)info.streamType=media.StreamType.LIVE;
        info.metadata={metadataType:0,title:channelName};
        await session.loadMedia(new media.LoadRequest(info));loaded=true;break;
      }catch{/* Try another compatible source from this same channel. */}
    }
    if(!loaded)throw new Error("A TV não aceitou as fontes deste canal. Abra pelo aplicativo ou navegador da TV.");
    videoRef.current?.pause();
    previousStream.current=publicStreamUrl;
    setReceiverName(session.getCastDevice?.().friendlyName||"Sua TV");
    const level=session.getVolume?.();setReceiverVolume(typeof level==="number"?clampVolume(level):null);
    setReceiverMuted(session.isMute?.()===true);
  }, [publicStreamUrl, candidates, channelName, videoRef]);

  const connectGoogleCast = async () => {
    if (busy) return;
    setBusy(true); setFeedback("");
    try {
      const context = getCastContext();
      if (!context) throw new Error("Google Cast não disponível. Abra no Chrome e conecte sua TV à mesma rede.");
      if (!candidates.length) throw new Error("A fonte atual não pode ser enviada diretamente. Selecione outra fonte no player.");
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

  const changeReceiverVolume=async(value:number)=>{
    try{const session=getCastContext()?.getCurrentSession();if(!session?.setVolume)return;
      const level=clampVolume(value);await session.setVolume(level);setReceiverVolume(level);
      if(level>0&&receiverMuted){await session.setMute?.(false);setReceiverMuted(false);}
    }catch{setFeedback("Não foi possível ajustar o volume da TV.");}
  };
  const toggleReceiverMute=async()=>{
    try{const session=getCastContext()?.getCurrentSession();if(!session?.setMute)return;
      await session.setMute(!receiverMuted);setReceiverMuted(!receiverMuted);
    }catch{setFeedback("Não foi possível alterar o som da TV.");}
  };
  const popup = (<div className="zang-cast-menu" role="dialog" aria-label="Transmitir para a televisão">
          <div className="zang-cast-head">
            <span className="zang-cast-head-icon"><MonitorPlay size={21} /></span>
            <div><strong>Assistir na TV</strong><small>Escolha como conectar</small></div>
            <button type="button" aria-label="Fechar" onClick={() => setOpen(false)}><X size={16} /></button>
          </div>
          <button type="button" className="zang-cast-option" onClick={() => void connectGoogleCast()}
            disabled={!castReady || !candidates.length || busy}>
            {busy ? <LoaderCircle size={21} className="zang-cast-spin" /> : <Cast size={21} />}
            <span><strong>Chromecast / Google TV</strong><small>{castReady ? "Selecionar televisão" : "Procurando Google Cast..."}</small></span>
          </button>
          <button type="button" className="zang-cast-option" onClick={connectNative} disabled={!airplayAvailable && !remoteAvailable}>
            <Airplay size={21} />
            <span><strong>AirPlay / reprodução remota</strong><small>{airplayAvailable || remoteAvailable ? "Procurar dispositivo compatível" : "Indisponível neste navegador"}</small></span>
          </button>
          {casting&&<div className="zang-receiver-volume"><strong>{receiverName}</strong>
            {receiverVolume!==null&&<label>Volume da TV <output>{Math.round(receiverVolume*100)}%</output>
              <input type="range" min="0" max="1" step="0.01" value={receiverMuted?0:receiverVolume} aria-label="Volume da TV"
                onChange={event=>void changeReceiverVolume(Number(event.target.value))}/></label>}
            <button type="button" onClick={()=>void toggleReceiverMute()}>{receiverMuted?<VolumeX size={16}/>:<Volume2 size={16}/>} {receiverMuted?"Ativar som da TV":"Silenciar TV"}</button>
          </div>}
          {casting && <button type="button" className="zang-cast-stop" onClick={stopCasting}>Encerrar transmissão</button>}
          {feedback && <p className="zang-cast-feedback" role="status">{feedback}</p>}
          <a className="zang-cast-install" href="/tv-app">Instalar ou abrir na Smart TV →</a>
          <p className="zang-cast-hint">Use a mesma rede Wi-Fi. A compatibilidade depende da TV e da fonte.</p>
        </div>);

  return (
    <div className="zang-cast-control">
      <button type="button" className={"zf-player-action zang-cast-trigger" + (casting ? " is-casting" : "")}
        title="Transmitir para a TV" aria-label="Transmitir para a TV"
        aria-expanded={open} onClick={() => { setOpen(value => !value); setFeedback(""); }}>
        <Cast size={16} />
      </button>
      {open && (compact && !document.fullscreenElement
        ? createPortal(
            <div className="zang-cast-mobile-overlay">
              <button type="button" className="zang-cast-mobile-scrim"
                aria-label="Fechar opções de transmissão" onClick={() => setOpen(false)} />
              <div className="zang-cast-mobile-sheet">{popup}</div>
            </div>,
            document.body
          )
        : popup)}
    </div>
  );
}