import "@/game-detail.css";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, CalendarDays, ExternalLink, Gamepad2, Layers3, Link2, Play, ShieldCheck } from "lucide-react";
import { useState, type CSSProperties } from "react";
import { coverUrl, games, getGame, wallpaperUrl } from "@/lib/games";
import { PlatformLogo } from "@/components/platform-logo";

export const Route = createFileRoute("/jogo/$slug")({ component: GameDetail });

function GameDetail() {
  const { slug } = Route.useParams();
  const game = getGame(slug);
  const [magnetCopied, setMagnetCopied] = useState(false);

  if (!game) {
    return (
      <main className="detail-not-found">
        <Gamepad2 size={42} />
        <h1>Jogo não encontrado</h1>
        <p>O endereço pode estar incorreto ou este jogo não faz mais parte da seleção.</p>
        <a href="/"><ArrowLeft size={16} /> Voltar ao catálogo</a>
      </main>
    );
  }

  const handleMagnet = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(window.location.href);
      } else if (navigator.share) {
        await navigator.share({ title: game.title, url: window.location.href });
      } else {
        return;
      }

      setMagnetCopied(true);
      window.setTimeout(() => setMagnetCopied(false), 1800);
    } catch {
      setMagnetCopied(false);
    }
  };

  const related = games.filter((item) => item.platform === game.platform && item.slug !== game.slug).slice(0, 3);
  const pageStyle = {
    "--game-accent": game.accent,
    "--game-wallpaper": `url("${wallpaperUrl(game.appId)}")`,
  } as CSSProperties;

  return (
    <main className="game-detail" style={pageStyle}>
      <div className="game-detail__wallpaper" aria-hidden />
      <div className="game-detail__veil" aria-hidden />

      <header className="detail-header">
        <a className="brand brand--kfs" href="/" aria-label="Killers From Sagres — início"><span><Gamepad2 size={20} /></span>KILLERS FROM <strong>SAGRES</strong></a>
        <a className="detail-back" href="/" onClick={() => window.close()}>
          <ArrowLeft size={15} /> Fechar e voltar
        </a>
      </header>

      <section className="detail-hero">
        <div className="detail-copy">
          <span className="detail-platform"><PlatformLogo platform={game.platform} size={18} /><b>Seleção premium</b></span>
          <h1>{game.title}</h1>
          <p>{game.description}</p>
          <div className="detail-meta">
            <span><Layers3 size={15} /> {game.genre}</span>
            <span><CalendarDays size={15} /> {game.year}</span>
            <span><ShieldCheck size={15} /> Capa oficial</span>
          </div>
          <div className="detail-actions">
            <a className="detail-store" href={`https://store.steampowered.com/app/${game.appId}`} target="_blank" rel="noreferrer">
              Ver página oficial <ExternalLink size={15} />
            </a>
            <button
              className={`detail-magnet${magnetCopied ? " is-copied" : ""}`}
              type="button"
              onClick={handleMagnet}
              aria-label={magnetCopied ? "Link do jogo copiado" : `Copiar link de ${game.title}`}
              title="Copiar link deste jogo"
            >
              <Link2 size={17} strokeWidth={2.4} />
              <span>Magnet</span>
            </button>
            <span className="detail-magnet-feedback" aria-live="polite">
              {magnetCopied ? "Link copiado" : ""}
            </span>
          </div>
        </div>
        <div className="detail-cover">
          <img src={coverUrl(game.appId)} alt={`Capa oficial de ${game.title}`} />
          <div className="detail-cover-platform"><PlatformLogo platform={game.platform} size={19} /></div>
        </div>
      </section>

      <section className="trailer-section" aria-labelledby="trailer-title">
        <div className="trailer-heading">
          <div><span className="section-kicker">TRAILER OFICIAL</span><h2 id="trailer-title"><Play size={22} fill="currentColor" /> Assista à experiência</h2></div>
          <p>Player do YouTube em modo de privacidade aprimorada.</p>
        </div>
        <div className="trailer-player">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${game.trailerId}?rel=0&modestbranding=1`}
            title={`Trailer oficial de ${game.title}`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
            loading="lazy"
          />
        </div>
      </section>

      <section className="related-section">
        <div><span className="section-kicker">CONTINUE EXPLORANDO</span><h2 className="related-title">Mais jogos selecionados <PlatformLogo platform={game.platform} size={25} /></h2></div>
        <div className="related-grid">
          {related.map((item) => (
            <a key={item.slug} href={`/jogo/${item.slug}`} className="related-card">
              <img src={coverUrl(item.appId)} alt={`Capa de ${item.title}`} loading="lazy" />
              <span><small>{item.genre}</small><strong>{item.title}</strong></span>
            </a>
          ))}
        </div>
      </section>

      <footer className="detail-footer">
        <span>KILLERS FROM SAGRES / {game.title}</span>
        <p>Marcas, vídeos e imagens pertencem aos seus respectivos titulares.</p>
      </footer>
    </main>
  );
}
