#!/usr/bin/env python3
"""Genere les icones du site a partir du logo ImmoTopia.

    python apps/web/scripts/make-favicon.py

Outil ponctuel : les fichiers produits sont versionnes dans apps/web/public/.
On ne le relance que si le logo change.

Le logotype apps/web/src/assets/logo-immotopia.png est repris tel quel, rogne
de ses marges transparentes, centre dans un carre a FOND TRANSPARENT : l'icone
se pose donc directement sur la couleur de l'onglet du navigateur.

Une exception : apple-touch-icon.png garde un fond blanc. iOS ne gere pas la
transparence sur les icones d'ecran d'accueil et aplatit sur du NOIR — le mot
« Immo », en marine #00215E, y deviendrait illisible.

Le logotype fait 3,45:1 une fois rogne : dans un carre, il occupe toute la
largeur et moins d'un tiers de la hauteur. C'est la geometrie du logo, elle
n'est pas negociable ; en contrepartie le texte reste fin aux petites tailles.
C'est pourquoi on produit aussi les grandes tailles (128, 180, 192), qui sont
celles qu'utilisent les favoris, les onglets en haute densite et les ecrans
d'accueil mobiles, et ou le logotype redevient parfaitement lisible.
"""

import os
from pathlib import Path

from PIL import Image

SRC = Path(__file__).resolve().parent.parent / "src" / "assets" / "logo-immotopia.png"
PUBLIC = Path(__file__).resolve().parent.parent / "public"

WHITE = (255, 255, 255, 255)
TRANSPARENT = (0, 0, 0, 0)

# Part de la largeur du carre occupee par le logotype. Sans tuile de fond, il
# n'y a plus de bord visible a respecter : on pousse a 0.98 pour donner au
# logotype le maximum de pixels, ce qui compte a 16 et 32 px. Les 1 % restants
# de chaque cote absorbent l'anticrenelage.
FILL = 0.98


def load_logo() -> Image.Image:
    """Charge le logotype et retire ses marges transparentes."""
    im = Image.open(SRC).convert("RGBA")
    return im.crop(im.getbbox())


def draw_icon(
    logo: Image.Image, size: int, supersample: int = 4, background=TRANSPARENT
) -> Image.Image:
    """Compose le logotype centre dans un carre de `size` px.

    On redimensionne depuis la source pleine resolution vers la taille finale
    multipliee par `supersample`, puis on reduit : deux passes de LANCZOS
    donnent un texte nettement plus propre qu'une reduction directe brutale.
    """
    s = size * supersample
    tile = Image.new("RGBA", (s, s), background)

    w = int(s * FILL)
    h = max(1, round(w * logo.height / logo.width))
    resized = logo.resize((w, h), Image.LANCZOS)

    tile.alpha_composite(resized, ((s - w) // 2, (s - h) // 2))
    return tile.resize((size, size), Image.LANCZOS)


def main() -> None:
    PUBLIC.mkdir(parents=True, exist_ok=True)
    logo = load_logo()
    print(f"  logotype rogne : {logo.width}x{logo.height} ({logo.width / logo.height:.2f}:1)")

    # .ico multi-tailles : Windows, les favoris et les vieux navigateurs y piochent.
    ico_sizes = [16, 32, 48, 64, 128]
    frames = [draw_icon(logo, n) for n in ico_sizes]
    frames[-1].save(
        PUBLIC / "favicon.ico", format="ICO", sizes=[(n, n) for n in ico_sizes]
    )

    # PNG references explicitement par index.html : les navigateurs modernes
    # choisissent la taille la plus proche de leur densite d'ecran.
    # Sauvegardes en RGBA, sans .convert("RGB") qui aplatirait la transparence.
    for n in (32, 192):
        draw_icon(logo, n).save(PUBLIC / f"favicon-{n}.png", format="PNG")

    # Seule icone a garder un fond : iOS aplatit la transparence sur du noir,
    # ou le « Immo » marine disparaitrait.
    draw_icon(logo, 180, background=WHITE).convert("RGB").save(
        PUBLIC / "apple-touch-icon.png", format="PNG"
    )

    # Le favicon SVG de l'etape precedente n'a plus lieu d'etre : le logotype
    # est un bitmap, un SVG ne ferait que l'encapsuler sans rien gagner.
    obsolete = PUBLIC / "favicon.svg"
    if obsolete.exists():
        obsolete.unlink()
        print("  favicon.svg supprime (le logotype est un bitmap)")

    for f in sorted(PUBLIC.glob("favicon*")) + [PUBLIC / "apple-touch-icon.png"]:
        print(f"  {f.name:24s} {os.path.getsize(f):>7d} o")


if __name__ == "__main__":
    main()
