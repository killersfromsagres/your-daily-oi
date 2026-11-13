"use client";
// src/components/player/useNeuralVideoUpscaler.ts — browser/WebGPU, real CNN 2x (WebSR, MIT).
import { useEffect, useRef, useState, type RefObject } from "react";

type Status = "idle" | "loading" | "active" | "unavailable";
type NetworkName = "anime4k/cnn-2x-s" | "anime4k/cnn-2x-m";

type WebSRInstance = {
  render(source: HTMLVideoElement): Promise<void>;
  switchNetwork(network: NetworkName, weights: unknown): void;
  destroy(): Promise<void>;
};
type WebSRClass = {
  new (options: {
    canvas: HTMLCanvasElement;
    weights: unknown;
    network_name: NetworkName;
    gpu: unknown;
  }): WebSRInstance;
  initWebGPU(): Promise<unknown | false>;
};
type WebSRGlobal = typeof window & { WebSR?: WebSRClass | { default: WebSRClass } };
let vendorLoad: Promise<WebSRClass> | null = null;

function loadVendor(): Promise<WebSRClass> {
  if (vendorLoad) return vendorLoad;
  vendorLoad = new Promise<WebSRClass>((resolve, reject) => {
    const win = window as WebSRGlobal;
    const getClass = () => {
      const exported = win.WebSR;
      return exported && ("default" in exported ? exported.default : exported);
    };
    const existing = getClass();
    if (existing) { resolve(existing); return; }
    const script = document.createElement("script");
    script.src = "/vendor/websr/websr.js";
    script.async = true;
    script.onload = () => {
      const ctor = getClass();
      if (ctor && typeof ctor.initWebGPU === "function") resolve(ctor);
      else reject(new Error("WebSR carregado sem construtor de inferência"));
    };
    script.onerror = () => reject(new Error("Não foi possível carregar o modelo WebSR"));
    document.head.appendChild(script);
  }).catch(error => {
    vendorLoad = null; // Retry on the next user-requested activation.
    throw error;
  });
  return vendorLoad;
}

/** Avoid attempting a large 2x CNN on already-HD frames or tiny decoders. */
export function eligibleForNeural2x(width: number, height: number): boolean {
  return width >= 160 && height >= 90 && width < 1920 && height < 1080;
}

export interface NeuralUpscalerResult {
  status: Status;
  active: boolean;
  reason: string | null;
  avgFrameMs: number;
}

/**
 * Per-frame 2x neural inference on the client's GPU. The original <video>
 * remains decoded with its original audio, subtitles and playback clock.
 * If the GPU, model, origin/CORS or frame budget fail, the caller may use
 * the existing non-neural WebGL enhancer without interrupting playback.
 */
