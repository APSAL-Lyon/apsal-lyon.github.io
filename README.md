# Site de l'APSAL

Site de l'Amicale des Personnels des Services Académiques de Lyon, publié sur **https://apsal-lyon.github.io** (GitHub Pages, branche `main`, dossier racine).

## Organisation

| Élément | Où |
| - | - |
| Actus | `_src/actus/AAAA-MM-JJ-nom.md` (en-tête YAML + texte en Markdown) |
| Gabarits des pages | `_src/gabarits/` |
| Agenda | `agenda.ics`, lu directement par le site (`assets/js/agenda.js`) |
| Styles, polices, images | `assets/` |
| Formulaire d'adhésion | Tally, formulaire `PR9kjP`, intégré à `/adherer/` |

Après toute modification de `_src/`, régénérer les pages : `python3 _src/build.py` (dépendances : `jinja2`, `markdown`, `pyyaml`).

## Agenda et CalDAV

`agenda.ics` est la source de l'agenda. Les visiteurs peuvent s'y abonner (`webcal://apsal-lyon.github.io/agenda.ics`).

Pour gérer l'agenda depuis un agenda CalDAV partagé :
1. importez `agenda.ics` dans l'agenda CalDAV (pour repartir des dates existantes) ;
2. copiez son lien d'export public au format .ics ;
3. dans GitHub : *Settings > Secrets and variables > Actions > Variables*, créez `AGENDA_ICS_URL` avec ce lien.

L'action « Synchroniser l'agenda » récupère alors l'agenda toutes les heures et met le site à jour. Catégories reconnues (`CATEGORIES`) : `rdv`, `sortie`, `noel`, `info`, `hebdo`.
