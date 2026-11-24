from pathlib import Path
from PIL import Image, ImageDraw
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "android/app/src/television/res"
def cropped(name):
    img = Image.open(ROOT / "public/brand" / name).convert("RGBA")
    return img.crop(img.getbbox()) if img.getbbox() else img
mark = cropped("zang-mark.webp")
word = cropped("zang-word.webp")
for density, side in (("mdpi",48),("hdpi",72),("xhdpi",96),("xxhdpi",144),("xxxhdpi",192)):
    out = OUT / ("mipmap-" + density)
    out.mkdir(parents=True,exist_ok=True)
    base = Image.new("RGBA",(side,side),(17,17,17,255))
    art=mark.copy()
    art.thumbnail((int(side*.78),int(side*.78)),Image.Resampling.LANCZOS)
    base.alpha_composite(art,((side-art.width)//2,(side-art.height)//2))
    base.save(out/"ic_launcher.png")
    mask=Image.new("L",(side,side),0)
    ImageDraw.Draw(mask).ellipse((0,0,side-1,side-1),fill=255)
    base.putalpha(mask)
    base.save(out/"ic_launcher_round.png")
out=OUT/"drawable-xhdpi"
out.mkdir(parents=True,exist_ok=True)
banner=Image.new("RGBA",(320,180),(17,17,17,255))
word.thumbnail((260,110),Image.Resampling.LANCZOS)
banner.alpha_composite(word,((320-word.width)//2,(180-word.height)//2))
banner.save(out/"tv_banner.png")
