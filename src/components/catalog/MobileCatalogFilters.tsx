"use client";
import { useEffect,useRef } from "react";
import { Link } from "@tanstack/react-router";
import { CATALOG_CATEGORIES,CATALOG_KINDS,catalogTarget,categorySlug,type CatalogKind } from "@/lib/mobile-catalog-filters";

interface Props {
  kind:CatalogKind|null;
  category?:string;
  home?:boolean;
  onCategorySelect?:(slug:string)=>void;
}
export function MobileCatalogFilters({kind,category="",home=false,onCategorySelect}:Props){
  const row=useRef<HTMLDivElement>(null);
  const selected=categorySlug(category);
  const categories=kind?CATALOG_CATEGORIES[kind]:[];
  useEffect(()=>{
    const element=row.current;
    const active=element?.querySelector<HTMLElement>('.zf-mobile-catalog-chip.is-selected');
    if(element&&active)element.scrollTo({left:Math.max(0,active.offsetLeft-element.clientWidth/2+active.clientWidth/2),behavior:"auto"});
  },[kind,selected]);
  return <section className={"zf-mobile-catalog"+(home?" zf-mobile-catalog--home":"")} aria-label="Escolher conteúdo e categoria">
    {home&&<p className="zf-mobile-catalog-label">EXPLORAR CATÁLOGO</p>}
    <nav className="zf-mobile-catalog-types" aria-label="Tipo de conteúdo">
      {CATALOG_KINDS.map(item=><Link key={item.id} {...catalogTarget(item.id,selected)} preload={false}
        className={"zf-mobile-catalog-type"+(kind===item.id?" is-selected":"")}
        aria-current={kind===item.id?"page":undefined}>{item.label}</Link>)}
    </nav>
    {kind&&<div ref={row} className="zf-mobile-catalog-categories" role="navigation" aria-label={"Categorias de "+CATALOG_KINDS.find(item=>item.id===kind)!.label.toLowerCase()}>
      {categories.map(item=><Link key={item.slug} {...catalogTarget(kind,item.slug)} preload={false} resetScroll={false}
        className={"zf-mobile-catalog-chip"+(selected===item.slug?" is-selected":"")}
        aria-current={selected===item.slug?"page":undefined}
        onClick={event=>{
          if(onCategorySelect&&event.button===0&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey){
            event.preventDefault();onCategorySelect(item.slug);
          }
        }}>{item.label}</Link>)}
    </div>}
  </section>;
}
