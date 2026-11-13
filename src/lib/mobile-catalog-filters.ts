import { normalizeGenre } from "./genre-matching";
export type CatalogKind = "f" | "s" | "a";
export const CATALOG_KINDS: {id:CatalogKind;label:string}[] = [
  {id:"f",label:"Filmes"},{id:"s",label:"Séries"},{id:"a",label:"Animes"},
];
export interface CatalogCategory {label:string;slug:string}
const SCREEN_GENRES: CatalogCategory[] = [
  {label:"Todos",slug:""},{label:"Ação",slug:"acao"},{label:"Terror",slug:"terror"},
  {label:"Comédia",slug:"comedia"},{label:"Suspense",slug:"suspense"},{label:"Romance",slug:"romance"},
  {label:"Aventura",slug:"aventura"},{label:"Drama",slug:"drama"},{label:"Ficção científica",slug:"ficcao-cientifica"},
  {label:"Fantasia",slug:"fantasia"},{label:"Animação",slug:"animacao"},{label:"Documentário",slug:"documentario"},
];
export const CATALOG_CATEGORIES: Record<CatalogKind,CatalogCategory[]> = {
  f:SCREEN_GENRES,s:SCREEN_GENRES,
  a:[{label:"Todos",slug:""},{label:"Dublados",slug:"dublado"},{label:"Shōnen",slug:"sh-nen"},
    {label:"Ação",slug:"acao"},{label:"Aventura",slug:"aventura"},{label:"Comédia",slug:"comedia"},
    {label:"Drama",slug:"drama"},{label:"Fantasia",slug:"fantasia"},{label:"Sobrenatural",slug:"sobrenatural"},
    {label:"Romance",slug:"romance"},{label:"Ficção científica",slug:"ficcao-cientifica"}],
};
export function catalogKind(value:unknown):CatalogKind|null {
  if(typeof value!=="string")return null;
  if(["f","filme","filmes"].includes(value))return "f";
  if(["s","serie","series"].includes(value))return "s";
  if(["a","anime","animes"].includes(value))return "a";
  return null;
}
export function categorySlug(value:string):string {
  const normalized=normalizeGenre(value).replace(/ /g,"-");
  return ["shounen","shonen","sh-nen"].includes(normalized)?"sh-nen":normalized;
}
/** Only preserve categories offered by the selected content provider. */
export function compatibleCategory(kind:CatalogKind,value:string):string {
  const slug=categorySlug(value);
  return CATALOG_CATEGORIES[kind].some(item=>item.slug===slug)?slug:"";
}
export function catalogTarget(kind:CatalogKind,category="") {
  const slug=compatibleCategory(kind,category);
  if(kind==="a")return {to:"/animes" as const,search:{categoria:slug||undefined}};
  return {to:"/generos/$slug" as const,params:{slug:slug||(kind==="f"?"filmes":"series")},search:{tipo:kind}};
}
