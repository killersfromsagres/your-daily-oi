import { FootballSymbol, SportsIcon } from "@/components/icons/ContentIcons";

type Props = {size?:number; className?:string | undefined};
export function FootballIcon({ size=20, className }: Props) {
  return <FootballSymbol size={size} className={className} role="img" aria-label="Bola de futebol" />;
}
export function CompetitionIcon({ size=20, className }: Props) {
  return <SportsIcon size={size} className={className} role="img" aria-label="Emblema de competição" />;
}
