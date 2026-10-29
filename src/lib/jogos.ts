/**
 * Módulo de Jogos do Dia (Brasileirão) — TheSportsDB
 * Cache em memória de 30 minutos com fallback resiliente
 */

import { loadCanais } from "./canais";

export interface JogoBrasileirao {
  id: string;
  casa: string;
  fora: string;
  escudoCasa?: string;
  escudoFora?: string;
  horarioLocal: string; // Ex.: "19:30"
  inicioIso: string;    // UTC ISO
  rodada?: string;      // Ex.: "R33"
  liga: string;         // "Brazilian Serie A" ou "Brazilian Serie B"
  canalId: string | null;
  canalNome: string | null;
  canalLogo: string | null;
}

interface JogosCacheEntry {
  atualizadoEm: string;
  jogos: JogoBrasileirao[];
  expires: number;
}

let jogosCache: JogosCacheEntry | null = null;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutos

export async function getJogosHoje(): Promise<{ atualizadoEm: string; jogos: JogoBrasileirao[] }> {
  const now = Date.now();
  if (jogosCache && now < jogosCache.expires) {
    return {
      atualizadoEm: jogosCache.atualizadoEm,
      jogos: jogosCache.jogos,
    };
  }

  try {
    // Calcula YYYY-MM-DD no fuso de Brasília (America/Sao_Paulo)
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const dateStr = formatter.format(new Date());

    const url = `https://www.thesportsdb.com/api/v1/json/123/eventsday.php?d=${dateStr}&s=Soccer`;
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      throw new Error(`TheSportsDB status ${res.status}`);
    }

    const data = (await res.json()) as { events?: Record<string, unknown>[] } | null;
    const rawEvents = data?.events || [];

    // Filtra eventos do Brasileirão Série A e Série B
    const serieA = rawEvents.filter((e) => e["strLeague"] === "Brazilian Serie A");
    const serieB = rawEvents.filter((e) => e["strLeague"] === "Brazilian Serie B");
    const brEvents = [...serieA, ...serieB];

    // Carrega canais de TV para associar transmissão (Premiere > SporTV > ESPN)
    let canais: { id: string; nome: string; logo?: string }[] = [];
    try {
      const canaisData = await loadCanais();
      canais = canaisData.canais || [];
    } catch {
      // continua sem canais
    }

    const canalPremiere = canais.find((c) => /premiere/i.test(c.nome));
    const canalSportv = canais.find((c) => /sportv/i.test(c.nome));
    const canalEspn = canais.find((c) => /espn/i.test(c.nome));
    const defaultCanal = canalPremiere || canalSportv || canalEspn;

    const jogos: JogoBrasileirao[] = brEvents.map((e) => {
      // Formatação de horário: strTimeLocal (ex.: "19:30:00" -> "19:30")
      let horarioLocal = "";
      if (e["strTimeLocal"]) {
        const parts = String(e["strTimeLocal"]).split(":");
        if (parts.length >= 2) {
          horarioLocal = `${parts[0]}:${parts[1]}`;
        } else {
          horarioLocal = String(e["strTimeLocal"]);
        }
      }

      return {
        id: String(e["idEvent"] || `${e["strHomeTeam"]}-${e["strAwayTeam"]}`),
        casa: String(e["strHomeTeam"] || "Casa"),
        fora: String(e["strAwayTeam"] || "Fora"),
        escudoCasa: e["strHomeTeamBadge"] ? String(e["strHomeTeamBadge"]) : undefined,
        escudoFora: e["strAwayTeamBadge"] ? String(e["strAwayTeamBadge"]) : undefined,
        horarioLocal,
        inicioIso: String(e["strTimestamp"] || ""),
        rodada: e["intRound"] ? `R${e["intRound"]}` : undefined,
        liga: String(e["strLeague"] || "Brasileirão"),
        canalId: defaultCanal?.id || null,
        canalNome: defaultCanal?.nome || null,
        canalLogo: defaultCanal?.logo || null,
      };
    });

    const atualizadoEm = new Date().toISOString();
    jogosCache = {
      atualizadoEm,
      jogos,
      expires: now + CACHE_TTL_MS,
    };

    return { atualizadoEm, jogos };
  } catch (err) {
    console.warn("[getJogosHoje] Falha ao consultar jogos do Brasileirão:", err);
    return {
      atualizadoEm: new Date().toISOString(),
      jogos: [],
    };
  }
}
