import {useCallback,useRef,useState} from "react";
import {Link} from "@tanstack/react-router";
import {ChevronLeft,ChevronRight,Play,Plus,Check,Star} from "lucide-react";
import type {CatalogItem} from "@/lib/types";
import {horrorSpotlightWindow,horrorSpotlightNext,horrorSpotlightPages,HORROR_SPOTLIGHT_PAGE_SIZE} from "@/lib/horror-spotlight";
import {catalogDisplayTitle} from "@/lib/catalog";

interface Props {
  items: CatalogItem[];
  savedIds: Set<string>;
  onToggleSaved: (id:string)=>void;
}

export function ZangsPicks({items,savedIds,onToggleSaved}:Props) {
  const [selectedId,setSelectedId] = useState("");
  const gestureStart = useRef<{x:number;y:number}|null>(null);
  const selectedIndex = Math.max(0,items.findIndex(item=>item.id === selectedId));
  const selected = items[selectedIndex];
  const visible = horrorSpotlightWindow(items,selectedIndex);
  const pageCount = horrorSpotlightPages(items.length);
  const activePage = Math.floor(selectedIndex / HORROR_SPOTLIGHT_PAGE_SIZE);

  const select = useCallback((index:number) => {
    if (!items.length) return;
    const item = items[((index % items.length) + items.length) % items.length];
    setSelectedId(item.id);
  },[items]);

  const step = useCallback((direction:-1|1) => {
    select(horrorSpotlightNext(selectedIndex,direction,items.length));
  },[select,selectedIndex,items.length]);

  if (!selected) return null;
  const detailPath = "/filme/" + selected.id;
  const backdrop = selected.tmdb?.backdropUrl || selected.posterUrl || "";
  const year = selected.tmdb?.releaseYear;
  const rating = selected.tmdb?.voteAverage;
  const hasPlayableSource = selected.streams.length > 0;
  const isSaved = savedIds.has(selected.id);

  return (
    <section className="zf-zangs-picks zf-horror-spotlight"
      aria-labelledby="zangs-picks-title">
      <div className="zf-horror-ambient" aria-hidden="true">
        {backdrop && <img key={selected.id} src={backdrop} alt="" loading="lazy" decoding="async"/>}
      </div>
      <div className="zf-horror-surface">
        <header className="zf-zangs-picks-heading zf-horror-header">
          <div>
            <p className="zf-horror-kicker">SELEÇÃO ZANG FLIX <span aria-hidden="true">/</span> NOITE DE TERROR</p>
            <h2 id="zangs-picks-title" className="zf-horror-title">Mais <span>terror</span> na sua noite</h2>
          </div>
          <span className="zf-horror-count" aria-label={"Filme " + (selectedIndex+1) + " de " + items.length}>
            {String(selectedIndex+1).padStart(2,"0")} <i>/</i> {String(items.length).padStart(2,"0")}
          </span>
        </header>

        <div className="zf-horror-stage" role="region"
          aria-roledescription="carrossel" aria-label="Seleção de filmes de terror"
          tabIndex={0}
          onKeyDown={event=>{
            if(event.key==="ArrowRight"){event.preventDefault();step(1);}
            if(event.key==="ArrowLeft"){event.preventDefault();step(-1);}
          }}
          onTouchStart={event=>{
            const touch=event.touches[0];
            gestureStart.current={x:touch.clientX,y:touch.clientY};
          }}
          onTouchEnd={event=>{
            const start=gestureStart.current;gestureStart.current=null;
            if(!start)return;
            const touch=event.changedTouches[0];
            const dx=touch.clientX-start.x,dy=touch.clientY-start.y;
            if(Math.abs(dx)>42 && Math.abs(dx)>Math.abs(dy)*1.2){
              step(dx<0?1:-1);
            }
          }}
          onTouchCancel={()=>{gestureStart.current=null;}}>
          <button type="button" className="zf-horror-arrow zf-horror-arrow--prev"
            onClick={()=>step(-1)} aria-label="Filme anterior">
            <ChevronLeft size={24} strokeWidth={1.7} aria-hidden="true"/>
          </button>
          <div className="zf-horror-strip">
            {visible.map(({item,index,offset})=>{
              const active=index===selectedIndex;
              return <button type="button" key={item.id} data-offset={offset}
                className={"zf-horror-card"+(active?" is-active":"")}
                aria-label={"Selecionar " + catalogDisplayTitle(item)}
                aria-pressed={active}
                onClick={()=>select(index)}>
                <span className="zf-horror-card-visual">
                  {item.posterUrl
                    ? <img src={item.posterUrl} alt="" loading={active?"eager":"lazy"} decoding="async" draggable={false}/>
                    : <span className="zf-horror-card-fallback">{item.title.slice(0,2).toUpperCase()}</span>}
                  <span className="zf-horror-card-tint" aria-hidden="true"/>
                </span>
                <span className="zf-horror-card-name">{catalogDisplayTitle(item)}</span>
                {active && <span className="zf-horror-card-selected" aria-hidden="true">EM DESTAQUE</span>}
              </button>;
            })}
          </div>
          <button type="button" className="zf-horror-arrow zf-horror-arrow--next"
            onClick={()=>step(1)} aria-label="Próximo filme">
            <ChevronRight size={24} strokeWidth={1.7} aria-hidden="true"/>
          </button>
        </div>

        <div className="zf-horror-pagination" aria-label="Páginas dos filmes de terror">
          {Array.from({length:pageCount},(_,page)=>(
            <button type="button" key={page}
              className={"zf-horror-page-dot"+(page===activePage?" is-current":"")}
              aria-label={"Mostrar grupo " + (page+1) + " de filmes"}
              aria-current={page===activePage?"true":undefined}
              onClick={()=>select(page*HORROR_SPOTLIGHT_PAGE_SIZE)}/>
          ))}
        </div>

        <div className="zf-horror-selected-info" aria-live="polite" aria-atomic="true">
          <div className="zf-horror-film-copy">
            <span className="zf-horror-selected-label">FILME SELECIONADO</span>
            <h3>{catalogDisplayTitle(selected)}</h3>
            <p>
              {year && <span>{year}</span>}
              {typeof rating==="number" && rating>0 && <span className="zf-horror-rating"><Star size={12} fill="currentColor" aria-hidden="true"/>{rating.toFixed(1)}</span>}
              {selected.genres.slice(0,2).map(genre=><span key={genre}>{genre}</span>)}
            </p>
          </div>
          <div className="zf-horror-film-actions">
            <button type="button" className="zf-horror-save"
              aria-label={isSaved?"Remover da minha lista":"Adicionar à minha lista"}
              aria-pressed={isSaved}
              onClick={()=>onToggleSaved(selected.id)}>
              {isSaved?<Check size={18} aria-hidden="true"/>:<Plus size={18} aria-hidden="true"/>}
            </button>
            <Link to={detailPath} className="zf-horror-watch"
              aria-label={"Ver filme " + catalogDisplayTitle(selected)}>
              <Play size={16} fill="currentColor" aria-hidden="true"/>
              {hasPlayableSource?"Assistir agora":"Ver filme"}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
