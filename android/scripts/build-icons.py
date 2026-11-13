# android/scripts/build-icons.py — create branded Android launcher assets from the site's existing ZANG FLIX logo.
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "android/app/src/main/res"
SOURCE = next((ROOT / name for name in ("public/logo.png", "public/favicon.png") if (ROOT / name).exists()), None)
if SOURCE is None:
    raise SystemExit("ZANG FLIX logo is missing")

logo = Image.open(SOURCE).convert("RGBA")
bounds = logo.getbbox()
if bounds:
    logo = logo.crop(bounds)

for folder, side in (
    ("mipmap-mdpi", 48),
    ("mipmap-hdpi", 72),
    ("mipmap-xhdpi", 96),
    ("mipmap-xxhdpi", 144),
    ("mipmap-xxxhdpi", 192),
):
    folder_path = OUTPUT / folder
    folder_path.mkdir(parents=True, exist_ok=True)
    base = Image.new("RGBA", (side, side), (10, 11, 20, 255))
    thumb = logo.copy()
    thumb.thumbnail((int(side * .80), int(side * .80)), Image.Resampling.LANCZOS)
    x = (side - thumb.width) // 2
    y = (side - thumb.height) // 2
    base.alpha_composite(thumb, (x, y))
    base.save(folder_path / "ic_launcher.png")

    mask = Image.new("L", (side, side), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, side - 1, side - 1), fill=255)
    rounded = base.copy()
    rounded.putalpha(mask)
    rounded.save(folder_path / "ic_launcher_round.png")
print(f"Built ZANG FLIX launcher icons from {SOURCE.name}")
