// src/lib/pitch-weather.ts — regional weather estimates, never a physical turf sensor.
// The Open-Meteo hourly forecast provides precipitation near the stadium/city.
// The real pitch can be irrigated, covered or drained independently of the weather.
export type PitchState = "seco" | "molhado" | "indisponivel";
export interface PitchEstimate {
  condicao: PitchState;
  cidade: string;
  chuvaMm: number | null;
  resumo: string;
  estimado: true;
  fonte: "Open-Meteo";
}
type Forecast = {hourly?:{time?:string[];precipitation?:number[];rain?:number[];weather_code?:number[]}};

const norm = (s:string) => (s || "").normalize("NFD")
  .replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();

// Only fall back to a known city for venues with distinctive names.
// Unknown venues remain unknown rather than sending weather for the wrong match.
const STADIUM_CITIES: readonly [string,string][] = [
  ["neo quimica","São Paulo"], ["arena corinthians","São Paulo"],
  ["allianz parque","São Paulo"], ["morumbi","São Paulo"], ["pacaembu","São Paulo"],
  ["mineirao","Belo Horizonte"], ["arena mrv","Belo Horizonte"],
  ["arena do gremio","Porto Alegre"], ["beira rio","Porto Alegre"],
  ["maracana","Rio de Janeiro"], ["nilton santos","Rio de Janeiro"],
  ["engenhao","Rio de Janeiro"], ["sao januario","Rio de Janeiro"],
  ["arena fonte nova","Salvador"], ["barradao","Salvador"],
  ["arena da baixada","Curitiba"], ["ligga arena","Curitiba"], ["couto pereira","Curitiba"],
  ["castelao","Fortaleza"], ["presidente vargas","Fortaleza"],
  ["arena pantanal","Cuiabá"], ["serra dourada","Goiânia"],
  ["mane garrincha","Brasília"], ["vila belmiro","Santos"],
  ["arena pernambuco","São Lourenço da Mata"], ["ilha do retiro","Recife"],
  ["arruda","Recife"], ["aflitos","Recife"],
  ["arena das dunas","Natal"], ["rei pele","Maceió"],
  ["heriberto hulse","Criciúma"], ["alfredo jaconi","Caxias do Sul"],
  ["centenario","Caxias do Sul"], ["brinco de ouro","Campinas"],
  ["moises lucarelli","Campinas"], ["nabi abi chedid","Bragança Paulista"],
  ["jose maria de campos maia","Mirassol"], ["maiao","Mirassol"],
  ["ressacada","Florianópolis"], ["orlando scarpelli","Florianópolis"],
  ["vitoria","Vitória"], ["kleber andrade","Cariacica"],
  ["jornalista mario filho","Rio de Janeiro"],
];
export function resolveVenueCity(stadium?:string, city?:string):string|null {
  const cleanCity = (city || "").trim();
  if (cleanCity.length >= 3 && cleanCity.length <= 100 &&
      /^[\p{L} .'-]+$/u.test(cleanCity) &&
      !/^(tbd|unknown|to be confirmed|a definir|nao definido)$/i.test(norm(cleanCity))) return cleanCity;
  const name = norm(stadium || "");
  if (!name) return null;
  return STADIUM_CITIES.find(([venue]) => name.includes(venue))?.[1] || null;
}
export function normalizedCountryCode(country?:string):string|undefined {
  const clean=norm(country||"");
  if (/^(br|bra|brasil|brazil)$/.test(clean)) return "BR";
  const raw=(country||"").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(raw)?raw:undefined;
}
const rainy = (code:number) =>
  (code>=51 && code<=67) || (code>=71 && code<=86) || (code>=95 && code<=99);

/**
 * Samples the kickoff (or current in-play) hour and two previous hours.
 * Zero precipitation is only a regional dry-weather indication, not proof
 * that a stadium's irrigation system or ground is dry.
 */
export function estimatePitchFromForecast(
  forecast: Forecast, targetIso: string, city:string,
): PitchEstimate {
  const times=forecast.hourly?.time || [];
  const precipitation=forecast.hourly?.precipitation || [];
  const codes=forecast.hourly?.weather_code || [];
  const rain=forecast.hourly?.rain || [];
  const target=Date.parse(targetIso);
  const unavailable:PitchEstimate = {
    condicao:"indisponivel",cidade:city,chuvaMm:null,
    resumo:"Clima da região não disponível",estimado:true,fonte:"Open-Meteo",
  };
  if (!Number.isFinite(target) || !times.length) return unavailable;
  let index=-1, distance=Number.POSITIVE_INFINITY;
  for(let i=0;i<times.length;i++){
    const parsed=Date.parse(times[i]!.endsWith("Z")?times[i]!:times[i]+"Z");
    const gap=Math.abs(parsed-target);
    if (gap<distance){index=i;distance=gap;}
  }
  if (index<0 || distance>60*60_000) return unavailable;
  let sum=0,hasData=false,hasRainCode=false;
  for(let i=Math.max(0,index-2);i<=index;i++){
    const mm=Number(precipitation[i] ?? rain[i]);
    if(Number.isFinite(mm) && mm>=0){sum+=mm;hasData=true;}
    const code=Number(codes[i]);
    if(Number.isFinite(code) && rainy(code)){hasRainCode=true;hasData=true;}
  }
  if(!hasData)return unavailable;
  const isWet=sum>=0.1 || hasRainCode;
  return {
    condicao:isWet?"molhado":"seco",cidade:city,
    chuvaMm:Math.round(sum*10)/10,
    resumo:isWet?"Chuva ou garoa na região":"Sem chuva recente na região",
    estimado:true,fonte:"Open-Meteo",
  };
}

const geocache=new Map<string,{point:{lat:number;lon:number}|null;expires:number}>();
const estimateCache=new Map<string,{value:PitchEstimate;expires:number}>();
function limitedSet<K,V>(map:Map<K,V>,key:K,value:V){
  if(map.size>=160)map.delete(map.keys().next().value!);
  map.set(key,value);
}
async function pointForCity(city:string,country?:string):Promise<{lat:number;lon:number}|null>{
  const key=norm(city)+"|"+(country||"");
  const hit=geocache.get(key);
  if(hit && hit.expires>Date.now())return hit.point;
  const url=new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name",city);
  url.searchParams.set("count","5");
  url.searchParams.set("language","pt");
  if(country)url.searchParams.set("countryCode",country);
  const response=await fetch(url,{signal:AbortSignal.timeout(5600)});
  if(!response.ok)throw Error("Geocoding unavailable");
  const body=await response.json() as {results?:Array<{name?:string;country_code?:string;latitude?:number;longitude?:number}>};
  const matching=body.results?.find(p=>norm(p.name||"")===norm(city)&&
    (!country || p.country_code?.toUpperCase()===country));
  const point=matching && Number.isFinite(matching.latitude) && Number.isFinite(matching.longitude)
    ? {lat:matching.latitude!,lon:matching.longitude!}:null;
  limitedSet(geocache,key,{point,expires:Date.now()+12*60*60_000});
  return point;
}
export async function getRegionalPitchEstimate(input:{
  estadio?:string;cidade?:string;pais?:string;inicioIso:string;aoVivo:boolean;
}, now=new Date()):Promise<PitchEstimate|null>{
  const city=resolveVenueCity(input.estadio,input.cidade);
  if(!city)return null;
  const when=input.aoVivo?now.getTime():Date.parse(input.inicioIso);
  if(!Number.isFinite(when) || Math.abs(when-now.getTime())>7*86400000)return null;
  const country=normalizedCountryCode(input.pais)||
    (resolveVenueCity(input.estadio)?"BR":undefined);
  const key=[norm(city),country||"",Math.floor(when/3600000)].join("|");
  const cached=estimateCache.get(key);
  if(cached&&cached.expires>Date.now())return cached.value;
  const point=await pointForCity(city,country);
  if(!point)return null;
  const url=new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude",String(point.lat));
  url.searchParams.set("longitude",String(point.lon));
  url.searchParams.set("hourly","precipitation,rain,weather_code");
  url.searchParams.set("timezone","UTC");
  url.searchParams.set("past_days","3");
  url.searchParams.set("forecast_days","7");
  const response=await fetch(url,{signal:AbortSignal.timeout(6200)});
  if(!response.ok)throw Error("Weather unavailable");
  const forecast=await response.json() as Forecast;
  const value=estimatePitchFromForecast(forecast,new Date(when).toISOString(),city);
  limitedSet(estimateCache,key,{value,expires:Date.now()+10*60_000});
  return value;
}
