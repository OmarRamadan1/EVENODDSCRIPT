"""Extract brand assets (logo masks, pattern tiles, product shots) from the
original deck screenshots. Coordinates are expressed in a 1024x768 preview
space and scaled to the 2732x2048 source files."""

import os
from PIL import Image, ImageOps

SRC = os.path.join(os.path.dirname(__file__), "src")
OUT = os.path.dirname(__file__)
SCALE = 2732 / 1024.0

FILES = {
    "cover": "081DDC8C-4481-4DF8-8A62-201D475142E0_L0_001.jpg",
    "toc": "5809E2DA-60D1-46D4-B215-62E56FF37665_L0_001.jpg",
    "mono": "0C5B4232-D947-43A3-8D7C-6855FA75149F_L0_001.jpg",
    "lockup": "72102092-4EC8-4E50-A9A8-629DC56F119F_L0_001.jpg",
    "pattern": "2CBE13F2-BFB1-40C8-A144-F569988A3CAC_L0_001.jpg",
    "product": "1451F54D-B4EB-4E83-A142-056F3E04CF8E_L0_001.jpg",
}


def load(key):
    return Image.open(os.path.join(SRC, FILES[key])).convert("RGB")


def crop(im, box):
    x0, y0, x1, y1 = (int(v * SCALE) for v in box)
    return im.crop((x0, y0, x1, y1))


def save(im, name, width=None):
    if width and im.width != width:
        h = round(im.height * width / im.width)
        im = im.resize((width, h), Image.LANCZOS)
    path = os.path.join(OUT, name)
    im.save(path, quality=92)
    print(f"{name}: {im.size}")


def to_alpha_mask(im, threshold=205, pad=0.06):
    """Turn dark-ink-on-light-paper artwork into a transparent alpha mask so the
    logo can be recoloured in CSS instead of shipping one raster per colourway."""
    g = ImageOps.grayscale(im)
    alpha = g.point(lambda v: 0 if v >= threshold else int(255 * (threshold - v) / threshold))
    bbox = alpha.getbbox()
    if bbox:
        alpha = alpha.crop(bbox)
    p = round(max(alpha.size) * pad)
    canvas = Image.new("L", (alpha.width + 2 * p, alpha.height + 2 * p), 0)
    canvas.paste(alpha, (p, p))
    out = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    out.putalpha(canvas)
    black = Image.new("RGBA", canvas.size, (0, 0, 0, 255))
    black.putalpha(canvas)
    return black


def main():
    # --- logo: full lockup (Arabic + Latin) as a recolourable alpha mask ---
    mono = load("mono")
    lockup = to_alpha_mask(crop(mono, (600, 410, 755, 520)))
    lockup.save(os.path.join(OUT, "logo/lockup-mask.png"))
    print("logo/lockup-mask.png:", lockup.size)

    # --- logo: Arabic mark only (icon / monogram source) ---
    mark = to_alpha_mask(crop(mono, (600, 410, 755, 487)))
    mark.save(os.path.join(OUT, "logo/mark-mask.png"))
    print("logo/mark-mask.png:", mark.size)

    # --- reference crops of the existing lockups, kept for the audit pages ---
    save(crop(load("cover"), (280, 230, 745, 470)), "logo/ref-cover-lockup.jpg", 1200)
    save(crop(mono, (188, 362, 508, 572)), "logo/ref-mono-dark.jpg", 1000)
    lk = load("lockup")
    save(crop(lk, (88, 216, 383, 407)), "logo/ref-olive.jpg", 900)
    save(crop(lk, (84, 422, 380, 612)), "logo/ref-cream.jpg", 900)

    # --- pattern tiles (5 colourways from the original pattern page) ---
    pat = load("pattern")
    tiles = {
        "ink-on-white": (85, 4, 247, 256),
        "olive-emboss": (258, 4, 418, 256),
        "forest-emboss": (430, 4, 590, 256),
        "latte-emboss": (602, 4, 764, 256),
        "grey-on-white": (776, 4, 938, 256),
    }
    for name, box in tiles.items():
        save(crop(pat, box), f"pattern/{name}.jpg", 700)

    # --- large embossed texture from the cover (used for full-bleed sections) ---
    save(crop(load("cover"), (20, 90, 295, 630)), "pattern/cover-texture.jpg", 800)

    # --- product photography (cropped inside the template frames) ---
    prod = load("product")
    shots = {
        "roses": (136, 136, 328, 320),
        "bag": (390, 158, 586, 382),
        "daisies": (648, 136, 842, 372),
    }
    for name, box in shots.items():
        save(crop(prod, box), f"photo/{name}.jpg", 900)


if __name__ == "__main__":
    main()
