"use client";
import { useEffect, useRef, useState } from "react";
import { Download, Smartphone, X } from "lucide-react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** Uses the browser's native PWA install prompt, with platform-specific guidance. */
export function InstallAppButton() {
  const pendingPrompt = useRef<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [help, setHelp] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    setInstalled(isStandalone());
    setIos(/iPad|iPhone|iPod/i.test(navigator.userAgent));
    const onInstallAvailable = (event: Event) => {
      event.preventDefault();
      pendingPrompt.current = event as InstallPromptEvent;
    };
    const onInstalled = () => {
      setInstalled(true);
      setHelp(false);
      pendingPrompt.current = null;
    };
    window.addEventListener("beforeinstallprompt", onInstallAvailable);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onInstallAvailable);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = async () => {
    const prompt = pendingPrompt.current;
    if (!prompt) { setHelp(true); return; }
    try {
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      pendingPrompt.current = null;
      setHelp(outcome !== "accepted");
    } catch {
      setHelp(true);
    }
  };

  if (installed) return null;
  return (
    <div className="zf-install-header">
      <button type="button" className="zf-header-apk" onClick={() => void install()}
        aria-label="Instalar aplicativo ZANG FLIX" aria-expanded={help}
        title="Instalar ZANG FLIX pelo navegador">
        <Download size={17} strokeWidth={1.9} aria-hidden="true" />
        <span>Instalar aplicativo</span>
      </button>
      {help && (
        <div className="zf-install-help" role="dialog" aria-label="Instalação do aplicativo">
          <div className="zf-install-help-head">
            <Smartphone size={18} aria-hidden="true" />
            <strong>Instalar ZANG FLIX</strong>
            <button type="button" onClick={() => setHelp(false)} aria-label="Fechar instruções"><X size={17} /></button>
          </div>
          <p>{ios
            ? "No Safari, toque em Compartilhar e escolha Adicionar à Tela de Início."
            : "No Chrome, abra o menu ⋮ e selecione Instalar aplicativo ou Adicionar à tela inicial."}</p>
          <small>A instalação é confirmada pelo próprio navegador. Não é necessário baixar um APK.</small>
        </div>
      )}
    </div>
  );
}
