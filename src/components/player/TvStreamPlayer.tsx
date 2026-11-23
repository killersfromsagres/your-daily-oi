"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import {AlertCircle,Play,RefreshCw,Volume2,VolumeX} from "lucide-react";
import type {CanalTV} from "@/lib/canais";
import {
  tvFailureMessage,tvPlaybackPlan,tvSkipSameSource,
  type TvConnectionReason,type TvPlaybackAttempt,
} from "@/lib/tv-playback-plan";

type Stage="connecting"|"playing"|"unavailable";
type Failure={reason:TvConnectionReason;status:number|null};
type Outcome={failure:Failure};
type Cleanup=()=>void;
interface Props{
  canal:CanalTV;
  onPlaybackStatus?:(id:string,status:Stage)=>void;
  onSourcesExhausted?:()=>void;
}
/** A single lightweight decoder for a TCL / Android TV WebView.
 * One finite playback session owns exactly one <video>, the timers and all
 * transport engines. Never hook up the heavyweight desktop HQ player here. */
export function TvStreamPlayer({canal,onPlaybackStatus,onSourcesExhausted}:Props){
  const videoRef=useRef<HTMLVideoElement>(null);
  const retryRef=useRef<()=>void>(()=>{});
  const [generation,setGeneration]=useState(0);
  const [stage,setStage]=useState<Stage>("connecting");
  const [attempt,setAttempt]=useState(0);
  const [reason,setReason]=useState("");
  const [requiresGesture,setRequiresGesture]=useState(false);
  const [muted,setMuted]=useState(false);
  const plan=useMemo(()=>tvPlaybackPlan(canal,9),[canal.id,canal.fontes]);

  useEffect(()=>{
    const video=videoRef.current;
    if(!video)return;
    let cancelled=false;
    let teardown:Cleanup=()=>{};
    let lastFailure:Failure={reason:"unavailable",status:null};
    let lastSource=-1;
    const report=(next:Stage)=>{
      if(cancelled)return;
      setStage(current=>current===next?current:next);
      onPlaybackStatus?.(canal.id,next);
    };
    const runAttempt=(candidate:TvPlaybackAttempt,index:number):Promise<Outcome>=>{
      return new Promise(resolve=>{
        let done=false;
        let started=false;
        let confirmed=false;
         let hls:{destroy:()=>void}|null=null;
        let mpeg:{destroy:()=>void;unload?:()=>void}|null=null;
        let shaka:{destroy:()=>Promise<unknown>|void}|null=null;
        let beginTime=0;
        let startFrames=0;
        let lastTime=0;
        let lastFrames=0;
        let advancedAt=Date.now();
        const frames=()=>{try{return video.getVideoPlaybackQuality?.().totalVideoFrames||0}catch{return 0}};
        const cleanup=()=>{
          window.clearTimeout(startup);
          window.clearInterval(clock);
          video.removeEventListener("playing",onPlaying);
          video.removeEventListener("timeupdate",onTime);
          video.removeEventListener("error",onVideoError);
          video.removeEventListener("stalled",onStall);
          try{hls?.destroy()}catch{}
          try{mpeg?.unload?.();mpeg?.destroy()}catch{}
          try{void shaka?.destroy()}catch{}
          hls=null;mpeg=null;shaka=null;
          video.pause();video.removeAttribute("src");video.load();
        };
        teardown=()=>{
          if(!done){done=true;cleanup();resolve({failure:{reason:"unavailable",status:null}})}
          else cleanup();
        };
        const finish=(reason:TvConnectionReason,status:number|null=null)=>{
          if(done||cancelled)return;
          done=true;
          cleanup();
          resolve({failure});
        };
        const successful=()=>{
          if(confirmed||cancelled||done)return;
          confirmed=true;
          advancedAt=Date.now();
          lastTime=video.currentTime;
          lastFrames=frames();
          setRequiresGesture(false);
          setReason("");
          report("playing");
        };
        const onPlaying=()=>{
          started=true;
          beginTime=video.currentTime||0;
          startFrames=frames();
          advancedAt=Date.now();
        };
        const onTime=()=>{
          if(!started)return;
          if(Math.abs(video.currentTime-beginTime)>.45||frames()-startFrames>=2)successful();
        };
        const onStall=()=>{
          // A brief buffering pause is normal. The progress clock decides
          // whether the stream has really stalled, never this event alone.
        };
        const onVideoError=()=>{
          if(cancelled||done)return;
          const code=video.error?.code||0;
          finish(code===4?"decoder":"network");
        };
        const startPlayback=()=>{
          if(cancelled||done)return;
          const play=video.play();
          void play.catch(error=>{
            if(cancelled||done)return;
            if(error && typeof error==="object" && "name" in error && error.name==="NotAllowedError"){
              window.clearTimeout(startup);
              setRequiresGesture(true);
              setReason(tvFailureMessage("not-allowed"));
              return;
            }
            finish("decoder");
          });
        };
        retryRef.current=()=>{
          if(!requiresGesture && !video.paused)return;
          setRequiresGesture(false);
          // Invoked synchronously from an actual user key/click, preserving
          // Android's user-activation requirement.
          void video.play().catch(()=>finish("decoder"));
        };
        const startup=window.setTimeout(()=>{
          if(!confirmed&&!requiresGesture)finish("timeout");
        },candidate.format==="dash"?14000:11500);
        const clock=window.setInterval(()=>{
          if(done||cancelled||document.hidden||!navigator.onLine)return;
          if(!confirmed){
            if(started)onTime();
            return;
          }
          const current=video.currentTime;
          const currentFrames=frames();
          if(Math.abs(current-lastTime)>.3||currentFrames-lastFrames>=2){
            lastTime=current;lastFrames=currentFrames;advancedAt=Date.now();
          }else if(Date.now()-advancedAt>14000&&!video.paused&&!video.seeking){
            report("connecting");finish("no-progress");
          }
        },850);
        video.addEventListener("playing",onPlaying);
        video.addEventListener("timeupdate",onTime);
        video.addEventListener("error",onVideoError);
        video.addEventListener("stalled",onStall);
        setAttempt(index+1);
        setRequiresGesture(false);
        setReason("");
        report("connecting");

        const setup=async()=>{
          try{
            const kind=candidate.format==="auto"?"hls":candidate.format;
            if(kind==="hls"){
              // Android's canPlayType() is unreliable on several TCL firmware
              // versions. Prefer bundled hls.js/MSE when supported; only use
              // native HLS if MSE is unavailable and native capability exists.
              const {default:Hls}=await import("hls.js");
              if(cancelled||done)return;
              if(Hls.isSupported()){
                const instance=new Hls({
                  enableWorker:true,lowLatencyMode:false,
                  maxBufferLength:14,maxMaxBufferLength:25,
                  liveSyncDurationCount:3,liveMaxLatencyDurationCount:7,
                  manifestLoadingTimeOut:7500,levelLoadingTimeOut:7500,
                  fragLoadingTimeOut:9500,
                });
                hls=instance;
                let recovered=false;
                instance.on(Hls.Events.MANIFEST_PARSED,()=>startPlayback());
                instance.on(Hls.Events.ERROR,(_event,data)=>{
                  if(cancelled||done)return;
                  const response=data?.response as {code?:number;status?:number}|undefined;
                  const network=data?.networkDetails as {status?:number}|undefined;
                  const code=Number(response?.code??response?.status??network?.status??0);
                  const detail=String(data?.details||"");
                  const permanent=[401,403,404,409,410,429].includes(code);
                  if(permanent){
                    finish("network",code);return;
                  }
                  if(!data?.fatal)return;
                  if(data.type===Hls.ErrorTypes.MEDIA_ERROR&&!recovered){
                    recovered=true;instance.recoverMediaError();return;
                  }
                  finish(data.type===Hls.ErrorTypes.MEDIA_ERROR?"decoder":"network",code||null);
                });
                instance.attachMedia(video);
                instance.loadSource(candidate.url);
                return;
              }
              if(!video.canPlayType("application/vnd.apple.mpegurl") &&
                 !video.canPlayType("application/x-mpegURL")){
                finish("unsupported");return;
              }
            }else if(kind==="ts"){
              const imported=await import("mpegts.js");
              if(cancelled||done)return;
              const lib=imported.default??imported;
              if(!lib.isSupported()){finish("unsupported");return;}
              const instance=lib.createPlayer({type:"mpegts",url:candidate.url,isLive:true,cors:true},{
                enableWorker:false,enableStashBuffer:true,stashInitialSize:256*1024,
                lazyLoad:false,autoCleanupSourceBuffer:true,
              });
              mpeg=instance;
              instance.on(lib.Events.ERROR,()=>finish("network"));
              instance.attachMediaElement(video);
              instance.load();
              startPlayback();
              return;
            }else if(kind==="dash"){
              // Same licensed ClearKey descriptors already used by the web
              // player. Never attempt to defeat DRM or invent a missing key.
              const shakaGlobal=await loadShakaForTv();
              if(cancelled||done)return;
              if(!shakaGlobal?.Player?.isBrowserSupported?.()){
                finish("unsupported");return;
              }
              const instance=new shakaGlobal.Player();
              shaka=instance;
              await instance.attach(video);
              if(cancelled||done)return;
              if(candidate.source.chave){
                const [keyId,key]=candidate.source.chave.split(":").map(s=>s.trim().toLowerCase());
                if(keyId&&key)instance.configure({drm:{clearKeys:{[keyId]:key}}});
              }
              instance.addEventListener("error",()=>finish("network"));
              await instance.load(candidate.url);
              if(cancelled||done)return;
              startPlayback();
              return;
            }
            // Plain MP4 or native HLS path.
            if(cancelled||done)return;
            video.src=candidate.url;
            video.load();
            startPlayback();
          }catch{
            if(!cancelled&&!done)finish("network");
          }
        };
        void setup();
      });
    };

    const run=async()=>{
      if(!plan.length){
        setReason("Este canal não possui uma fonte válida cadastrada.");
        report("unavailable");return;
      }
      report("connecting");
      for(let index=0;index<plan.length&&!cancelled;index++){
        const candidate=plan[index]!;
        if(lastSource===candidate.sourceIndex && tvSkipSameSource(lastFailure.status))continue;
        const result=await runAttempt(candidate,index);
        if(cancelled)return;
        lastFailure=result.failure;
        lastSource=candidate.sourceIndex;
        if(lastFailure.reason==="not-allowed")break;
      }
      if(cancelled)return;
      setRequiresGesture(false);
      setReason(tvFailureMessage(lastFailure.reason,lastFailure.status||undefined));
      report("unavailable");
      onSourcesExhausted?.();
    };
    void run();
    return()=>{
      cancelled=true;
      teardown();
      retryRef.current=()=>{};
    };
  },[canal.id,plan,generation,onPlaybackStatus,onSourcesExhausted]);

  const retry=()=>{setGeneration(current=>current+1);setReason("");setRequiresGesture(false)};
  const startFromUser=()=>retryRef.current();
  const switchMute=()=>{
    const video=videoRef.current;if(!video)return;
    video.muted=!video.muted;setMuted(video.muted);
  };
  return <div className="zf-tv-stream" data-tv-native-stream="true" data-stream-stage={stage}>
    <video ref={videoRef} autoPlay playsInline preload="none" className="zf-tv-stream-video"
      aria-label={"Transmissão "+canal.nome}/>
    {stage==="connecting"&&!requiresGesture&&
      <div className="zf-tv-stream-status" role="status" aria-live="polite">
        <span className="zf-tv-stream-light" aria-hidden="true"/>
        <strong>Conectando ao canal</strong>
        <p>{attempt>0?"Verificando fonte "+attempt+" de até "+plan.length+"…":"Preparando reprodução…"}</p>
      </div>}
    {requiresGesture&&<div className="zf-tv-stream-status" role="status">
      <strong>Confirme a reprodução</strong><p>Pressione OK para iniciar o vídeo nesta televisão.</p>
      <button type="button" data-tv-focus="stream-gesture" onClick={startFromUser}>
        <Play size={18}/> Iniciar canal
      </button>
    </div>}
    {stage==="unavailable"&&<div className="zf-tv-stream-status zf-tv-stream-error" role="alert">
      <AlertCircle size={26}/>
      <strong>Não foi possível abrir este canal</strong>
      <p>{reason}</p>
      <button type="button" data-tv-focus="stream-retry" onClick={retry}><RefreshCw size={18}/> Tentar novamente</button>
    </div>}
    {stage==="playing"&&<button type="button" className="zf-tv-stream-mute"
      data-tv-focus="stream-mute" onClick={switchMute} aria-label={muted?"Ativar som":"Silenciar"}>
      {muted?<VolumeX size={20}/>:<Volume2 size={20}/>}
    </button>}
  </div>;
}
type ShakaGlobal={polyfill?:{installAll?:()=>void};Player?:{new():any;isBrowserSupported?:()=>boolean}};
let shakaPromise:Promise<ShakaGlobal|null>|null=null;
async function loadShakaForTv():Promise<ShakaGlobal|null>{
  if(typeof window==="undefined")return null;
  const host=window as Window&{shaka?:ShakaGlobal};
  if(host.shaka?.Player)return host.shaka;
  if(!shakaPromise){
    shakaPromise=new Promise(resolve=>{
      const script=document.createElement("script");
      script.src="https://cdn.jsdelivr.net/npm/shaka-player@4.11.2/dist/shaka-player.compiled.js";
      script.async=true;
      const timeout=window.setTimeout(()=>{script.remove();resolve(null)},7500);
      script.onload=()=>{window.clearTimeout(timeout);host.shaka?.polyfill?.installAll?.();resolve(host.shaka||null)};
      script.onerror=()=>{window.clearTimeout(timeout);resolve(null)};
      document.head.appendChild(script);
    });
  }
  return shakaPromise;
}
