export interface LiveStreamSource {
  url: string;
  formato: "hls" | "ts" | "dash" | "mp4";
  qualidade?: string;
  nome?: string;
  referer?: string | null;
  agente?: string | null;
  chave?: string | null;
}

export interface LiveChannel {
  id: string;
  nome: string;
  logo: string;
  categoria: string;
  fontes: LiveStreamSource[];
  favorito?: boolean;
}

export interface LiveCategory {
  nome: string;
  total: number;
}

export interface RadioItem {
  nome: string;
  url: string;
  logo?: string;
}

export interface EpgProgram {
  canalId?: string;
  canalNome?: string;
  titulo: string;
  inicio: string; // "14:00"
  fim: string;    // "15:30"
  sinopse?: string;
  aoVivo?: boolean;
}

export interface ChannelsResponse {
  atualizado_em: string;
  categorias: string[];
  canais: LiveChannel[];
}
