// src/lib/tv-program.ts — pure helpers for verified "now and next" TV programming.
import type { ProgramaEPG } from "./epg";

export interface ProgramSlot {
  atual: ProgramaEPG | null;
  proximo: ProgramaEPG | null;
}

export type ProgramKind = "Filme" | "Série" | "Anime" | "Esportes" | "Notícias" |
  "Documentário" | "Infantil" | "Música" | "TV" | "Filmes e séries";

export interface ChannelProgramPreview {
  title: string | null;
  description: string | null;
  startTime: string | null;
  endTime: string | null;
  nextTitle: string | null;
  nextTime: string | null;
  kind: ProgramKind;
  status: "agora" | "em-breve" | "sem-grade";
  hasSchedule: boolean;
}

function fold(input: string): string {
  return input.toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ").trim();
}
function startMs(program: ProgramaEPG | null | undefined): number | null {
  const value = program?.inicioEm;
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}
function endMs(program: ProgramaEPG | null | undefined): number | null {
  const value = program?.fimEm;
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}
export function classifyProgramKind(program: ProgramaEPG | null | undefined, channelCategory: string): ProgramKind {
  const programText = fold([program?.categoria, program?.titulo, program?.descricao].filter(Boolean).join(" "));
  const channelText = fold(channelCategory);
  // The real EPG programme classification takes precedence over the channel category.
  if (/\b(anime|manga|anim[eê]s)\b/.test(programText)) return "Anime";
  if (/\b(documentario|documentary|documentarios)\b/.test(programText)) return "Documentário";
  if (/\b(serie|series|series tv|seriado|episodio|novela|telenovela|sitcom)\b/.test(programText)) return "Série";
  if (/\b(filme|movie|movies|cinema|longa metragem|feature film)\b/.test(programText)) return "Filme";
  if (/\b(futebol|esport[eis]*|sport[s]*|campeonato|formula 1|tenis|nba|ufc|luta)\b/.test(programText)) return "Esportes";
  if (/\b(notici[aa]s|news|jornal|telejornal)\b/.test(programText)) return "Notícias";
  if (/\b(infantil|kids|desenho|cartoon|criancas)\b/.test(programText)) return "Infantil";
  if (/\b(musica|music|show musical|clipe)\b/.test(programText)) return "Música";
  if (channelText.includes("anime")) return "Anime";
  if (channelText.includes("document")) return "Documentário";
  if (channelText.includes("infantil")) return "Infantil";
  if (channelText.includes("esport")) return "Esportes";
  if (channelText.includes("noticia")) return "Notícias";
  if (channelText.includes("filmes e series")) return "Filmes e séries";
  if (channelText.includes("musica")) return "Música";
  return "TV";
}

export function resolveChannelProgram(
  slot: ProgramSlot | undefined,
  channelCategory: string,
  now: number = Date.now(),
): ChannelProgramPreview {
  const current = slot?.atual || null;
  const next = slot?.proximo || null;
  const start = startMs(current);
  const end = endMs(current);
  // An expired programme must never be advertised as "AGORA", even if an old
  // client cache still includes it. The server normally sends exact intervals.
  const isCurrent = Boolean(current?.titulo) &&
    (start === null || start <= now) && (end === null || now < end);
  const nextStart = startMs(next);
  const nextEnd = endMs(next);
  // The next programme can become the current one while the browser keeps an
  // EPG snapshot. Promote it locally at the exact start time between refreshes.
  const nextIsCurrent = Boolean(next?.titulo) && nextStart !== null &&
    nextStart <= now && (nextEnd === null || now < nextEnd);
  const onAir = isCurrent ? current : nextIsCurrent ? next : null;
  const future = isCurrent ? next : nextIsCurrent ? null : (
    current && start !== null && start > now ? current :
    next && (nextStart === null || nextStart > now) ? next : null
  );
  const hasSchedule = Boolean(onAir?.titulo || future?.titulo);
  return {
    title: onAir?.titulo?.trim() || null,
    description: onAir?.descricao?.trim() || null,
    startTime: onAir?.horario || null,
    endTime: onAir?.fim || null,
    nextTitle: future?.titulo?.trim() || null,
    nextTime: future?.horario || null,
    kind: classifyProgramKind(onAir || future, channelCategory),
    status: onAir ? "agora" : future ? "em-breve" : "sem-grade",
    hasSchedule,
  };
}

export function searchableProgramText(slot: ProgramSlot | undefined): string {
  return [slot?.atual?.titulo, slot?.atual?.categoria, slot?.atual?.descricao,
    slot?.proximo?.titulo].filter(Boolean).join(" ");
}
