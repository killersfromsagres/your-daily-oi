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
type Forecast = {
  hourly?:{time?:string[];precipitation?:number[];rain?:number[];weather_code?:number[]};
  current?: {
    /** UTC current 15-minute model data; a regional estimate, not a turf sensor. */
    time?: string;
    interval?: number;
    precipitation?: number;
    rain?: number;
    showers?: number;
    weather_code?: number;
  };
};

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

/**
 * Current precipitation near the match venue. A zero value and non-rain WMO
 * code mean dry WEATHER; no statement is made about turf irrigation/drainage.
 * Open-Meteo current fields are 15-minute modeled data, not station sensors.
 */
export function estimatePitchFromCurrent(
  forecast: Forecast, city: string, now: Date = new Date(),
): PitchEstimate {
  const unavailable: PitchEstimate = {
    condicao: "indisponivel", cidade: city, chuvaMm: null,
    resumo: "Condições atuais não disponíveis", estimado: true, fonte: "Open-Meteo",
  };
  const current = forecast.current;
  if (!current || typeof current.time !== "string") return unavailable;
  const timestamp = Date.parse(/(?:Z|[+-]\d\d:\d\d)$/.test(current.time)
    ? current.time : current.time + "Z");
  if (!Number.isFinite(timestamp) ||
      Math.abs(now.getTime() - timestamp) > 90 * 60_000) return unavailable;

  const valid = (x: unknown): x is number =>
    typeof x === "number" && Number.isFinite(x) && x >= 0;
  const amounts = [current.precipitation, current.rain, current.showers].filter(valid);
  const code = current.weather_code;
  const hasCode = typeof code === "number" && Number.isFinite(code);
  if (!amounts.length && !hasCode) return unavailable;
  const raining = amounts.some(x => x > 0) ||
    (hasCode && ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) ||
      (code >= 95 && code <= 99)));
  const total = valid(current.precipitation)
    ? current.precipitation
    : (valid(current.rain) ? current.rain : 0) +
      (valid(current.showers) ? current.showers : 0);
  return {
    condicao: raining ? "molhado" : "seco",
    cidade: city, chuvaMm: Math.round(total * 100) / 100,
    resumo: raining ? "Chuva ou garoa agora na região" : "Sem chuva ou garoa agora na região",
    estimado: true, fonte: "Open-Meteo",
  };
}

/**
 * Stadium-specific locations where coordinates were checked against published
 * geographic references. Everything else falls back to the city of the venue.
 * Neo Química Arena: Sports Aspects; Arena do Grêmio: venue map coordinates.
 */
export function knownStadiumPoint(
  stadium?: string, city?: string,
): {lat:number;lon:number}|null {
  const venue=norm(stadium||"");
  const area=norm(city||"");
  if ((venue.includes("neo quimica") || venue.includes("arena corinthians")) &&
      (!area || area==="sao paulo")) return {lat:-23.5453,lon:-46.4743};
  if (venue.includes("arena do gremio") &&
      (!area || area==="porto alegre")) return {lat:-29.97333,lon:-51.19444};
  return null;
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
export async function getRegionalPitchEstimate(input: {
  estadio?: string; cidade?: string; pais?: string;
  /** Retained only for call compatibility; pitch UI displays current conditions. */
  inicioIso?: string; aoVivo?: boolean;
}, now = new Date()): Promise<PitchEstimate | null> {
  const city = resolveVenueCity(input.estadio, input.cidade);
  if (!city) return null;
  const country = normalizedCountryCode(input.pais) ||
    (resolveVenueCity(input.estadio) ? "BR" : undefined);
  // Use a 3-minute server cache; live conditions are refreshed by the client.
  const key = [norm(city), norm(input.estadio || ""), country || "",
    Math.floor(now.getTime() / 180_000)].join("|");
  const hit = estimateCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;

  const point = knownStadiumPoint(input.estadio, city) ||
    await pointForCity(city, country);
  if (!point) return null;
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(point.lat));
  url.searchParams.set("longitude", String(point.lon));
  url.searchParams.set("current", "precipitation,rain,showers,weather_code");
  url.searchParams.set("timezone", "UTC");
  url.searchParams.set("forecast_days", "1");
  const response = await fetch(url, { signal: AbortSignal.timeout(6200) });
  if (!response.ok) throw new Error("Current weather unavailable");
  const value = estimatePitchFromCurrent(await response.json() as Forecast, city, now);
  if (value.condicao !== "indisponivel") {
    limitedSet(estimateCache, key, { value, expires: Date.now() + 3 * 60_000 });
  }
  return value;
}
