#!/usr/bin/env python3
"""Génère le site de l'APSAL à partir de _src/ (actus en Markdown, gabarits Jinja).

Usage : python3 _src/build.py
Les pages HTML sont écrites à la racine du dépôt (servie par GitHub Pages).
L'agenda n'est PAS généré ici : il est lu en direct depuis /agenda.ics par assets/js/agenda.js.
"""
import datetime as dt
import math
import pathlib
import re

import jinja2
import markdown
import yaml

RACINE = pathlib.Path(__file__).resolve().parent.parent
SRC = RACINE / "_src"
SITE = "https://apsal-lyon.github.io"
TALLY_ID = "PR9kjP"
MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août",
        "septembre", "octobre", "novembre", "décembre"]


def date_fr(d):
    return f"{d.day}{'er' if d.day == 1 else ''} {MOIS[d.month - 1]} {d.year}"


# ---------- Visuels : l'éventail de la coquille et les motifs des actus ----------

def eventail(nb=7, cx=250, cy=332, r=242, debut=192, fin=348):
    """Côtes de coquille Saint-Jacques en éventail (SVG), reprises du logo."""
    teintes = ["#5FA8DC", "#8CC3EA", "#4B97CF", "#A9D3F0", "#5FA8DC", "#8CC3EA", "#4B97CF"]
    pas = (fin - debut) / nb
    morceaux = []
    for i in range(nb):
        a1, a2 = math.radians(debut + i * pas), math.radians(debut + (i + 1) * pas)
        x1, y1 = cx + r * math.cos(a1), cy + r * math.sin(a1)
        x2, y2 = cx + r * math.cos(a2), cy + r * math.sin(a2)
        bombe = r * 0.11
        am = (a1 + a2) / 2
        qx, qy = cx + (r + bombe) * math.cos(am), cy + (r + bombe) * math.sin(am)
        morceaux.append(
            f'<path class="cote" d="M{cx},{cy} L{x1:.1f},{y1:.1f} Q{qx:.1f},{qy:.1f} {x2:.1f},{y2:.1f} Z" '
            f'fill="{teintes[i % len(teintes)]}" stroke="#1E7FC2" stroke-width="3" stroke-linejoin="round"/>')
    arc = (f'<path d="M30,262 C22,120 130,18 262,14 C380,12 462,86 478,160" fill="none" stroke="#F5C61E" '
           f'stroke-width="9" stroke-linecap="round"/>')
    return (f'<svg class="eventail" viewBox="0 0 500 460" aria-hidden="true" focusable="false">'
            f'<g>{"".join(morceaux)}</g>{arc}</svg>')


ICONES = {
    "billet": '<path d="M6 14h36v6a4 4 0 0 0 0 8v6H6v-6a4 4 0 0 0 0-8z"/><path d="M30 14v20" stroke-dasharray="3 3"/>',
    "cadeau": '<rect x="8" y="18" width="32" height="22" rx="2"/><path d="M6 12h36v6H6zM24 12v28"/><path d="M24 12c-3-6-12-6-10 0M24 12c3-6 12-6 10 0"/>',
    "balade": '<path d="M24 42s12-11 12-20a12 12 0 0 0-24 0c0 9 12 20 12 20z"/><circle cx="24" cy="22" r="4"/>',
    "notes": '<path d="M18 34V10l20-4v24"/><circle cx="13" cy="34" r="5"/><circle cx="33" cy="30" r="5"/><path d="M18 16l20-4"/>',
    "sapin": '<path d="M24 5l10 13h-6l9 11h-7l8 10H10l8-10h-7l9-11h-6z"/><path d="M24 39v5"/>',
    "verres": '<path d="M12 6h10l-1 12a4 4 0 0 1-8 0zM17 22v14M12 36h10"/><path d="M28 10h10l-1 12a4 4 0 0 1-8 0zM33 26v12M28 38h10"/>',
    "etoile": '<path d="M24 6l5 11 12 1-9 8 3 12-11-7-11 7 3-12-9-8 12-1z"/>',
    "main": '<path d="M14 26V14a3 3 0 0 1 6 0v8M20 20v-9a3 3 0 0 1 6 0v9M26 20v-7a3 3 0 0 1 6 0v11M32 22a3 3 0 0 1 6 0v6c0 8-6 14-13 14-6 0-9-3-12-8l-5-8a3 3 0 0 1 5-3l2 3"/>',
}


