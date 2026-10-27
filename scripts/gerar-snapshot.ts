import * as fs from "fs";
import * as path from "path";

const SAIMO_VOD_RAW =
  process.env.SAIMO_VOD_RAW ||
  "https://raw.githubusercontent.com/gabrielsaimo/SaimoPlayer/main/vod";

interface StreamItem {
  url: string;
  format: "hls" | "ts" | "mp4";
  audio: "dub" | "leg";
  priority: number;
}

interface SnapshotItem {
  id: string;
  tmdb_id: number | null;
  type: "f" | "s";
  title: string;
  poster_path: string;
  genres: string[];
  streams: StreamItem[];
}

function detectFormat(url: string): "hls" | "ts" | "mp4" {
  if (/\.m3u8(\?|$)/i.test(url) || /\.txt(\?|$)/i.test(url)) return "hls";
  if (/\.ts(\?|$)/i.test(url)) return "ts";
  return "mp4";
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao baixar ${url}: ${res.statusText}`);
  return res.text();
}

async function main() {
  console.log("Iniciando geração de snapshot do catálogo Saimo TV...");

  // 1. Baixar fichas.txt
  console.log("Baixando fichas.txt...");
  const fichasText = await fetchText(`${SAIMO_VOD_RAW}/fichas.txt`);
  const itemsMap = new Map<string, SnapshotItem>();

  for (const line of fichasText.split("\n")) {
    const parts = line.trim().split("\t");
    if (parts.length < 4) continue;
    const [tipo, title, tmdbRaw, posterPath, genresRaw] = parts;
    if (!title || (tipo !== "f" && tipo !== "s")) continue;

    const tmdbId = tmdbRaw && !isNaN(Number(tmdbRaw)) ? Number(tmdbRaw) : null;
    const genres = genresRaw
      ? genresRaw.split(",").map((g) => g.trim()).filter(Boolean)
      : [];
    const id = normalizeTitle(title);

    itemsMap.set(id, {
      id,
      tmdb_id: tmdbId,
      type: tipo as "f" | "s",
      title: title.trim(),
      poster_path: posterPath?.trim() || "",
      genres,
      streams: [],
    });
  }

  // 2. Baixar arquivos de filmes por letra
  const letters = ["#", ..."abcdefghijklmnopqrstuvwxyz".split("")];
  console.log(`Buscando streams em ${letters.length} arquivos de filmes...`);

  await Promise.all(
    letters.map(async (letra) => {
      try {
        const text = await fetchText(`${SAIMO_VOD_RAW}/filmes-${letra}.txt`);
        for (const line of text.split("\n")) {
          const parts = line.trim().split("\t");
          if (parts.length < 2) continue;
          const [title, ...streamSections] = parts;
          const id = normalizeTitle(title);
          const item = itemsMap.get(id);
          if (!item) continue;

          for (const sec of streamSections) {
            const isDub = sec.startsWith("dub=");
            const isLeg = sec.startsWith("leg=");
            if (!isDub && !isLeg) continue;

            const prefix = isDub ? "dub=" : "leg=";
            const audio = isDub ? "dub" : "leg";
            const urls = sec.slice(prefix.length).split(",");

            urls.forEach((url, i) => {
              const clean = url.trim();
              if (clean.startsWith("http://") || clean.startsWith("https://")) {
                item.streams.push({
                  url: clean,
                  format: detectFormat(clean),
                  audio,
                  priority: i,
                });
              }
            });
          }
        }
      } catch {
        // Ignora letras que não existirem
      }
    })
  );

  const snapshot = {
    version: "1.0.0",
    generated_at: new Date().toISOString(),
    total_items: itemsMap.size,
    items: Array.from(itemsMap.values()),
  };

  const outputDir = path.resolve(__dirname, "../public");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, "catalogo.json");
  fs.writeFileSync(outputPath, JSON.stringify(snapshot, null, 2), "utf-8");
  console.log(`Snapshot gerado com sucesso em: ${outputPath} (${itemsMap.size} títulos)`);
}

main().catch(console.error);
