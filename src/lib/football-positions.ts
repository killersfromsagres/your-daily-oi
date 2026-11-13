// Shared provider vocabulary. A player's side never changes their central role.
export type PlayerPosition = "GOL" | "DEF" | "MEI" | "ATA" | "ND";
export interface FootballPosition {
  code: string; label: string; group: PlayerPosition;
  side: -2 | -1 | 0 | 1 | 2; depth: number; wingback: boolean;
}
function role(code: string, label: string, group: PlayerPosition, side: FootballPosition["side"], depth: number, wingback = false): FootballPosition {
  return { code, label, group, side, depth, wingback };
}
const ALIASES: Record<string, string> = {
  g:"goalkeeper",gk:"goalkeeper",gl:"goalkeeper",gol:"goalkeeper",
  cb:"center defender",cd:"center defender",lcb:"center left defender",rcb:"center right defender",
  "cd l":"center left defender","cd r":"center right defender",zag:"center defender",
  lb:"left back",le:"left back",rb:"right back",ld:"right back",
  lwb:"left wing back",rwb:"right wing back",ale:"left wing back",ald:"right wing back",
  cm:"center midfielder","cm l":"center left midfielder","cm r":"center right midfielder",mc:"center midfielder",
  lcm:"center left midfielder",rcm:"center right midfielder",lcf:"center left forward",rcf:"center right forward",
  cdm:"defensive midfielder",dm:"defensive midfielder",vol:"defensive midfielder",
  cam:"attacking midfielder",am:"attacking midfielder",mat:"attacking midfielder",
  lm:"left midfielder",rm:"right midfielder",me:"left midfielder",md:"right midfielder",
  cf:"center forward",st:"striker",ca:"center forward",ss:"second striker",sa:"second striker",
  "cf l":"center left forward","cf r":"center right forward",
  lw:"left winger",rw:"right winger",pe:"left winger",pd:"right winger",
};
export function resolveFootballPosition(raw: string): FootballPosition {
  const normalized = raw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
  const p = ALIASES[normalized] || normalized;
  const left = /\b(left|esquerd\w*)\b/.test(p), right = /\b(right|direit\w*)\b/.test(p);
  const central = /\b(center|centre|central|zagueir\w*)\b/.test(p);
  const side = left ? -1 : right ? 1 : 0;
  const qualifier = left ? " pela esquerda" : right ? " pela direita" : "";
  if (/goal|goleir|keeper|portero|torwart/.test(p)) return role("GOL", "Goleiro", "GOL", 0, 0);
  // Match central defenders before full-backs: CD-L and CD-R are both ZAG.
  if (central && /defend|back|zagueir/.test(p)) return role("ZAG", "Zagueiro" + qualifier, "DEF", side, 10);
  if (/wing back|ala\b/.test(p)) {
    if (left) return role("ALE", "Ala esquerdo", "DEF", -2, 15, true);
    if (right) return role("ALD", "Ala direito", "DEF", 2, 15, true);
    return role("ALA", "Ala", "DEF", 0, 15, true);
  }
  if (/back|lateral/.test(p)) {
    if (left) return role("LE", "Lateral esquerdo", "DEF", -2, 10);
    if (right) return role("LD", "Lateral direito", "DEF", 2, 10);
    return role("DEF", "Defensor", "DEF", 0, 10);
  }
  if (/defend|zagueir|^def$|^df$/.test(p)) return role(central ? "ZAG" : "DEF", central ? "Zagueiro" : "Defensor", "DEF", side, 10);
  // A central forward on the left is a striker, not a left winger.
  if (/second striker|second forward|segundo atacante/.test(p)) return role("SA", "Segundo atacante" + qualifier, "ATA", side, 50);
  if ((central || /centroavante/.test(p)) && /forward|strik|atacant|centroavante/.test(p)) return role("CA", "Centroavante" + qualifier, "ATA", side, 50);
  if (/defensive midfield|defensive mid|volante|(?:meia|meio|midfield).*defensiv/.test(p)) return role("VOL", "Volante" + qualifier, "MEI", side, 20);
  if (/attacking midfield|attacking mid|(?:meia|meio|midfield).*ofensiv/.test(p)) return role("MAT", "Meia ofensivo" + qualifier, "MEI", side, 40);
  if (central && /midfield|meio camp|meia/.test(p)) return role("MC", "Meia central" + qualifier, "MEI", side, 30);
  if (/midfield|meio camp|meia|^mei$|^mf$/.test(p)) {
    if (left) return role("ME", "Meia esquerdo", "MEI", -2, 30);
    if (right) return role("MD", "Meia direito", "MEI", 2, 30);
    return role("MEI", "Meio-campista", "MEI", 0, 30);
  }
  if (/forward|strik|atacant|attack|winger|ponta|^ata$|^fw$/.test(p)) {
    if (left) return role("PE", "Atacante pela esquerda", "ATA", -2, 50);
    if (right) return role("PD", "Atacante pela direita", "ATA", 2, 50);
    return role(/strik/.test(p) ? "CA" : "ATA", /strik/.test(p) ? "Centroavante" : "Atacante", "ATA", 0, 50);
  }
  return role("—", "Posição não informada", "ND", 0, 60);
}
