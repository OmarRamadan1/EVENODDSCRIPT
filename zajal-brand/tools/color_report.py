"""Compute CMYK starting values and WCAG contrast ratios for the Zajal palette.

CMYK here is a naive RGB->CMYK conversion and is only a starting point for the
printer; final values must be signed off on a wet proof.
"""

import itertools
import json

PALETTE = {
    "olive":   ("زيتوني زَجَل",    "Zajal Olive",  "#9DA471"),
    "deep":    ("زيتوني وظيفي",   "Olive Deep",   "#6E734A"),
    "ink":     ("حبر الزيتون",    "Olive Ink",    "#3D4530"),
    "latte":   ("لاتيه",          "Latte",        "#C5B096"),
    "clay":    ("طين",            "Clay",         "#6D5847"),
    "cream":   ("كريمي زَجَل",     "Zajal Cream",  "#FEF3E1"),
    "ivory":   ("عاجي",           "Ivory",        "#FBF8EF"),
    "white":   ("أبيض",           "White",        "#FFFFFF"),
    "smoke":   ("رمادي دخاني",    "Smoke",        "#8C8B80"),
}


def rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def cmyk(h):
    r, g, b = (v / 255 for v in rgb(h))
    k = 1 - max(r, g, b)
    if k >= 1:
        return (0, 0, 0, 100)
    c = (1 - r - k) / (1 - k)
    m = (1 - g - k) / (1 - k)
    y = (1 - b - k) / (1 - k)
    return tuple(round(v * 100) for v in (c, m, y, k))


def luminance(h):
    def ch(v):
        v /= 255
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = (ch(v) for v in rgb(h))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a, b):
    la, lb = luminance(a), luminance(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def verdict(ratio):
    if ratio >= 7:
        return "AAA"
    if ratio >= 4.5:
        return "AA"
    if ratio >= 3:
        return "AA Large"
    return "FAIL"


def main():
    out = {"colors": {}, "pairs": []}
    for key, (ar, en, hexv) in PALETTE.items():
        out["colors"][key] = {
            "ar": ar, "en": en, "hex": hexv.upper(),
            "rgb": rgb(hexv), "cmyk": cmyk(hexv),
            "luminance": round(luminance(hexv), 4),
        }
    for a, b in itertools.combinations(PALETTE, 2):
        r = contrast(PALETTE[a][2], PALETTE[b][2])
        out["pairs"].append({
            "fg": a, "bg": b, "ratio": round(r, 2), "verdict": verdict(r),
        })
    out["pairs"].sort(key=lambda p: -p["ratio"])
    print(json.dumps(out, ensure_ascii=False, indent=1))
    with open(__file__.replace("color_report.py", "colors.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
