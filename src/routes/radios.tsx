import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { Radio, Play, Pause, Volume2, VolumeX, Search } from "lucide-react";
import type { RadioItem } from "@/lib/live-types";

export const Route = createFileRoute("/radios")({
  component: RadiosPage,
  head: () => ({ meta: [{ title: "Rádios Ao Vivo — Zang Flix" }] }),
});

function RadiosPage() {
  const [radios, setRadios] = useState<RadioItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentRadio, setCurrentRadio] = useState<RadioItem | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [search, setSearch] = useState("");
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    fetch("/api/radios")
      .then((res) => res.json() as Promise<{ radios: RadioItem[] }>)
      .then((data) => {
        setRadios(data.radios || []);
        if (data.radios && data.radios.length > 0) {
          setCurrentRadio(data.radios[0]);
        }
      })
      .catch((err) => console.error("Erro ao carregar rádios:", err))
      .finally(() => setLoading(false));
  }, []);

  const playRadio = (radio: RadioItem) => {
    setCurrentRadio(radio);
    setIsPlaying(true);
    if (audioRef.current) {
      audioRef.current.src = radio.url;
      audioRef.current.play().catch(() => {});
    }
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const handleVolumeChange = (v: number) => {
    setVolume(v);
    if (audioRef.current) {
      audioRef.current.volume = v;
      audioRef.current.muted = v === 0;
    }
    setMuted(v === 0);
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    if (audioRef.current) {
      audioRef.current.muted = next;
    }
  };

  const filteredRadios = radios.filter((r) =>
    r.nome.toLowerCase().includes(search.toLowerCase().trim())
  );

  return (
    <main className="min-h-screen bg-[#0a0b14] text-[#f1f1f1] pt-28 pb-32 px-4 md:px-10">
      <audio
        ref={audioRef}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />

      <div className="max-w-6xl mx-auto flex flex-col gap-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[#e8b44a] font-bold text-xs uppercase tracking-wider mb-1">
              <Radio size={16} /> Estações de Rádio
            </div>
            <h1 className="text-3xl md:text-4xl font-black text-white">Rádios Ao Vivo</h1>
          </div>

          <div className="relative w-full md:w-80">
            <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              type="text"
              placeholder="Buscar estação de rádio..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#111320] border border-white/10 text-white placeholder-white/40 text-sm outline-none focus:border-[#e8b44a]"
            />
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-white/40">Carregando estações de rádio…</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {filteredRadios.map((r) => {
              const isActive = currentRadio?.url === r.url;
              return (
                <div
                  key={r.nome + r.url}
                  onClick={() => playRadio(r)}
                  className={`p-4 rounded-xl flex flex-col items-center text-center gap-3 cursor-pointer transition-all border ${
                    isActive
                      ? "bg-[#161828] border-[#e8b44a] shadow-lg shadow-[#e8b44a]/10"
                      : "bg-[#111320] border-white/5 hover:border-white/20 hover:bg-[#141626]"
                  }`}
                >
                  <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden p-2">
                    {r.logo ? (
                      <img src={r.logo} alt={r.nome} className="w-full h-full object-contain" />
                    ) : (
                      <Radio size={24} className="text-[#e8b44a]" />
                    )}
                  </div>
                  <span className="text-sm font-bold text-white truncate w-full">{r.nome}</span>
                  <button
                    className={`mt-1 w-9 h-9 rounded-full flex items-center justify-center transition-transform ${
                      isActive && isPlaying ? "bg-[#e8b44a] text-black" : "bg-white/10 text-white"
                    }`}
                  >
                    {isActive && isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Miniplayer Fixo no Rodapé */}
      {currentRadio && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-[#0d0e15]/95 border-t border-white/10 backdrop-blur-xl z-50">
          <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden p-1.5">
                {currentRadio.logo ? (
                  <img src={currentRadio.logo} alt={currentRadio.nome} className="w-full h-full object-contain" />
                ) : (
                  <Radio size={20} className="text-[#e8b44a]" />
                )}
              </div>
              <div>
                <span className="block text-sm font-bold text-white">{currentRadio.nome}</span>
                <span className="block text-xs text-[#e8b44a] font-semibold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#e8b44a] animate-ping" />
                  Transmissão ao vivo
                </span>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <button
                onClick={togglePlay}
                className="w-12 h-12 rounded-full bg-[#ffffff] text-[#0a0b14] flex items-center justify-center hover:bg-[#e8b44a] transition-colors"
                aria-label={isPlaying ? "Pausar" : "Tocar"}
              >
                {isPlaying ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button onClick={toggleMute} className="text-white hover:text-[#e8b44a]">
                {muted || volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={muted ? 0 : volume}
                onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                className="w-24 h-1 bg-white/30 rounded-lg appearance-none cursor-pointer accent-[#e8b44a]"
              />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