def icone(nom, cls=""):
    return (f'<svg class="{cls}" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" '
            f'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">{ICONES[nom]}</svg>')


MOTIFS = {  # fond, couleur des côtes, icône, couleur de l'icône
    "cadeau": ("#C9356C", "#D9578A", "cadeau", "#FFFFFF"),
    "tombola": ("#F5C61E", "#F8D454", "billet", "#17324D"),
    "balade": ("#1E7FC2", "#3A93D1", "balade", "#FFFFFF"),
    "danse": ("#17324D", "#24496D", "notes", "#F5C61E"),
    "noel": ("#135C90", "#1E7FC2", "sapin", "#F5C61E"),
    "rentree": ("#F5C61E", "#F8D454", "verres", "#17324D"),
}


def couverture(motif):
    fond, cote, ico, coul = MOTIFS[motif]
    rayons = []
    for i in range(9):
        a = math.radians(200 + i * 17.5)
        rayons.append(f'<path d="M200,330 L{200 + 420 * math.cos(a):.0f},{330 + 420 * math.sin(a):.0f}" '
                      f'stroke="{cote}" stroke-width="26" stroke-linecap="round"/>')
    return (f'<svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">'
            f'<rect width="400" height="300" fill="{fond}"/>{"".join(rayons)}'
            f'<circle cx="200" cy="168" r="78" fill="{fond}"/>'
            f'<g transform="translate(152 120) scale(2)" fill="none" stroke="{coul}" stroke-width="2.2" '
            f'stroke-linecap="round" stroke-linejoin="round">{ICONES[ico]}</g></svg>')


# ---------- Contenus ----------

def lire_actus():
    actus = []
    for f in sorted((SRC / "actus").glob("*.md"), reverse=True):
        brut = f.read_text(encoding="utf-8")
        _, entete, corps = brut.split("---", 2)
        meta = yaml.safe_load(entete)
        meta["slug"] = re.sub(r"^\d{4}-\d{2}-\d{2}-", "", f.stem)
        meta["url"] = f"/actus/{meta['slug']}/"
        meta["date_fr"] = date_fr(meta["date"])
        meta["html"] = markdown.markdown(corps.strip(), extensions=["sane_lists"])
        meta["fin_iso"] = meta["fin"].isoformat() if meta.get("fin") else ""
        meta["couverture"] = couverture(meta["motif"]) if meta.get("motif") else ""
        actus.append(meta)
    return actus


def main():
    env = jinja2.Environment(loader=jinja2.FileSystemLoader(SRC / "gabarits"), autoescape=True,
                             trim_blocks=True, lstrip_blocks=True)
    env.globals.update(site=SITE, tally_id=TALLY_ID, icone=icone, annee=dt.date.today().year)
    actus = lire_actus()

    pages = {
        "index.html": ("accueil.html", dict(actus=actus[:3], eventail=eventail())),
        "actus/index.html": ("actus.html", dict(actus=actus)),
        "agenda/index.html": ("agenda.html", {}),
        "association/index.html": ("association.html", {}),
        "adherer/index.html": ("adherer.html", {}),
        "mentions-legales/index.html": ("mentions.html", {}),
        "404.html": ("404.html", {}),
    }
    for a in actus:
        pages[f"actus/{a['slug']}/index.html"] = ("article.html", dict(a=a))

    for chemin, (gabarit, ctx) in pages.items():
        sortie = RACINE / chemin
        sortie.parent.mkdir(parents=True, exist_ok=True)
        sortie.write_text(env.get_template(gabarit).render(chemin="/" + chemin.replace("index.html", ""), **ctx),
                          encoding="utf-8")
        print("écrit", chemin)

    # Plan du site pour les moteurs de recherche
    urls = ["/" + c.replace("index.html", "") for c in pages if c != "404.html"]
    (RACINE / "sitemap.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "".join(f"  <url><loc>{SITE}{u}</loc></url>\n" for u in urls) + "</urlset>\n", encoding="utf-8")


if __name__ == "__main__":
    main()
