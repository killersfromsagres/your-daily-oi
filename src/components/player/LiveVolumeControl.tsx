import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Minus, Plus, Volume2, VolumeX, X } from "lucide-react";
import { stepVolume } from "@/lib/live-volume";

/** Compact, keyboard/remote-accessible volume glass panel; no full-screen blur. */
export function LiveVolumeControl({ volume, muted, onVolume, onMute, onDialogChange,
  otherOpen = false, hardwareOnly = false }: {
  volume: number; muted: boolean; onVolume: (value: number) => void; onMute: () => void;
  onDialogChange: (open: boolean) => void; otherOpen?: boolean; hardwareOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => { onDialogChange(open); }, [open, onDialogChange]);
  useEffect(() => { if (otherOpen) setOpen(false); }, [otherOpen]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const level = muted ? 0 : volume;
  const percent = Math.round(level * 100);
  const rangeStyle = { "--zf-volume-fill": percent + "%" } as CSSProperties;

  return (
    <div className="zf-live-volume" ref={root}>
      <button ref={trigger} type="button" className="zf-player-action"
        aria-label="Ajustar volume" title="Volume" aria-expanded={open}
        aria-haspopup="dialog" onClick={() => setOpen(value => !value)}>
        {percent === 0 ? <VolumeX size={16}/> : <Volume2 size={16}/>}
        <span className="zf-volume-indicator" aria-hidden="true">{percent}</span>
      </button>
      {open && (
        <div className="zf-volume-panel" role="dialog" aria-label="Volume da transmissão">
          <header className="zf-volume-heading">
            <span className="zf-volume-heading-icon" aria-hidden="true">
              {percent === 0 ? <VolumeX size={17}/> : <Volume2 size={17}/>}
            </span>
            <div className="zf-volume-heading-text"><strong>Áudio</strong><small>Volume do canal</small></div>
            <output aria-live="polite">{percent}%</output>
            <button className="zf-volume-close" type="button" aria-label="Fechar volume"
              onClick={() => { setOpen(false); trigger.current?.focus(); }}>
              <X size={15}/>
            </button>
          </header>
          <div className="zf-volume-slider">
            <button className="zf-volume-step" type="button" aria-label="Diminuir volume"
              onClick={() => onVolume(stepVolume(level, -1))}><Minus size={15}/></button>
            <input type="range" min="0" max="100" step="1" value={percent}
              style={rangeStyle}
              aria-label="Volume" aria-valuetext={percent + " por cento"}
              onChange={event => onVolume(Number(event.target.value) / 100)} />
            <button className="zf-volume-step" type="button" aria-label="Aumentar volume"
              onClick={() => onVolume(stepVolume(level, 1))}><Plus size={15}/></button>
          </div>
          <div className="zf-volume-footer">
            <span>{hardwareOnly ? "Controle pelo aparelho" : "Ajuste fino · 1%"}</span>
            <button type="button" className="zf-volume-mute" onClick={onMute}>
              {percent === 0 ? <VolumeX size={14}/> : <Volume2 size={14}/>}
              {percent === 0 ? "Ativar som" : "Silenciar"}
            </button>
          </div>
          {hardwareOnly && <p className="zf-volume-hardware" role="status">
            O navegador não permite ajustar o volume aqui. Utilize os botões do aparelho.
          </p>}
        </div>
      )}
    </div>
  );
}
