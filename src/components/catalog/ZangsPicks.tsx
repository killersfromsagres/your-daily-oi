import {useCallback,useRef,useState} from "react";
import {Link} from "@tanstack/react-router";
import {ChevronLeft,ChevronRight,Play} from "lucide-react";
import type {CatalogItem} from "@/lib/types";
import {horrorSpotlightWindow,horrorSpotlightNext,horrorSpotlightPages,HORROR_SPOTLIGHT_PAGE_SIZE} from "@/lib/horror-spotlight";

interface Props {
  items: CatalogItem[];
  savedIds: Set<string>;
  onToggleSaved: (id:string)=>void;
}

export function ZangsPicks({items}:Props) {
  const [selectedId,setSelectedId] = useState("");
  const [previewId,setPreviewId] = useState("");
  const swiped = useRef(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const gestureStart = useRef<{x:number;y:number}|null>(null);
  const selectedIndex = Math.max(0,items.findIndex(item=>item.id === selectedId));
  const selected = items[selectedIndex];
  const visible = horrorSpotlightWindow(items,selectedIndex);
  const pageCount = horrorSpotlightPages(items.length);
  const activePage = Math.floor(selectedIndex / HORROR_SPOTLIGHT_PAGE_SIZE);

  const select = useCallback((index:number) => {
    if (!items.length) return;
    const item = items[((index % items.length) + items.length) % items.length];
    if (item) setSelectedId(item.id);
    setPreviewId("");
  },[items]);

  const step = useCallback((direction:-1|1) => {
    select(horrorSpotlightNext(selectedIndex,direction,items.length));
  },[select,selectedIndex,items.length]);

  if (!selected) return null;
  const preview = items.find(item=>item.id===previewId) || selected;

  return (
    <section className="zf-zangs-picks zf-horror-spotlight"
      aria-labelledby="zangs-picks-title">
      <div className="zf-horror-ambient" aria-hidden="true">
        <HorrorPoster key={preview.id + (preview.posterUrl || "")} item={preview}/>
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

        <div ref={stageRef} className="zf-horror-stage" role="region"
          aria-roledescription="carrossel" aria-label="Seleção de filmes de terror"
          tabIndex={0}
          onKeyDown={event=>{
            if(event.key==="ArrowRight" || event.key==="ArrowLeft") {
              requestAnimationFrame(()=>stageRef.current?.querySelector<HTMLAnchorElement>(".is-active")?.focus({preventScroll:true}));
            }
            if(event.key==="ArrowRight"){event.preventDefault();event.stopPropagation();step(1);}
            if(event.key==="ArrowLeft"){event.preventDefault();event.stopPropagation();step(-1);}
          }}
          onTouchStart={event=>{
            const touch=event.touches[0];
            if (!touch) return;
            swiped.current=false;
            gestureStart.current={x:touch.clientX,y:touch.clientY};
          }}
          onTouchEnd={event=>{
            const start=gestureStart.current;gestureStart.current=null;
            if(!start)return;
            const touch=event.changedTouches[0];
            if (!touch) return;
            const dx=touch.clientX-start.x,dy=touch.clientY-start.y;
            if(Math.abs(dx)>42 && Math.abs(dx)>Math.abs(dy)*1.2){
              swiped.current=true;
              step(dx<0?1:-1);
            }
          }}
          onTouchCancel={()=>{gestureStart.current=null;}}>
          <button type="button" className="zf-horror-arrow zf-horror-arrow--prev"
            onClick={()=>step(-1)} aria-label="Filme anterior">
            <ChevronLeft size={24} strokeWidth={1.7} aria-hidden="true"/>
          </button>
          <div className="zf-horror-strip" onMouseLeave={()=>setPreviewId("")}>
            {visible.map(({item,index,offset})=>{
              const active=index===selectedIndex;
              return <Link to={"/filme/" + item.id} key={item.id} data-offset={offset}
                className={"zf-horror-card"+(active?" is-active":"")}
                aria-label={"Assistir " + item.title}
                aria-current={active ? "true" : undefined}
                tabIndex={active ? 0 : -1}
                onMouseEnter={()=>setPreviewId(item.id)}
                onFocus={()=>setPreviewId(item.id)}
                onBlur={()=>setPreviewId("")}
                onClick={event=>{
                  if (swiped.current) { event.preventDefault(); swiped.current=false; return; }
                  if (window.matchMedia("(hover: none)").matches && !active) {
                    event.preventDefault(); select(index);
                  }
                }}>
                <span className="zf-horror-card-visual">
                  <HorrorPoster key={item.id + (item.posterUrl || "")} item={item}/>
                  <span className="zf-horror-card-tint" aria-hidden="true"/>
                  <span className="zf-horror-play" aria-hidden="true"><Play size={30} fill="currentColor" strokeWidth={1.5}/></span>
                </span>
              </Link>;
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


      </div>
    </section>
  );
}

/** Try the alternate catalog artwork before showing a readable placeholder. */
function HorrorPoster({item}:{item:CatalogItem}) {
  const [attempt,setAttempt] = useState(0);
  const path = item.tmdb?.posterPath || item.posterPath;
  const alternate = path ? (path.startsWith("http") ? path : `https://image.tmdb.org/t/p/w342/${path.replace(/^\//, "")}`) : "";
  const sources = [...new Set([item.posterUrl,alternate].filter(Boolean))];
  const src = sources[attempt];
  return src ? <img src={src} alt="" width={342} height={513}
    loading="eager" decoding="async" draggable={false}
    onError={()=>setAttempt(value=>value+1)}/>
    : <span className="zf-horror-card-fallback">{item.title}<small>Capa indisponível</small></span>;
}
