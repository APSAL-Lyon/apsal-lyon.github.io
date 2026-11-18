#!/usr/bin/env python3
"""Récupère l'agenda de l'APSAL sur le serveur CalDAV de l'académie (Calendar 7)
et l'écrit dans agenda.ics, que le site lit directement.

Variables d'environnement (fournies par l'action GitHub « Synchroniser l'agenda ») :
  CALDAV_URL       ex. https://calendar7.ac-lyon.fr/dav/home/apsal@ac-lyon.fr/calendar/
  CALDAV_USER      identifiant de connexion du compte
  CALDAV_PASSWORD  mot de passe du compte

Sécurité et vie privée : les événements privés ou confidentiels sont ignorés, et les
participants, organisateurs et alarmes sont retirés avant publication.
"""
import base64, datetime as dt, os, pathlib, re, sys, urllib.error, urllib.parse, urllib.request
import xml.etree.ElementTree as ET

RACINE = pathlib.Path(__file__).resolve().parent.parent
NS = {"d": "DAV:", "c": "urn:ietf:params:xml:ns:caldav"}
RETIRER = re.compile(r"^(ATTENDEE|ORGANIZER|X-MOZ-|X-LIC-|X-MICROSOFT-|X-S1CS-|X-NSCP-|X-ORACLE-)", re.I)


def requete(methode, url, corps=None, profondeur="1"):
    entetes = {"Authorization": "Basic " + base64.b64encode(
        f"{os.environ['CALDAV_USER']}:{os.environ['CALDAV_PASSWORD']}".encode()).decode(),
        "Depth": profondeur, "User-Agent": "APSAL-Lyon-site/1.0"}
    if corps:
        entetes["Content-Type"] = "application/xml; charset=utf-8"
    req = urllib.request.Request(url, data=corps.encode() if corps else None, headers=entetes, method=methode)
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.status, r.read().decode("utf-8", "replace")


def par_report(url):
    debut = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=400)).strftime("%Y%m%dT000000Z")
    fin = (dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=800)).strftime("%Y%m%dT000000Z")
    corps = f"""<?xml version="1.0" encoding="utf-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop><c:calendar-data/></d:prop>
  <c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT">
    <c:time-range start="{debut}" end="{fin}"/>
  </c:comp-filter></c:comp-filter></c:filter>
</c:calendar-query>"""
    _, xml = requete("REPORT", url, corps)
    return [e.text for e in ET.fromstring(xml).iterfind(".//c:calendar-data", NS) if e.text]


def par_propfind(url):
    corps = '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:getetag/></d:prop></d:propfind>'
    _, xml = requete("PROPFIND", url, corps)
    textes = []
    for href in ET.fromstring(xml).iterfind(".//d:href", NS):
        if href.text and href.text.endswith(".ics"):
            _, t = requete("GET", urllib.parse.urljoin(url, href.text), profondeur="0")
            textes.append(t)
    return textes


def agendas_du_compte(url):
    """Liste les agendas du compte (nom affiché -> adresse), à partir du dossier parent de CALDAV_URL."""
    parent = url.rstrip("/").rsplit("/", 1)[0] + "/"
    corps = ('<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">'
             '<d:prop><d:displayname/><d:resourcetype/></d:prop></d:propfind>')
    _, xml = requete("PROPFIND", parent, corps)
    trouves = []
    for rep in ET.fromstring(xml).iterfind("d:response", NS):
        href = rep.findtext("d:href", default="", namespaces=NS)
        if rep.find(".//d:resourcetype/c:calendar", NS) is None:
            continue
        nom = rep.findtext(".//d:displayname", default="", namespaces=NS) or href.rstrip("/").rsplit("/", 1)[-1]
        trouves.append((nom, urllib.parse.urljoin(parent, href)))
    return trouves


def lire(url):
    try:
        return par_report(url)
    except urllib.error.HTTPError as e:
        if e.code != 404:
            print(f"REPORT refusé ({e.code}), essai par PROPFIND")
            return par_propfind(url)
        raise


def blocs(texte, nom):
    texte = re.sub(r"\r?\n[ \t]", "", texte)  # déplie les lignes
    return re.findall(rf"BEGIN:{nom}\r?\n.*?END:{nom}", texte, flags=re.S)


def nettoyer(evenement):
    if re.search(r"^CLASS:(PRIVATE|CONFIDENTIAL)", evenement, flags=re.M):
        return None
    evenement = re.sub(r"BEGIN:VALARM.*?END:VALARM\r?\n?", "", evenement, flags=re.S)
    lignes = [l for l in re.split(r"\r?\n", evenement) if l and not RETIRER.match(l)]
    return lignes


def plier(ligne):
    b = ligne.encode(); res = []
    while len(b) > 73:
        c = 73
        while (b[c] & 0xC0) == 0x80:
            c -= 1
        res.append(b[:c].decode()); b = b" " + b[c:]
    res.append(b.decode())
    return "\r\n".join(res)


def main():
    url = os.environ["CALDAV_URL"]
    if not url.endswith("/"):
        url += "/"
    try:
        textes = lire(url)
    except urllib.error.HTTPError as e:
        if e.code != 404:
            raise
        # L'adresse ne correspond à aucun agenda : on cherche par nom parmi les agendas du compte.
        cible = urllib.parse.unquote(url.rstrip("/").rsplit("/", 1)[-1]).lower()
        agendas = agendas_du_compte(url)
        print("Agenda introuvable à cette adresse. Agendas du compte :", ", ".join(f"« {n} »" for n, _ in agendas) or "aucun")
        choix = [u for n, u in agendas if n.strip().lower() == cible]
        if not choix:
            print(f"Aucun agenda nommé « {cible} ». Corrigez la variable CALDAV_URL avec l'un des noms ci-dessus.")
            sys.exit(1)
        print("Agenda trouvé par son nom :", choix[0])
        textes = lire(choix[0])

    fuseaux, evenements, vus = {}, [], set()
    for t in textes:
        for tz in blocs(t, "VTIMEZONE"):
            m = re.search(r"^TZID:(.+)$", tz, flags=re.M)
            if m:
                fuseaux.setdefault(m.group(1).strip(), tz)
        for ev in blocs(t, "VEVENT"):
            lignes = nettoyer(ev)
            if not lignes:
                continue
            cle = next((l for l in lignes if l.startswith("UID")), "") + next((l for l in lignes if l.startswith("RECURRENCE-ID")), "")
            if cle in vus:
                continue
            vus.add(cle); evenements.append(lignes)

    if not evenements:
        print("Aucun événement public trouvé : agenda.ics n'est pas modifié.")
        sys.exit(0)

    sortie = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//APSAL Lyon//Agenda//FR", "CALSCALE:GREGORIAN",
              "METHOD:PUBLISH", "X-WR-CALNAME:Agenda APSAL", "X-WR-TIMEZONE:Europe/Paris"]
    for tz in fuseaux.values():
        sortie += re.split(r"\r?\n", tz)
    for lignes in evenements:
        sortie += lignes
    sortie.append("END:VCALENDAR")
    (RACINE / "agenda.ics").write_text("\r\n".join(plier(l) for l in sortie if l) + "\r\n", encoding="utf-8", newline="")
    print(f"{len(evenements)} événement(s) publiés dans agenda.ics")


if __name__ == "__main__":
    main()
