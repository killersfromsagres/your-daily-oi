"use client";
import { useEffect, useState } from "react";
import { Download, CheckCircle2 } from "lucide-react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/** Browser-mediated PWA installation. Never pretends to download an APK. */
export function InstallAppButton() {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [help, setHelp] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setInstalled(standalone);
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
      setHelp(false);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return null;
  return (
    <div className="zf-install-wrap">
      <button type="button" className="zf-install-action" onClick={async () => {
        if (!promptEvent) { setHelp(value => !value); return; }
        try {
          await promptEvent.prompt();
          const result = await promptEvent.userChoice;
          if (result.outcome === "accepted") setPromptEvent(null);
        } catch {
          setHelp(true);
        }
      }}>
        <Download size={17} aria-hidden="true" />
        <span>Instalar ZANG FLIX</span>
      </button>
      {help && (
        <div className="zf-install-help" role="status">
          <CheckCircle2 size={16} aria-hidden="true" />
          <span>No Chrome, abra o menu ⋮ e escolha <strong>Instalar aplicativo</strong> ou <strong>Adicionar à tela inicial</strong>. A instalação depende da confirmação do Android.</span>
        </div>
      )}
    </div>
  );
}
