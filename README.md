# Site de l'APSAL

Site de l'Amicale des personnels des Services Académiques et Départementaux de Lyon, publié sur **https://apsal-lyon.github.io** (GitHub Pages, branche `main`, dossier racine).

## Organisation

| Élément | Où |
| - | - |
| Actus | `_src/actus/AAAA-MM-JJ-nom.md` (en-tête YAML + texte en Markdown) |
| Gabarits des pages | `_src/gabarits/` |
| Agenda | `agenda.ics`, lu directement par le site (`assets/js/agenda.js`) |
| Styles, polices, images | `assets/` |
| Formulaire d'adhésion | Tally, formulaire `PR9kjP`, intégré à `/adherer/` |

Après toute modification de `_src/`, régénérer les pages : `python3 _src/build.py` (dépendances : `jinja2`, `markdown`, `pyyaml`).

## Agenda et agenda académique (Calendar 7)

`agenda.ics` est la source de l'agenda du site. Les visiteurs peuvent s'y abonner (`webcal://apsal-lyon.github.io/agenda.ics`).

Pour gérer l'agenda depuis l'agenda académique (Thunderbird ou webmail Convergence) :
1. Dans le webmail (https://webmail.ac-lyon.fr), sur le compte APSAL, créez un agenda dédié, par exemple `site` (manuel DSI, § 8).
2. Importez-y le fichier `agenda.ics` actuel pour repartir des dates existantes.
3. Dans GitHub, *Settings > Secrets and variables > Actions* :
   - variable `CALDAV_URL` = `https://calendar7.ac-lyon.fr/dav/home/apsal@ac-lyon.fr/site/` ;
   - secrets `CALDAV_USER` et `CALDAV_PASSWORD` = identifiant et mot de passe du compte.
4. Lancez l'action « Synchroniser l'agenda » une première fois (onglet *Actions*), puis elle tourne toutes les heures.

Seuls les événements publics sont publiés : les événements privés ou confidentiels sont ignorés, et les participants, organisateurs et rappels sont retirés.
Catégories reconnues (champ « Catégorie ») : Sortie, Noël, Info (dates limites, ventes), Hebdo, sinon Rendez-vous. Un lien collé dans la description devient le lien de l'événement.
