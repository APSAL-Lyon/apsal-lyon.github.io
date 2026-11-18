/* Agenda APSAL : lit agenda.ics (synchronisable avec un agenda CalDAV)
   et affiche les rendez-vous sur l'accueil et sur la page Agenda. */
(function () {
  "use strict";

  var MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  var MOIS_COURT = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  var JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
  var JOURS_ICS = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

  /* ---------- Lecture du fichier .ics ---------- */
  function deplier(texte) { return texte.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, ""); }
  function desechapper(v) { return v.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1"); }

  function lireDate(valeur, params) {
    var m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(valeur.trim());
    if (!m) return null;
    var journee = !m[4] || /VALUE=DATE(?!-)/.test(params || "");
    var d;
    if (m[7]) { d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])); }
    else { d = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)); }
    return { date: d, journee: journee };
  }

  function lireICS(texte) {
    var lignes = deplier(texte).split("\n"), evts = [], ev = null, profondeur = 0;
    lignes.forEach(function (l) {
      if (l === "BEGIN:VEVENT") { ev = { exdates: [] }; return; }
      if (l === "END:VEVENT") {
        if (ev && ev.debut && ev.classe !== "PRIVATE" && ev.classe !== "CONFIDENTIAL") {
          if (!ev.url && ev.description) { var lien = /https?:\/\/[^\s<>"]+/.exec(ev.description); if (lien) ev.url = lien[0]; }
          ev.categorie = categorie(ev.categorie, ev.titre);
          evts.push(ev);
        }
        ev = null; return;
      }
      if (!ev) return;
      var i = l.indexOf(":"); if (i < 0) return;
      var gauche = l.slice(0, i), valeur = l.slice(i + 1);
      var nom = gauche.split(";")[0].toUpperCase(), params = gauche.slice(nom.length);
      switch (nom) {
        case "SUMMARY": ev.titre = desechapper(valeur); break;
        case "LOCATION": ev.lieu = desechapper(valeur); break;
        case "DESCRIPTION": ev.description = desechapper(valeur); break;
        case "URL": ev.url = valeur.trim(); break;
        case "CATEGORIES": ev.categorie = desechapper(valeur); break;
        case "CLASS": ev.classe = valeur.trim().toUpperCase(); break;
        case "UID": ev.uid = valeur.trim(); break;
        case "RRULE": ev.rrule = valeur.trim(); break;
        case "DTSTART": var d = lireDate(valeur, params); if (d) { ev.debut = d.date; ev.journee = d.journee; } break;
        case "DTEND": var f = lireDate(valeur, params); if (f) ev.fin = f.date; break;
        case "EXDATE": valeur.split(",").forEach(function (x) { var e = lireDate(x, params); if (e) ev.exdates.push(memeJourCle(e.date)); }); break;
      }
    });
    return evts;
  }

  /* Catégories : codes du site (rdv, sortie, noel, info, hebdo) ou libellés saisis dans Thunderbird / Convergence */
  function categorie(brute, titre) {
    var s = ((brute || "") + " " + (brute ? "" : titre || "")).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (/hebdo|chorale|danse|semaine/.test(s)) return "hebdo";
    if (/noel/.test(s)) return "noel";
    if (/sortie|balade|visite|musee|spectacle/.test(s)) return "sortie";
    if (/info|limite|commande|vente|tombola|inscription/.test(s)) return "info";
    return "rdv";
  }

  function memeJourCle(d) { return d.getFullYear() + "-" + d.getMonth() + "-" + d.getDate(); }
  function ajouterJours(d, n) { var x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; }

  /* Développe les événements répétés (hebdomadaires ou quotidiens) entre deux dates */
  function occurrences(evts, de, a) {
    var res = [];
    evts.forEach(function (ev) {
      var duree = ev.fin ? ev.fin - ev.debut : 0;
      if (!ev.rrule) {
        var finEff = ev.fin || ev.debut;
        if (finEff >= de && ev.debut <= a) res.push(copie(ev, ev.debut, duree, false));
        return;
      }
      var r = {}; ev.rrule.split(";").forEach(function (p) { var kv = p.split("="); r[kv[0]] = kv[1]; });
      var pas = r.FREQ === "DAILY" ? 1 : r.FREQ === "WEEKLY" ? 7 : 0;
      if (!pas) { res.push(copie(ev, ev.debut, duree, false)); return; }
      pas *= +(r.INTERVAL || 1);
      var jusqua = r.UNTIL ? lireDate(r.UNTIL).date : null, max = r.COUNT ? +r.COUNT : 500;
      var jours = r.BYDAY && r.FREQ === "WEEKLY" ? r.BYDAY.split(",").map(function (j) { return JOURS_ICS[j.slice(-2)]; }) : [ev.debut.getDay()];
      var semaine = ajouterJours(ev.debut, -((ev.debut.getDay() + 6) % 7)), n = 0;
      for (var k = 0; k < 600 && n < max; k++) {
        for (var j = 0; j < 7; j++) {
          var jour = ajouterJours(semaine, j);
          if (jours.indexOf(jour.getDay()) < 0) continue;
          var occ = new Date(jour.getFullYear(), jour.getMonth(), jour.getDate(), ev.debut.getHours(), ev.debut.getMinutes());
          if (occ < ev.debut) continue;
          if (jusqua && occ > jusqua) { k = 600; break; }
          n++;
          if (ev.exdates.indexOf(memeJourCle(occ)) >= 0) continue;
          if (occ >= de && occ <= a) res.push(copie(ev, occ, duree, true));
        }
        semaine = ajouterJours(semaine, pas);
        if (semaine > a) break;
      }
    });
    return res.sort(function (x, y) { return x.debut - y.debut; });
  }
  function copie(ev, debut, duree, repete) {
    return { titre: ev.titre, lieu: ev.lieu, description: ev.description, url: ev.url, categorie: ev.categorie || "rdv",
      journee: ev.journee, debut: debut, fin: duree ? new Date(debut.getTime() + duree) : null, repete: repete };
  }

  /* ---------- Mise en forme ---------- */
  function heure(d) { return d.getHours() + " h" + (d.getMinutes() ? " " + String(d.getMinutes()).padStart(2, "0") : ""); }
  function horaire(o) {
    if (o.journee) {
      var finJ = o.fin ? ajouterJours(o.fin, -1) : o.debut;
      if (memeJourCle(finJ) !== memeJourCle(o.debut)) return "Jusqu'au " + JOURS[finJ.getDay()] + " " + finJ.getDate() + " " + MOIS[finJ.getMonth()];
      return "Toute la journée";
    }
    if (!o.fin) return "À partir de " + heure(o.debut);
    return heure(o.debut) + " – " + heure(o.fin);
  }
  function lienInterne(url) {
    if (!url) return null;
    try { var u = new URL(url, location.href); return u.host === location.host || /apsal-lyon\.github\.io$/.test(u.host) ? u.pathname : u.href; }
    catch (e) { return url; }
  }
  function el(tag, attrs, enfants) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { if (attrs[k] != null) n.setAttribute(k, attrs[k]); });
    (enfants || []).forEach(function (c) { if (c != null) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return n;
  }

  function itemRdv(o) {
    var url = lienInterne(o.url);
    var titre = url ? el("a", { href: url }, [o.titre]) : o.titre;
    var details = horaire(o) + (o.lieu ? ", " + o.lieu : "");
    return el("li", {}, [
      el("div", { class: "jour", "aria-hidden": "true" }, [el("small", {}, [JOURS[o.debut.getDay()].slice(0, 3) + "."]), el("b", {}, [String(o.debut.getDate())]), el("small", {}, [MOIS_COURT[o.debut.getMonth()]])]),
      el("div", {}, [
        el("h3", {}, [el("span", { class: "sr-only" }, [JOURS[o.debut.getDay()] + " " + o.debut.getDate() + " " + MOIS[o.debut.getMonth()] + " : "]), titre]),
        el("p", {}, [details])
      ])
    ]);
  }

  /* ---------- Accueil ---------- */
  function accueil(evts) {
    var maintenant = new Date(), debutJour = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate());
    var a = ajouterJours(debutJour, 400);
    var occs = occurrences(evts, debutJour, a).filter(function (o) {
      if (o.repete) return false;
      if (o.journee) return o.fin ? o.fin > maintenant : o.debut >= debutJour;
      return (o.fin || o.debut) >= maintenant;
    });

    var liste = document.getElementById("prochains");
    if (liste) {
      liste.textContent = "";
      var cinq = occs.slice(0, 5);
      if (!cinq.length) liste.appendChild(el("li", {}, [el("span", { class: "vide" }, ["Pas de rendez-vous annoncé pour le moment. Les prochaines activités arrivent bientôt."])]));
      cinq.forEach(function (o) { liste.appendChild(itemRdv(o)); });
    }
    var perle = document.getElementById("perle");
    if (perle && occs.length) {
      var p = occs.filter(function (o) { return !o.journee || o.categorie !== "info"; })[0] || occs[0];
      perle.setAttribute("href", lienInterne(p.url) || "/agenda/");
      perle.querySelector(".p-date").textContent = p.debut.getDate();
      perle.querySelector(".p-jour").textContent = JOURS[p.debut.getDay()];
      perle.querySelector(".p-mois:not(.p-jour)").textContent = MOIS[p.debut.getMonth()];
      perle.querySelector(".p-quoi").textContent = p.titre;
    }
  }

  /* ---------- Page Agenda ---------- */
  function calendrier(evts) {
    var zone = document.getElementById("calendrier"); if (!zone) return;
    var auj = new Date(), courant = new Date(auj.getFullYear(), auj.getMonth(), 1);
    var titre = document.getElementById("mois-courant"), grille = document.getElementById("grille"), liste = document.getElementById("liste-mois");

    function dessiner() {
      var y = courant.getFullYear(), m = courant.getMonth();
      titre.textContent = MOIS[m].charAt(0).toUpperCase() + MOIS[m].slice(1) + " " + y;
      var premier = ajouterJours(courant, -((courant.getDay() + 6) % 7));
      var dernier = ajouterJours(new Date(y, m + 1, 0), 6 - ((new Date(y, m + 1, 0).getDay() + 6) % 7));
      var occs = occurrences(evts, premier, new Date(dernier.getFullYear(), dernier.getMonth(), dernier.getDate(), 23, 59));
      grille.textContent = "";
      ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."].forEach(function (j) { grille.appendChild(el("div", { class: "jsem", "aria-hidden": "true" }, [j])); });
      for (var d = premier; d <= dernier; d = ajouterJours(d, 1)) {
        var cle = memeJourCle(d), classes = "case" + (d.getMonth() !== m ? " hors" : "") + (cle === memeJourCle(auj) ? " aujourdhui" : "");
        var c = el("div", { class: classes }, [el("span", { class: "num" }, [String(d.getDate())])]);
        occs.forEach(function (o) {
          var finJ = o.journee && o.fin ? ajouterJours(o.fin, -1) : o.debut;
          var dansJour = d >= new Date(o.debut.getFullYear(), o.debut.getMonth(), o.debut.getDate()) && d <= new Date(finJ.getFullYear(), finJ.getMonth(), finJ.getDate());
          if (!dansJour) return;
          var plusieursJours = memeJourCle(finJ) !== memeJourCle(o.debut);
          if (plusieursJours && memeJourCle(d) !== memeJourCle(o.debut) && d.getDay() !== 1) return;
          var url = lienInterne(o.url);
          c.appendChild(el(url ? "a" : "span", { class: "ev cat-" + o.categorie, href: url, title: o.titre }, [(o.journee ? "" : heure(o.debut) + " ") + o.titre]));
        });
        grille.appendChild(c);
      }
      var duMois = occs.filter(function (o) {
        if (o.repete) return false;
        var fin = o.fin || o.debut;
        return o.debut < new Date(y, m + 1, 1) && fin >= courant;
      });
      liste.textContent = "";
      if (!duMois.length) liste.appendChild(el("li", {}, [el("span", { class: "vide" }, ["Aucun rendez-vous ce mois-ci."])]));
      duMois.forEach(function (o) { liste.appendChild(itemRdv(o)); });
    }
    document.getElementById("mois-prec").addEventListener("click", function () { courant = new Date(courant.getFullYear(), courant.getMonth() - 1, 1); dessiner(); });
    document.getElementById("mois-suiv").addEventListener("click", function () { courant = new Date(courant.getFullYear(), courant.getMonth() + 1, 1); dessiner(); });
    document.getElementById("mois-auj").addEventListener("click", function () { courant = new Date(auj.getFullYear(), auj.getMonth(), 1); dessiner(); });
    dessiner();
  }

  fetch("/agenda.ics", { cache: "no-cache" })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
    .then(function (t) { var evts = lireICS(t); accueil(evts); calendrier(evts); })
    .catch(function () {
      var cible = document.getElementById("prochains") || document.getElementById("liste-mois");
      if (cible) cible.innerHTML = '<li><span class="vide">L\'agenda n\'a pas pu être chargé. Réessayez dans un instant ou consultez le fichier <a href="/agenda.ics">agenda.ics</a>.</span></li>';
    });
})();
