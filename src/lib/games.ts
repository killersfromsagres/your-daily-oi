export type Platform = "Steam" | "PlayStation" | "Xbox";

export type Game = {
  title: string;
  slug: string;
  genre: string;
  year: string;
  platform: Platform;
  appId: number;
  accent: string;
  trailerId: string;
  description: string;
};

export const games: Game[] = [
  { title: "Cyberpunk 2077", slug: "cyberpunk-2077", genre: "RPG de ação", year: "2020", platform: "Steam", appId: 1091500, accent: "#f8e71c", trailerId: "qIcTM8WXFjk", description: "Explore Night City como V, um mercenário em busca de um implante único que guarda o segredo da imortalidade." },
  { title: "Elden Ring", slug: "elden-ring", genre: "Soulslike", year: "2022", platform: "Steam", appId: 1245620, accent: "#d7a85b", trailerId: "E3Huy2cdih0", description: "Atravesse as Terras Intermédias, enfrente semideuses e reconstrua o Círculo Prístino em uma fantasia sombria de escala monumental." },
  { title: "Baldur's Gate 3", slug: "baldurs-gate-3", genre: "RPG", year: "2023", platform: "Steam", appId: 1086940, accent: "#f15d3a", trailerId: "1T22wNvoNiU", description: "Reúna seu grupo e construa uma história moldada por escolhas, alianças e combates estratégicos no universo de Forgotten Realms." },
  { title: "Helldivers 2", slug: "helldivers-2", genre: "Ação cooperativa", year: "2024", platform: "Steam", appId: 553850, accent: "#ffe84a", trailerId: "oD3pxbG9YYI", description: "Aliste-se nos Helldivers e espalhe a democracia gerenciada em batalhas cooperativas explosivas por uma galáxia hostil." },
  { title: "Red Dead Redemption 2", slug: "red-dead-redemption-2", genre: "Aventura", year: "2019", platform: "Steam", appId: 1174180, accent: "#ef342d", trailerId: "eaW0tYpxyp0", description: "Viva os últimos dias do Velho Oeste ao lado de Arthur Morgan e da gangue Van der Linde em uma jornada épica e humana." },
  { title: "Hades II", slug: "hades-2", genre: "Roguelike", year: "2024", platform: "Steam", appId: 1145350, accent: "#ff6f61", trailerId: "l-iHDj3EwdI", description: "Domine feitiçaria sombria como a Princesa do Submundo e enfrente o Titã do Tempo em combates velozes e sempre renovados." },
  { title: "Hogwarts Legacy", slug: "hogwarts-legacy", genre: "RPG de ação", year: "2023", platform: "Steam", appId: 990080, accent: "#62b9ff", trailerId: "1O6Qstncpnc", description: "Crie seu legado no mundo bruxo do século XIX, aprenda feitiços e descubra um segredo antigo escondido em Hogwarts." },
  { title: "Resident Evil 4", slug: "resident-evil-4", genre: "Survival horror", year: "2023", platform: "Steam", appId: 2050650, accent: "#d8d1bd", trailerId: "O75Ip4o1bs8", description: "Leon S. Kennedy parte para um vilarejo europeu isolado em uma missão de resgate que transforma sobrevivência em horror." },
  { title: "Forza Horizon 5", slug: "forza-horizon-5", genre: "Corrida", year: "2021", platform: "Steam", appId: 1551360, accent: "#ff49b8", trailerId: "FYH9n37B7Yw", description: "Lidere expedições pelo México em um festival automotivo vibrante, com centenas de carros e liberdade total para explorar." },
  { title: "The Witcher 3", slug: "the-witcher-3", genre: "RPG", year: "2015", platform: "Steam", appId: 292030, accent: "#e0493e", trailerId: "c0i88t0Kacs", description: "Assuma o papel de Geralt de Rívia e cace monstros enquanto procura Ciri em um continente devastado pela guerra." },

  { title: "God of War Ragnarök", slug: "god-of-war-ragnarok", genre: "Ação e aventura", year: "2024", platform: "PlayStation", appId: 2322010, accent: "#71c8ff", trailerId: "hfJ4Km46A-0", description: "Kratos e Atreus atravessam os Nove Reinos em busca de respostas enquanto as forças de Asgard se preparam para o Ragnarök." },
  { title: "Ghost of Tsushima", slug: "ghost-of-tsushima", genre: "Ação e aventura", year: "2024", platform: "PlayStation", appId: 2215430, accent: "#e84c55", trailerId: "jWduELi_IjI", description: "Torne-se o Fantasma e liberte Tsushima da invasão mongol em uma aventura samurai de beleza cinematográfica." },
  { title: "Marvel's Spider-Man", slug: "marvels-spider-man", genre: "Ação e aventura", year: "2022", platform: "PlayStation", appId: 1817070, accent: "#ef3546", trailerId: "8pR0o2fGyHg", description: "Balance entre os arranha-céus de Nova York como um Peter Parker experiente, equilibrando heroísmo e vida pessoal." },
  { title: "Spider-Man: Miles Morales", slug: "spider-man-miles-morales", genre: "Ação e aventura", year: "2022", platform: "PlayStation", appId: 1817190, accent: "#ff3b5c", trailerId: "NTunTURbyUU", description: "Miles Morales descobre poderes bioelétricos únicos enquanto aprende a proteger seu novo lar como Homem-Aranha." },
  { title: "The Last of Us Part I", slug: "the-last-of-us-part-1", genre: "Ação e sobrevivência", year: "2023", platform: "PlayStation", appId: 1888930, accent: "#98a58e", trailerId: "WxjeV10H1F0", description: "Joel e Ellie cruzam uma América devastada em uma história brutal sobre sobrevivência, confiança e sacrifício." },
  { title: "Horizon Forbidden West", slug: "horizon-forbidden-west", genre: "RPG de ação", year: "2024", platform: "PlayStation", appId: 2420110, accent: "#ff7b45", trailerId: "Lq594XmpPBg", description: "Acompanhe Aloy pelo Oeste Proibido e enfrente novas máquinas para salvar um planeta ameaçado por uma praga misteriosa." },
  { title: "Ratchet & Clank: Rift Apart", slug: "ratchet-and-clank-rift-apart", genre: "Plataforma", year: "2023", platform: "PlayStation", appId: 1895880, accent: "#50c9ff", trailerId: "9p_gg9UW9k4", description: "Salte instantaneamente entre dimensões com Ratchet, Clank e Rivet em uma aventura intergaláctica cheia de personalidade." },
  { title: "UNCHARTED: Legacy of Thieves", slug: "uncharted-legacy-of-thieves", genre: "Aventura", year: "2022", platform: "PlayStation", appId: 1659420, accent: "#f0b460", trailerId: "xeMA3O9pfiY", description: "Descubra cidades perdidas e enfrente perigos cinematográficos nas jornadas de Nathan Drake e Chloe Frazer." },
  { title: "Returnal", slug: "returnal", genre: "Roguelike", year: "2023", platform: "PlayStation", appId: 1649240, accent: "#5bd6dc", trailerId: "Jv4BjWoB-NA", description: "Quebre o ciclo de um planeta alienígena mutável em combates intensos onde cada morte transforma a próxima tentativa." },
  { title: "Days Gone", slug: "days-gone", genre: "Ação e sobrevivência", year: "2021", platform: "PlayStation", appId: 1259420, accent: "#d5b994", trailerId: "FKtaOY9lMvM", description: "Percorra um mundo aberto pós-pandêmico como Deacon St. John, encarando hordas e procurando uma razão para continuar." },

  { title: "Starfield", slug: "starfield", genre: "RPG espacial", year: "2023", platform: "Xbox", appId: 1716740, accent: "#f2b84b", trailerId: "kfYEiTdsyas", description: "Crie seu explorador e atravesse centenas de mundos em busca da resposta para o maior mistério da humanidade." },
  { title: "Halo Infinite", slug: "halo-infinite", genre: "FPS", year: "2021", platform: "Xbox", appId: 1240440, accent: "#56c98f", trailerId: "PyMlV5_HRWk", description: "Vista novamente a armadura do Master Chief e enfrente os Banished no vasto e perigoso Zeta Halo." },
  { title: "Forza Motorsport", slug: "forza-motorsport", genre: "Simulação de corrida", year: "2023", platform: "Xbox", appId: 2440510, accent: "#9c7cff", trailerId: "aL4h5cMONIs", description: "Construa carros, domine circuitos lendários e sinta cada detalhe da pista em uma experiência de competição sofisticada." },
  { title: "Sea of Thieves", slug: "sea-of-thieves", genre: "Aventura cooperativa", year: "2020", platform: "Xbox", appId: 1172620, accent: "#62e69f", trailerId: "r5JIBaasuE8", description: "Forme uma tripulação, navegue por mares imprevisíveis e escreva sua própria lenda pirata em um mundo compartilhado." },
  { title: "Grounded", slug: "grounded", genre: "Sobrevivência", year: "2022", platform: "Xbox", appId: 962130, accent: "#b9e94e", trailerId: "_BqgJ9nW468", description: "Sobreviva a um quintal gigantesco depois de ser reduzido ao tamanho de uma formiga, sozinho ou com amigos." },
  { title: "Hi-Fi RUSH", slug: "hi-fi-rush", genre: "Ação rítmica", year: "2023", platform: "Xbox", appId: 1817230, accent: "#ffdb3d", trailerId: "pgd4aU56Kig", description: "Ataque no ritmo da música como Chai e transforme cada batalha contra uma megacorporação em um videoclipe jogável." },
  { title: "Gears 5", slug: "gears-5", genre: "Tiro em terceira pessoa", year: "2019", platform: "Xbox", appId: 1097840, accent: "#e44b3d", trailerId: "h35_KOgslkM", description: "Acompanhe Kait Diaz em uma jornada para descobrir a origem dos Locust enquanto Sera enfrenta uma nova ameaça." },
  { title: "Microsoft Flight Simulator", slug: "microsoft-flight-simulator", genre: "Simulação", year: "2020", platform: "Xbox", appId: 1250410, accent: "#55b9f3", trailerId: "TYqJALPVn0Y", description: "Pilote aeronaves detalhadas por um planeta inteiro recriado com dados reais, clima dinâmico e precisão impressionante." },
  { title: "Ori and the Will of the Wisps", slug: "ori-and-the-will-of-the-wisps", genre: "Metroidvania", year: "2020", platform: "Xbox", appId: 1057090, accent: "#69dcff", trailerId: "2kPSl2vyu2Y", description: "Viaje por uma floresta encantadora e perigosa em uma aventura emocional com movimento fluido e arte deslumbrante." },
  { title: "Senua's Saga: Hellblade II", slug: "senuas-saga-hellblade-2", genre: "Ação e aventura", year: "2024", platform: "Xbox", appId: 2461850, accent: "#d88959", trailerId: "3VYGOkMnGCE", description: "Senua retorna em uma jornada brutal pela Islândia viking, encarando mitos, tirania e as sombras de sua própria mente." },
];

export const getGame = (slug: string) => games.find((game) => game.slug === slug);
export const coverUrl = (appId: number) => `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900_2x.jpg`;
export const wallpaperUrl = (appId: number) => `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_hero.jpg`;
