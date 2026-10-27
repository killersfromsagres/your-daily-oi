import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo, useRef } from "react";
import {
  Search,
  Star,
  Tv,
  Calendar,
  X,
  Radio,
  Clock,
  Sparkles,
} from "lucide-react";
import { LivePlayer } from "@/components/player/LivePlayer";
import type { LiveChannel, ChannelsResponse, EpgProgram } from "@/lib/live-types";

export const Route = createFileRoute("/ao-vivo")({
  component: LiveTvPage,
  head: () => ({ meta: [{ title: "TV Ao Vivo — Zang Flix" }] }),
});

function LiveTvPage() {
  const [data, setData] = useState<ChannelsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedChannel, setSelectedChannel] = useState<LiveChannel | null>(null);
  const [activeCategory, setActiveCategory] = useState("Todos");
  const [searchQuery, setSearchQuery] = useState("");
  const [favorites, setFavorites] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const fav = localStorage.getItem("ydo_live_favorites");
        return fav ? JSON.parse(fav) : [];
      } catch {
        return [];
      }
    }
    return [];
  });
  const [epgData, setEpgData] = useState<Record<string, EpgProgram[]>>({});
  const [showEpgModal, setShowEpgModal] = useState(false);

  const channelsListRef = useRef<HTMLDivElement>(null);

  // Carrega lista de canais e recupera o último canal assistido
  useEffect(() => {
    let active = true;
    setLoading(true);

    fetch("/api/canais")
      .then((res) => res.json() as Promise<ChannelsResponse>)
      .then((resData) => {
        if (!active) return;
        setData(resData);

        const lastId = typeof window !== "undefined" ? localStorage.getItem("ydo_last_channel") : null;
        const initial = (lastId && resData.canais.find((c) => c.id === lastId)) || resData.canais[0] || null;
        setSelectedChannel(initial);
      })
      .catch((err) => console.error("Erro ao carregar canais:", err))
      .finally(() => {
        if (active) setLoading(false);
      });

    // Carrega EPG em paralelo
    fetch("/api/epg")
      .then((r) => r.json() as Promise<{ epg: Record<string, EpgProgram[]> }>)
      .then((d) => {
        if (active && d.epg) setEpgData(d.epg);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  // Atalho de Teclado 'G' para abrir/fechar o Guia EPG
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "g" || e.key === "G") {
        setShowEpgModal((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const selectChannel = (channel: LiveChannel) => {
    setSelectedChannel(channel);
    if (typeof window !== "undefined") {
      localStorage.setItem("ydo_last_channel", channel.id);
    }
  };

  const toggleFavorite = (e: React.MouseEvent, channelId: string) => {
    e.stopPropagation();
    setFavorites((prev) => {
      const next = prev.includes(channelId) ? prev.filter((id) => id !== channelId) : [...prev, channelId];
      localStorage.setItem("ydo_live_favorites", JSON.stringify(next));
      return next;
    });
  };

  const filteredChannels = useMemo(() => {
    if (!data) return [];
    let list = data.canais;

    if (activeCategory === "Favoritos") {
      list = list.filter((c) => favorites.includes(c.id));
    } else if (activeCategory !== "Todos") {
      list = list.filter((c) => c.categoria === activeCategory);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (c) => c.nome.toLowerCase().includes(q) || c.categoria.toLowerCase().includes(q)
      );
    }

    return list;
  }, [data, activeCategory, searchQuery, favorites]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#0a0b14] flex flex-col items-center justify-center text-white p-6">
        <div className="w-14 h-14 rounded-full border-2 border-white/10 border-t-[#e8b44a] animate-spin mb-4" />
        <span className="text-sm text-white/60 tracking-wider uppercase font-semibold">
          Carregando grade de 408 canais ao vivo…
        </span>
      </main>
    );
  }

  const currentProgram = selectedChannel && epgData[selectedChannel.id]?.[0];

  return (
    <main className="min-h-screen bg-[#0a0b14] text-[#f1f1f1] pt-24 pb-16 px-4 md:px-8">
      {/* Container Principal em 2 Colunas */}
      <div className="max-w-[1720px] mx-auto flex flex-col lg:flex-row gap-6 items-start">
        {/* Coluna Esquerda: Player Ao Vivo e Informações do Canal */}
        <div className="w-full lg:flex-1 flex flex-col gap-4">
          <div className="w-full aspect-video rounded-2xl overflow-hidden bg-black shadow-2xl relative">
            {selectedChannel ? (
              <LivePlayer channel={selectedChannel} />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-white/40 gap-3">
                <Tv size={48} />
                <span>Selecione um canal para assistir</span>
              </div>
            )}
          </div>

          {/* Barra de Informações do Canal e Botão do Guia EPG */}
          {selectedChannel && (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-2xl bg-[#111320] border border-white/5">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden flex-shrink-0">
                  {selectedChannel.logo ? (
                    <img
                      src={selectedChannel.logo}
                      alt={selectedChannel.nome}
                      className="w-full h-full object-contain p-1.5"
                    />
                  ) : (
                    <span className="font-extrabold text-xs text-[#e8b44a]">
                      {selectedChannel.nome.slice(0, 3).toUpperCase()}
                    </span>
                  )}
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-xl font-black text-white">{selectedChannel.nome}</h1>
                    <button
                      onClick={(e) => toggleFavorite(e, selectedChannel.id)}
                      className={`p-1.5 rounded-full transition-colors ${
                        favorites.includes(selectedChannel.id)
                          ? "text-[#e8b44a]"
                          : "text-white/30 hover:text-white"
                      }`}
                      title="Favoritar canal"
                    >
                      <Star size={18} fill={favorites.includes(selectedChannel.id) ? "currentColor" : "none"} />
                    </button>
                  </div>
                  <p className="text-xs text-white/60 mt-0.5">
                    {currentProgram ? currentProgram.titulo : `Ao vivo · ${selectedChannel.categoria}`}
                  </p>
                </div>
              </div>

              {/* Botão Guia de Programação */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowEpgModal(true)}
                  className="ydo-btn-secondary"
                  style={{ padding: "8px 18px", fontSize: "0.85rem" }}
                  title="Abrir Guia de Programação (Tecla G)"
                >
                  <Calendar size={16} /> Guia EPG (G)
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Coluna Direita: Painel de Canais e Busca */}
        <div className="w-full lg:w-[460px] flex-shrink-0 flex flex-col gap-4">
          {/* Caixa de Pesquisa */}
          <div className="relative w-full">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              type="text"
              placeholder="Buscar entre 408 canais..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-4 py-3 rounded-xl bg-[#111320] border border-white/10 text-white placeholder-white/40 text-sm outline-none focus:border-[#e8b44a] transition-colors"
            />
          </div>

          {/* Categorias em Pílulas */}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            <button
              onClick={() => setActiveCategory("Todos")}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap ${
                activeCategory === "Todos"
                  ? "bg-[#e8b44a] text-black"
                  : "bg-white/5 text-white/70 hover:bg-white/10 border border-white/5"
              }`}
            >
              Todos ({data?.canais.length ?? 0})
            </button>

            {favorites.length > 0 && (
              <button
                onClick={() => setActiveCategory("Favoritos")}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                  activeCategory === "Favoritos"
                    ? "bg-[#e8b44a] text-black"
                    : "bg-white/5 text-white/70 hover:bg-white/10 border border-white/5"
                }`}
              >
                <Star size={12} fill="currentColor" /> Favoritos ({favorites.length})
              </button>
            )}

            {data?.categorias.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap ${
                  activeCategory === cat
                    ? "bg-[#e8b44a] text-black"
                    : "bg-white/5 text-white/70 hover:bg-white/10 border border-white/5"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Lista Virtualizada / Scrollável de Canais */}
          <div
            ref={channelsListRef}
            className="flex flex-col gap-2 max-h-[640px] overflow-y-auto pr-1"
          >
            {filteredChannels.length === 0 ? (
              <div className="p-8 text-center text-white/40 text-sm">
                Nenhum canal encontrado nesta categoria.
              </div>
            ) : (
              filteredChannels.map((channel) => {
                const isSelected = selectedChannel?.id === channel.id;
                const isFav = favorites.includes(channel.id);
                const prog = epgData[channel.id]?.[0];

                return (
                  <div
                    key={channel.id}
                    onClick={() => selectChannel(channel)}
                    className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all border ${
                      isSelected
                        ? "bg-[#161828] border-[#e8b44a] shadow-lg shadow-[#e8b44a]/5"
                        : "bg-[#111320] border-white/5 hover:border-white/15 hover:bg-[#141626]"
                    }`}
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="w-12 h-12 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden flex-shrink-0">
                        {channel.logo ? (
                          <img
                            src={channel.logo}
                            alt={channel.nome}
                            className="w-full h-full object-contain p-1"
                            loading="lazy"
                          />
                        ) : (
                          <span className="font-black text-[10px] text-[#e8b44a]">
                            {channel.nome.slice(0, 3).toUpperCase()}
                          </span>
                        )}
                      </div>

                      <div className="overflow-hidden">
                        <span className={`block text-sm font-bold truncate ${isSelected ? "text-[#e8b44a]" : "text-white"}`}>
                          {channel.nome}
                        </span>
                        <span className="block text-xs text-white/50 truncate">
                          {prog ? prog.titulo : channel.categoria}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {isSelected && (
                        <span className="w-2 h-2 rounded-full bg-[#e8b44a] animate-ping" />
                      )}
                      <button
                        onClick={(e) => toggleFavorite(e, channel.id)}
                        className={`p-1.5 rounded-full transition-colors ${
                          isFav ? "text-[#e8b44a]" : "text-white/20 hover:text-white"
                        }`}
                      >
                        <Star size={16} fill={isFav ? "currentColor" : "none"} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Modal Guia de Programação (EPG) */}
      {showEpgModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="relative w-full max-w-4xl max-h-[85vh] bg-[#0d0e15] border border-white/10 rounded-2xl p-6 overflow-y-auto text-white shadow-2xl flex flex-col gap-6">
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <div className="flex items-center gap-3">
                <Calendar size={22} className="text-[#e8b44a]" />
                <h2 className="text-xl font-black">Guia de Programação (EPG)</h2>
              </div>
              <button
                onClick={() => setShowEpgModal(false)}
                className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
                aria-label="Fechar Guia"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex flex-col gap-4">
              {data?.canais.slice(0, 20).map((c) => {
                const programs = epgData[c.id] || [];
                return (
                  <div key={c.id} className="p-4 rounded-xl bg-white/5 border border-white/5 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-white text-base">{c.nome}</span>
                        <span className="text-xs px-2 py-0.5 rounded bg-white/10 text-white/60">{c.categoria}</span>
                      </div>
                      <button
                        onClick={() => {
                          selectChannel(c);
                          setShowEpgModal(false);
                        }}
                        className="text-xs font-bold text-[#e8b44a] hover:underline"
                      >
                        Sintonizar Canal
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {programs.map((p, idx) => (
                        <div
                          key={idx}
                          className={`p-3 rounded-lg border text-xs flex flex-col gap-1 ${
                            p.aoVivo
                              ? "bg-[#e8b44a]/10 border-[#e8b44a]/30"
                              : "bg-white/5 border-white/5"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-white/50 flex items-center gap-1">
                              <Clock size={11} /> {p.inicio} - {p.fim}
                            </span>
                            {p.aoVivo && (
                              <span className="text-[10px] font-extrabold text-[#e8b44a] tracking-wider uppercase">
                                No Ar
                              </span>
                            )}
                          </div>
                          <span className="font-bold text-white text-sm">{p.titulo}</span>
                          <span className="text-white/60 line-clamp-2">{p.sinopse}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