export function useNeuralVideoUpscaler(
  videoRef: RefObject<HTMLVideoElement | null>,
  canvasRef: RefObject<HTMLCanvasElement | null>,
  enabled: boolean,
  contentType: "movie" | "series" | "anime",
): NeuralUpscalerResult {
  const [status, setStatus] = useState<Status>("idle");
  const [reason, setReason] = useState<string | null>(null);
  const [avgFrameMs, setAvgFrameMs] = useState(0);
  const previousAvg = useRef(0);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!enabled || !video || !canvas) {
      setStatus("idle");
      setReason(null);
      return;
    }

    let cancelled = false;
    let engine: WebSRInstance | null = null;
    let videoFrameRequest = 0;
    let animationRequest = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let rendered = 0;
    let slowSince = 0;
    let lastFrameCompletedAt = 0;
    let frameIntervalAvg = 0;
    let promoted = false;
    let networkSize: "s" | "m" = "s";
    previousAvg.current = 0;
    const abortController = new AbortController();

    const stop = () => {
      cancelled = true;
      abortController.abort();
      if (timer) clearTimeout(timer);
      if (videoFrameRequest && "cancelVideoFrameCallback" in video) {
        video.cancelVideoFrameCallback(videoFrameRequest);
      }
      if (animationRequest) cancelAnimationFrame(animationRequest);
      if (engine) void engine.destroy().catch(() => {});
    };

    const unavailable = (message: string) => {
      if (cancelled) return;
      setReason(message);
      setStatus("unavailable");
      stop();
    };

    const waitForFrame = () => new Promise<void>((resolve, reject) => {
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
          video.videoWidth > 0 && video.videoHeight > 0) {
        resolve();
        return;
      }
      const onLoaded = () => {
        if (video.videoWidth > 0 && video.videoHeight > 0) { cleanup(); resolve(); }
      };
      const onAbort = () => { cleanup(); reject(new Error("Carregamento cancelado")); };
      const cleanup = () => {
        video.removeEventListener("loadeddata", onLoaded);
        video.removeEventListener("loadedmetadata", onLoaded);
        abortController.signal.removeEventListener("abort", onAbort);
        if (timer) { clearTimeout(timer); timer = null; }
      };
      video.addEventListener("loadeddata", onLoaded);
      video.addEventListener("loadedmetadata", onLoaded);
      abortController.signal.addEventListener("abort", onAbort, { once: true });
      timer = setTimeout(() => { cleanup(); reject(new Error("Vídeo ainda não carregado")); }, 15000);
    });

    const nextFrame = () => {
      if (cancelled) return;
      if (typeof video.requestVideoFrameCallback === "function") {
        videoFrameRequest = video.requestVideoFrameCallback(() => { void renderFrame(); });
      } else {
        animationRequest = requestAnimationFrame(() => { void renderFrame(); });
      }
    };

    const renderFrame = async () => {
      if (cancelled || !engine) return;
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
          video.paused || video.ended || document.visibilityState !== "visible") {
        nextFrame();
        return;
      }
      try {
        const startedAt = performance.now();
        await engine.render(video);
        if (cancelled) return;
        const spent = performance.now() - startedAt;
        previousAvg.current = previousAvg.current
          ? previousAvg.current * 0.85 + spent * 0.15 : spent;
        rendered++;
        const completedAt = performance.now();
        if (lastFrameCompletedAt) {
          const gap = completedAt - lastFrameCompletedAt;
          frameIntervalAvg = frameIntervalAvg ? frameIntervalAvg * .7 + gap * .3 : gap;
        }
        lastFrameCompletedAt = completedAt;
        if (rendered % 15 === 0) setAvgFrameMs(Math.round(previousAvg.current));
        // Never hide the native video after a single neural frame.
        // Prove near-real-time throughput before swapping the visible layer.
        if (!promoted && rendered >= 8) {
          if (previousAvg.current > 22 || frameIntervalAvg > 55) {
            unavailable("Super-resolução abaixo da taxa de quadros necessária");
            return;
          }
          promoted = true;
          setStatus("active");
        }
        if (promoted && rendered > 15 &&
            (previousAvg.current > 34 || frameIntervalAvg > 70)) {
          unavailable("Queda de FPS detectada; mantendo o vídeo original");
          return;
        }
        // 48 ms for a few frames is normal while pipelines compile or the
        // GPU ramps up. Downgrade only after sustained severe pressure.
        if (previousAvg.current > 95) {
          if (!slowSince) slowSince = performance.now();
        } else {
          slowSince = 0;
        }
        if (rendered > 45 && slowSince > 0 && performance.now() - slowSince > 12000) {
          if (networkSize === "m") {
            // Adaptive quality: keep real AI on slow desktop GPUs by dropping
            // from the medium model to the smaller trained CNN before giving up.
            const weightsUrl = contentType === "anime"
              ? "/models/websr/animation-s.json" : "/models/websr/real-life-s.json";
            const smaller = await fetch(weightsUrl, { signal: abortController.signal });
            if (!smaller.ok) throw new Error("Modelo compacto indisponível");
            if (cancelled) return;
            engine.switchNetwork("anime4k/cnn-2x-s", await smaller.json());
            networkSize = "s";
            slowSince = 0;
            rendered = 0;
            previousAvg.current = 0;
            promoted = false;
            lastFrameCompletedAt = 0;
            frameIntervalAvg = 0;
            setStatus("loading");
          } else {
            unavailable("GPU abaixo do desempenho necessário para IA em tempo real");
            return;
          }
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.info("[ZANG FLIX HQ] Neural inference unavailable:", reason);
        unavailable(/cross.origin|cors|security|origin.clean|tainted/i.test(reason)
          ? "Esta fonte não autoriza leitura dos quadros pela GPU"
          : "A GPU não conseguiu processar a super-resolução desta fonte");
        return;
      }
      nextFrame();
    };

    setStatus("loading");
    setReason(null);
    setAvgFrameMs(0);
    void (async () => {
      try {
        if (!("gpu" in navigator) || !isSecureContext) {
          unavailable("WebGPU indisponível neste navegador");
          return;
        }
        await waitForFrame();
        if (cancelled) return;
        if (!eligibleForNeural2x(video.videoWidth, video.videoHeight)) {
          unavailable("Vídeo já possui resolução alta para o modelo IA 2×");
          return;
        }
        // Medium-capacity trained network on desktops with smaller source
        // frames; compact network on mobile and higher resolution sources.
        networkSize = window.innerWidth >= 1024 && video.videoHeight <= 720 ? "m" : "s";
        const weightsUrl = "/models/websr/" +
          (contentType === "anime" ? "animation" : "real-life") + "-" + networkSize + ".json";
        const [WebSR, weightsResponse] = await Promise.all([
          loadVendor(),
          fetch(weightsUrl, { signal: abortController.signal }),
        ]);
        if (!weightsResponse.ok) throw new Error("Pesos do modelo indisponíveis");
        const weights = await weightsResponse.json() as unknown;
        if (cancelled) return;
        const device = await WebSR.initWebGPU();
        if (!device || cancelled) {
          unavailable("GPU sem suporte à inferência WebGPU");
          return;
        }
        engine = new WebSR({
          gpu: device,
          canvas,
          network_name: networkSize === "m" ? "anime4k/cnn-2x-m" : "anime4k/cnn-2x-s",
          weights,
        });
        nextFrame();
      } catch (error) {
        if (!cancelled) unavailable(error instanceof Error ? error.message : "Falha de inicialização da IA");
      }
    })();

    const resetOnSwitch = () => {
      if (!cancelled) setStatus(previous => previous === "active" ? "loading" : previous);
    };
    video.addEventListener("emptied", resetOnSwitch);
    video.addEventListener("loadstart", resetOnSwitch);
    return () => {
      video.removeEventListener("emptied", resetOnSwitch);
      video.removeEventListener("loadstart", resetOnSwitch);
      stop();
    };
  }, [enabled, contentType, videoRef, canvasRef]);

  return { status, active: enabled && status === "active", reason, avgFrameMs };
}
