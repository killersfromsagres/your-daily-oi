// ZANG FLIX pictograms: one 24 px outline grid and stable content meanings.
import { createLucideIcon } from "lucide-react";
export {
  Film as MovieIcon, Clapperboard as SeriesIcon, TvMinimal as TelevisionIcon,
  Trophy as SportsIcon, Radio as RadioIcon, CalendarDays as ReleaseIcon,
  Heart as FavoriteIcon, Star as RatingIcon,
} from "lucide-react";

// Animation cels: overlapping frames and a restrained play mark. Shared by
// headings, navigation, search, channel metadata and anime fallback artwork.
export const AnimeIcon = createLucideIcon("AnimationFrames", [
  ["rect", { x: "3", y: "7", width: "14", height: "14", rx: "2.5", key: "cel" }],
  ["path", { d: "M7 3h11a3 3 0 0 1 3 3v11", key: "frames" }],
  ["path", { d: "m8.5 11 4.5 3-4.5 3z", key: "play" }],
]);

export const FootballSymbol = createLucideIcon("FootballOutline", [
  ["circle", { cx: "12", cy: "12", r: "9", key: "ball" }],
  ["path", { d: "m12 7 4.6 3.3-1.8 5.4H9.2l-1.8-5.4L12 7Z", key: "panel" }],
  ["path", { d: "M12 3v4m8.5 2.1-3.9 1.2m.8 9.1-2.4-3.7m-6 0-2.4 3.7m.8-9.1L3.5 9.1", key: "seams" }],
]);
