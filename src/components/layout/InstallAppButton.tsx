"use client";
import { useEffect, useState } from "react";
import { Download, Smartphone, TvMinimal as Tv, X } from "lucide-react";

// Direct, publicly accessible Android package. GitHub serves the binary with
// Content-Disposition: attachment so Chrome downloads the .apk on tap.
export const ANDROID_APK_URL =
  "https://github.com/killersfromsagres/your-daily-oi/releases/download/android-latest/ZANG-FLIX-Android.apk";

/**
 * Install CTA for real Android APK, NOT beforeinstallprompt/PWA shortcut.
 * Android controls user confirmation of side-loaded APK installation.
 */
export function InstallAppButton() {
  const [platform, setPlatform] = useState<"android" | "ios" | "other" | "native" | "tv">("other");
  const [help, setHelp] = useState(false);

  useEffect(() => {
    const agent = navigator.userAgent;
    if(agent.includes("ZangFlixTV/"))setPlatform("native");
    else if(/smart.?tv|tizen|webos|web0s|android.?tv|googletv|aft[a-z0-9]+/i.test(agent))setPlatform("tv");
    else if (agent.includes("ZangFlixAndroid/")) setPlatform("native");
    else if (/iPad|iPhone|iPod/i.test(agent)) setPlatform("ios");
    else if (/Android/i.test(agent)) setPlatform("android");
    else setPlatform("other");
  }, []);

  if (platform === "native") return null;

  return (
    <div className="zf-install-header">
      {platform === "tv" ? <a href="/tv-app" className="zf-header-apk"><Tv size={17}/><span>Aplicativo para TV</span></a> : platform === "ios" ? (
        <button
          type="button" className="zf-header-apk"
          aria-label="Como adicionar ZANG FLIX ao iPhone"
          aria-expanded={help}
          onClick={() => setHelp(value => !value)}
        >
          <Smartphone size={17} strokeWidth={1.9} aria-hidden="true" />
          <span>Instalar no iPhone</span>
        </button>
      ) : (
        <a
          className="zf-header-apk"
          href={ANDROID_APK_URL}
          aria-label="Baixar aplicativo ZANG FLIX para Android em APK"
          title="Baixar APK Android, sem criar atalho no Chrome"
        >
          <Download size={17} strokeWidth={1.9} aria-hidden="true" />
          <span>Baixar aplicativo</span>
        </a>
      )}
      {platform!=="tv"&&<a href="/tv-app" className="zf-install-tv-link" aria-label="Instalar ou conectar ZANG FLIX na TV"><Tv size={17}/></a>}
      {help && platform === "ios" && (
        <div className="zf-install-help" role="dialog" aria-label="Adicionar ao iPhone">
          <div className="zf-install-help-head">
            <Smartphone size={18} aria-hidden="true" />
            <strong>ZANG FLIX no iPhone</strong>
            <button type="button" onClick={() => setHelp(false)} aria-label="Fechar instruções"><X size={17} /></button>
          </div>
          <p>Abra o site no Safari, toque em Compartilhar e escolha Adicionar à Tela de Início.</p>
          <small>Arquivos APK são exclusivos do Android. O Safari não instala APK.</small>
        </div>
      )}
    </div>
  );
}
