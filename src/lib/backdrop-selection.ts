export interface BackdropArtwork {
  file_path:string;
  width:number;
  height:number;
  iso_639_1?:string|null;
  vote_average?:number;
  vote_count?:number;
}

/** Prefer genuine UHD, text-free widescreen artwork over a low-resolution default. */
export function selectBestBackdrop(images:BackdropArtwork[]):BackdropArtwork|null {
  const candidates=images.filter(image => /^\/[a-zA-Z0-9]+\.(jpg|png|webp)$/i.test(image.file_path) &&
    Number.isFinite(image.width) && Number.isFinite(image.height) &&
    image.width>=780 && image.height>=438 && image.width/image.height>=1.55 && image.width/image.height<=2.1);
  const tier=(image:BackdropArtwork)=>image.width>=3840&&image.height>=2160 ? 3
    : image.width>=1920&&image.height>=1080 ? 2 : 1;
  candidates.sort((a,b)=>tier(b)-tier(a) || Number(!b.iso_639_1)-Number(!a.iso_639_1) ||
    (b.vote_count||0)-(a.vote_count||0) || (b.vote_average||0)-(a.vote_average||0) ||
    b.width*b.height-a.width*a.height);
  return candidates[0]??null;
}
