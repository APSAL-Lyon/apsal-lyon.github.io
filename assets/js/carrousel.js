/* Carrousel des actus à la une : flèches, points, défilement automatique avec pause, balayage tactile */
(function () {
  "use strict";
  var piste = document.getElementById("carrousel");
  if (!piste) return;
  var diapos = Array.prototype.slice.call(piste.querySelectorAll(".car-diapo"));
  var points = Array.prototype.slice.call(document.querySelectorAll(".car-point"));
  var bPause = document.getElementById("car-pause");
  var reduit = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Retire les actus dont l'événement est passé (on en garde au moins une)
  var auj = new Date(); auj.setHours(0, 0, 0, 0);
  diapos.forEach(function (d, i) {
    var f = d.getAttribute("data-fin"); if (!f) return;
    var p = f.split("-");
    if (new Date(+p[0], +p[1] - 1, +p[2]) < auj && diapos.length > 1) { d.remove(); points[i].remove(); d.dataset.retire = "1"; }
  });
  points = points.filter(function (p, i) { return !diapos[i].dataset.retire; });
  diapos = diapos.filter(function (d) { return !d.dataset.retire; });
  diapos.forEach(function (d, i) { d.setAttribute("aria-label", (i + 1) + " sur " + diapos.length); });
  if (diapos.length < 2) { document.querySelector(".car-commandes").hidden = true; diapos[0].hidden = false; diapos[0].classList.add("active"); return; }

  var courant = 0, minuteur = null, enPause = reduit, survol = false;

  function afficher(n, sens) {
    var ancien = diapos[courant];
    courant = (n + diapos.length) % diapos.length;
    var nouveau = diapos[courant];
    if (ancien !== nouveau) { ancien.hidden = true; ancien.classList.remove("active"); }
    nouveau.hidden = false;
    nouveau.classList.remove("depuis-gauche", "depuis-droite");
    void nouveau.offsetWidth;
    nouveau.classList.add("active", sens < 0 ? "depuis-gauche" : "depuis-droite");
    points.forEach(function (p, i) { if (i === courant) p.setAttribute("aria-current", "true"); else p.removeAttribute("aria-current"); });
  }
  function relancer() {
    clearInterval(minuteur);
    if (!enPause && !survol) minuteur = setInterval(function () { afficher(courant + 1, 1); }, 7000);
  }
  function majPause() {
    bPause.setAttribute("aria-pressed", enPause ? "true" : "false");
    bPause.textContent = enPause ? "Lecture" : "Pause";
  }

  document.getElementById("car-prec").addEventListener("click", function () { afficher(courant - 1, -1); relancer(); });
  document.getElementById("car-suiv").addEventListener("click", function () { afficher(courant + 1, 1); relancer(); });
  points.forEach(function (p, i) { p.addEventListener("click", function () { afficher(i, i < courant ? -1 : 1); relancer(); }); });
  bPause.addEventListener("click", function () { enPause = !enPause; majPause(); relancer(); });

  var zone = piste.closest(".carrousel");
  zone.addEventListener("mouseenter", function () { survol = true; relancer(); });
  zone.addEventListener("mouseleave", function () { survol = false; relancer(); });
  zone.addEventListener("focusin", function () { survol = true; relancer(); });
  zone.addEventListener("focusout", function () { survol = false; relancer(); });
  zone.addEventListener("keydown", function (e) {
    if (e.key === "ArrowLeft") { afficher(courant - 1, -1); relancer(); }
    if (e.key === "ArrowRight") { afficher(courant + 1, 1); relancer(); }
  });

  // Balayage sur écran tactile
  var x0 = null;
  piste.addEventListener("pointerdown", function (e) { if (e.pointerType !== "mouse") x0 = e.clientX; });
  piste.addEventListener("pointerup", function (e) {
    if (x0 === null) return;
    var dx = e.clientX - x0; x0 = null;
    if (Math.abs(dx) > 50) { afficher(courant + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1); relancer(); }
  });

  majPause();
  relancer();
})();
