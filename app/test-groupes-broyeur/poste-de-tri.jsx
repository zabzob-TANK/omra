'use client'
import { memo, startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { deplacerMembres } from '@/modules/client-react/groupes-integrite'
import { nomGroupeUnique, prochainNomVisa } from '@/modules/client-react/groupes-locaux'
import { chargerPhotos } from './photos'
import Tableau from './Tableau'
// Fiche de réglages de la rubrique affichée (aujourd'hui le Visa) : données, catégories, règles.
import { chargerVisa, categorieMachine, motifVerrouMachine, machineFixe, etatFiche, iconeCategorie, CATEGORIES, COLONNES, NUSUK_CHANNEL, nouveauBrouillon, listeGroupesVisa } from './rubrique-visa'
// Panneau des groupes (fenêtre fixe), mis au point sur /test-groupes-broyeur/barre ; affichage seulement.
import { PanneauGroupes } from './panneau-groupes/panneau'
import CardNav from './card-nav/CardNav'
// Mise en page (version test) : placer les grandes zones de la page à la souris.
import { EditeurDisposition, ecrireDisposition, lireDisposition, releverDisposition, variablesDisposition } from './mise-en-page'
import './poste-de-tri.css'

// Poste de tri : glisser une fiche (ou une sélection) d'une machine à l'autre. Les fiches de la
// machine visée s'écartent pour montrer la place ; à l'arrivée dans un autre groupe, chaque fiche
// part en lanières qui se recomposent à sa nouvelle place. Groupes fictifs, en mémoire seulement.
const LIBRE = 0
const SEUIL = 5
// Un glisser qui finit à moins de SEUIL_CLIC px de son départ est un clic : la main a juste bougé.
const SEUIL_CLIC = 16
const BORD = 40
const CASCADE = 90
const PILE = 4
const MAINTIEN = 700
const TEINTES = ['#9aa0aa', '#f2a541', '#3fb8af', '#ef6f6c', '#9b8cf2', '#9bc53d', '#4ea5f0']
// Les trois vues des groupes du fichier clients.
const VUES = [
  { id: 'liste', nom: 'Liste', icone: 'M3 4h10M3 8h10M3 12h10' },
  { id: 'photos', nom: 'Photos', icone: 'M2.5 2.5h4v4h-4zM9.5 2.5h4v4h-4zM2.5 9.5h4v4h-4zM9.5 9.5h4v4h-4z' },
  { id: 'details', nom: 'Détails', icone: 'M2.5 3.5h3v3h-3zM7.5 4h6M7.5 6h4M2.5 9.5h3v3h-3zM7.5 10h6M7.5 12h4' },
]
const teinte = num => TEINTES[num % TEINTES.length]
const cle = id => String(id)
// Réglage « réduire les animations », lu une seule fois puis suivi : l'interroger à chaque image coûtait cher.
let reglageCalme = null
// Bouton « Rebond » de la barre d'outils (essai du 2026-10-15) : sans rebond, les fiches voisines glissent toujours
// pour laisser la place, mais s'arrêtent net à leur place au lieu de la dépasser puis revenir comme un ressort.
// Toutes les autres animations restent.
let sansRebond = false
const calme = () => {
  if (typeof window === 'undefined') return false
  reglageCalme ??= window.matchMedia('(prefers-reduced-motion: reduce)')
  return reglageCalme.matches
}
// Écartement en cours de chaque fiche, pour le couper sans interroger le navigateur.
// (ECARTEMENT_SANS_REBOND est défini plus bas, à côté d'ECARTEMENT.)
const ecartements = new WeakMap()
const nouvelleMachine = (num, nomPerso, visaBrouillon) => ({ num, nomPerso, ids: [], origines: {}, ...(visaBrouillon ? { visaBrouillon } : {}) })
// Ordre de départ des groupes du banc seul : sans groupe Nusuk, groupes Nusuk, visas, temporaires. Ensuite, c'est
// l'ordre qu'on règle en déplaçant les groupes.
const RANG_CATEGORIE = { 'sans-groupe': 0, groupe: 1, 'attente-visa': 2, 'visa-emis': 3, temporaire: 4 }

// Taille d'une fiche de groupe en vue Liste : la plus large des fiches affichées (une liste qui défile a des fiches
// plus étroites, de la largeur de sa barre de défilement), sinon la largeur utile d'une liste et la hauteur de fiche
// de cette vue.
function tailleFicheListe(racine) {
  let fiche = null, largeur = 0
  for (const f of racine?.querySelectorAll('.pdt-liste.pdt-vue-liste [data-fiche]') || []) { const w = f.getBoundingClientRect().width; if (w > largeur) { largeur = w; fiche = f } }
  if (fiche) { const b = fiche.getBoundingClientRect(); return { width: b.width, height: b.height } }
  const liste = racine?.querySelector('.pdt-liste.pdt-vue-liste')
  if (!liste) return { width: 226, height: 44 }
  const s = getComputedStyle(liste)
  return { width: liste.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight), height: parseFloat(s.getPropertyValue('--fiche')) || 44 }
}

// Mouvement repris du moteur Shredder (React Bits), comme dans l'atelier de Codex :
// la fiche suit la souris par un ressort, penche selon sa vitesse, se soulève, puis se pose
// avec son élan ; les voisines s'écartent avec le ressort de la pile.
// SUIVI : souplesse du ressort qui tire la fiche tenue vers la souris (« lazy mouse » comme dans Photoshop :
// la fiche suit sans coller au curseur, et traîne un peu plus quand on accélère). 30 au départ, 15 depuis
// le 2026-10-14.
const SUIVI = 15, POSE = 16, PENCHE_MAX = 6, SOULEVE = 1.02, HYSTERESE = 8
// Pendant un glisser, la place ne s'ouvre dans un autre groupe que si le curseur s'y arrête un instant :
// en passant vite au-dessus de plusieurs groupes, rien ne s'ouvre et se referme en rafale.
const DELAI_GROUPE = 120
const borner = (v, min, max) => Math.min(max, Math.max(min, v))
const ressort = (p, v, cible, dt, omega) => {
  const ecart = p - cible, terme = v + omega * ecart, decroit = Math.exp(-omega * dt)
  return [cible + (ecart + terme * dt) * decroit, (v - omega * terme * dt) * decroit]
}
const amortir = (de, vers, dt, tau) => de + (vers - de) * (1 - Math.exp(-dt / tau))
// Vol libre au lâcher : simulé d'avance image par image (ressort raideur k, amortissement c) à partir de la
// position ET de la vitesse de la fiche, puis joué en images clés par la carte graphique. Il continue même
// quand le programme est occupé, et il garde l'élan du geste : pas d'arrêt net au lâcher, et une
// correction de destination en plein vol repart de la vitesse du moment (mesuré le 2026-10-14 : l'ancien
// vol tombait de 20 px par image à 0, puis sautait de 32 px à sa redirection).
const PAS_VOL = 1 / 60
const vols = new WeakMap()
// « attente » (secondes) : avant de filer vers sa place, la fiche glisse sur son élan en ralentissant. C'est
// la cascade d'un bloc (chaque fiche part un peu après la précédente), sans jamais rester immobile.
function simulerVol(de, vers, attente = 0, k = 170, c = 26) {
  let { x, y, vx, vy, r, s } = de
  const etats = []
  for (let i = 0; i < 180; i++) {
    etats.push({ x, y, vx, vy, r, s })
    const enAttente = i * PAS_VOL < attente
    // Fin du vol dès que la fiche est à moins d'un demi-pixel de sa place : la queue du ressort la faisait encore
    // ramper d'un pixel pendant 120 ms avant de se caler (mesuré le 2026-10-16, « ça bouge vers la fin »).
    if (!enAttente && Math.hypot(x - vers.x, y - vers.y) < 0.5 && Math.hypot(vx, vy) < 20 && Math.abs(r) < 0.05 && Math.abs(s - 1) < 0.0005) break
    for (let j = 0; j < 4; j++) {
      const h = PAS_VOL / 4
      if (enAttente) { vx *= Math.exp(-h / 0.12); vy *= Math.exp(-h / 0.12) }
      else { vx += (-k * (x - vers.x) - c * vx) * h; vy += (-k * (y - vers.y) - c * vy) * h }
      x += vx * h; y += vy * h
    }
    r *= Math.exp(-PAS_VOL / 0.06); s = 1 + (s - 1) * Math.exp(-PAS_VOL / 0.08)
  }
  etats.push({ x: vers.x, y: vers.y, vx: 0, vy: 0, r: 0, s: 1 })
  return etats
}
function voler(el, de, vers, attente = 0) {
  const etats = simulerVol(de, vers, attente)
  // La fiche est d'abord posée là où elle est : une animation met une ou deux images à démarrer, et sans
  // cela la fiche revenait pendant ce temps à une ancienne position (aller-retour visible).
  el.style.transform = `translate(${de.x}px, ${de.y}px) rotate(${de.r}deg) scale(${de.s})`
  el.getAnimations().forEach(a => a.cancel())
  const a = el.animate(etats.map(e => ({ transform: `translate(${e.x}px, ${e.y}px) rotate(${e.r}deg) scale(${e.s})` })),
    { duration: (etats.length - 1) * PAS_VOL * 1000, easing: 'linear', fill: 'forwards' })
  vols.set(el, { a, etats, vers, attente })
  return a
}
// Changer la destination d'un vol en cours sans l'arrêter : la suite du trajet est recalculée à partir de
// l'image présente, et c'est la même animation qui continue. Une nouvelle animation attendrait que le
// programme ait fini son travail pour démarrer (mesuré : 3 images figées en plein vol).
function redirigerVol(el, vers) {
  const v = vols.get(el)
  const i = Math.min(v.etats.length - 1, Math.floor((Number(v.a.currentTime) || 0) / 1000 / PAS_VOL) + 1)
  // La cascade continue : une fiche encore en attente garde le reste de son attente.
  const attente = Math.max(0, v.attente - i * PAS_VOL)
  const etats = [...v.etats.slice(0, i), ...simulerVol(v.etats[i], vers, attente)]
  v.a.effect.setKeyframes(etats.map(e => ({ transform: `translate(${e.x}px, ${e.y}px) rotate(${e.r}deg) scale(${e.s})` })))
  v.a.effect.updateTiming({ duration: (etats.length - 1) * PAS_VOL * 1000 })
  vols.set(el, { a: v.a, etats, vers, attente: v.attente })
}
// Où en est un vol à l'instant présent : position, vitesse, penchée, taille.
function etatVol(el) {
  const v = vols.get(el)
  const t = Math.min(v.etats.length - 1, Math.max(0, (Number(v.a.currentTime) || 0) / 1000 / PAS_VOL))
  const i = Math.floor(t), f = t - i, a = v.etats[i], b = v.etats[Math.min(v.etats.length - 1, i + 1)]
  const m = cle => a[cle] + (b[cle] - a[cle]) * f
  return { x: m('x'), y: m('y'), vx: m('vx'), vy: m('vy'), r: m('r'), s: m('s') }
}
// Ressort de la pile (raideur 320, amortissement 22), échantillonné une fois en courbe d'animation.
// Le petit rebond est gardé (la fiche dépasse un peu sa place), mais au sommet du rebond elle revient d'un seul
// geste en 100 ms : avant (2026-10-15), elle se reposait pixel par pixel pendant encore 0,25 s, et cette fin
// lente ressemblait à un second mouvement (« elle recommence l'animation »).
const ECARTEMENT = (() => {
  const pas = 1 / 60, points = [0]
  let y = 0, v = 0, t = 0
  while (t < 1.2) {
    for (let i = 0; i < 4; i++) { v += (-320 * (y - 1) - 22 * v) * (pas / 4); y += v * (pas / 4) }
    t += pas
    points.push(+y.toFixed(4))
    if (y > 1 && v <= 0) {
      const sommet = y
      for (let k = 1; k <= 6; k++) points.push(+(sommet + (1 - sommet) * (1 - (1 - k / 6) ** 2)).toFixed(4))
      t += 6 * pas
      break
    }
    if (Math.abs(y - 1) < 0.002 && Math.abs(v) < 0.05) break
  }
  points[points.length - 1] = 1
  return { duree: Math.round(t * 1000), courbe: `linear(${points.join(', ')})` }
})()
// Même glissement, sans dépasser la place : ressort amorti juste ce qu'il faut (amortissement critique).
const ECARTEMENT_SANS_REBOND = (() => {
  const pas = 1 / 60, points = [0], c = 2 * Math.sqrt(320)
  let y = 0, v = 0, t = 0
  while (t < 1.2) {
    for (let i = 0; i < 4; i++) { v += (-320 * (y - 1) - c * v) * (pas / 4); y += v * (pas / 4) }
    t += pas
    points.push(+Math.min(y, 1).toFixed(4))
    if (1 - y < 0.004) break
  }
  points[points.length - 1] = 1
  return { duree: Math.round(t * 1000), courbe: `linear(${points.join(', ')})` }
})()

// La vraie fiche reprend la place de sa copie en vol, sans fondu (voir .pdt-sans-fondu).
function revelerFiche(el) {
  el.classList.add('pdt-sans-fondu')
  el.style.visibility = ''
  delete el.dataset.attend
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('pdt-sans-fondu')))
}

// Salut d'arrivée (demande du commanditaire, 2026-10-16) : la fiche déposée dans un autre groupe s'illumine
// doucement de la couleur de ce groupe, puis s'éteint, en un peu moins d'une seconde. Même famille que l'allumage
// de l'en-tête du groupe ; jamais le trait qui fait le tour (le « petit ruban »). Sans agrandissement : il faisait
// bouger la fiche d'un pixel juste après sa pose (retiré le 2026-10-16). Un fondu, joué par la carte graphique.
function saluerFiche(el) {
  if (calme() || !el?.isConnected) return
  el.querySelector('.pdt-salut')?.remove()
  const lueur = document.createElement('span')
  lueur.className = 'pdt-salut'
  lueur.setAttribute('aria-hidden', 'true')
  el.appendChild(lueur)
  lueur.animate([{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 0 }], { duration: 900, easing: 'ease-out' }).onfinish = () => lueur.remove()
}

// La fiche lâchée garde son élan et file jusqu'à sa vraie place, puis se redresse.
// Le vol se fait avec une copie posée dans un calque au-dessus de la page : la liste d'arrivée
// coupe tout ce qui dépasse de son cadre (c'est ce qui permet le défilement), et la vraie fiche
// en vol semblait alors sortir de sous l'en-tête du groupe. Pendant ce temps, la vraie fiche
// attend à sa place, invisible, puis réapparaît exactement sous la copie.
function poser(racine, el, depart, elan, { delai = 0, vue = 'liste', couleur, ancienRang } = {}) {
  if (calme()) return
  const base = el.getBoundingClientRect()
  const couche = document.createElement('div')
  couche.className = `pdt-couche pdt-vue-${vue}`
  if (couleur) couche.style.setProperty('--t', couleur)
  const copie = el.cloneNode(true)
  ;['data-fiche', 'aria-selected', 'style'].forEach(n => copie.removeAttribute(n))
  copie.querySelector('.pdt-eclat')?.remove()
  copie.classList.add('pdt-en-vol')
  Object.assign(copie.style, { position: 'fixed', margin: '0', left: `${base.left}px`, top: `${base.top}px`, width: `${base.width}px`, height: `${base.height}px` })
  couche.appendChild(copie)
  racine.appendChild(couche)
  el.dataset.attend = ''
  el.style.visibility = 'hidden'
  // Le numéro passe de l'ancien au nouveau sur la copie, pendant le vol.
  fondreNumero(copie, ancienRang, delai)
  let x = depart.x, y = depart.y, vx = elan.vx || 0, vy = elan.vy || 0, penche = elan.penche || 0, souleve = elan.souleve || 1
  let dernier = 0, debut = 0
  const appliquer = () => { copie.style.transform = `translate(${x - base.left}px, ${y - base.top}px) rotate(${penche}deg) scale(${souleve})` }
  appliquer()
  const finir = () => { revelerFiche(el); couche.remove() }
  const etape = maintenant => {
    if (!el.isConnected) return finir()
    if (!debut) { debut = dernier = maintenant }
    const dt = borner((maintenant - dernier) / 1000, 0.001, 0.05)
    dernier = maintenant
    ;[x, vx] = ressort(x, vx, base.left, dt, POSE)
    ;[y, vy] = ressort(y, vy, base.top, dt, POSE)
    penche = amortir(penche, 0, dt, 0.09)
    souleve = amortir(souleve, 1, dt, 0.12)
    appliquer()
    const pose = Math.abs(x - base.left) < 0.3 && Math.abs(y - base.top) < 0.3 && Math.abs(vx) < 3 && Math.abs(vy) < 3
    if (pose || maintenant - debut > 1200) return finir()
    requestAnimationFrame(etape)
  }
  setTimeout(() => requestAnimationFrame(etape), delai)
}

// Suivi du défilement pendant un atterrissage : les copies en vol visent la position de leur fiche à l'écran,
// relevée au départ ; si la page ou une liste défile pendant le vol (molette), cette position change. Sans suivi, la
// copie se posait à côté (de toute la distance défilée, 270 px mesurés le 2026-10-15), puis la vraie fiche
// apparaissait à sa place : un saut. Le suivi n'écoute le défilement que pendant les atterrissages (moins d'une
// seconde) et ne recalcule qu'une fois par image.
// Les copies en vol sont accrochées à la zone des groupes (.pdt-atelier), qui a sa propre barre de défilement :
// leurs positions sont comptées depuis le coin du contenu de cette zone, défilement compris, pour qu'elles défilent
// avec elle (enregistrement du commanditaire du 2026-10-15 : accrochée à la page entière, la copie restait sur place
// quand seule la zone des groupes défilait). « versPage » convertit une position mesurée à l'écran.
const coinPage = conteneur => { const b = conteneur.getBoundingClientRect(); return { x: b.left + conteneur.clientLeft - conteneur.scrollLeft, y: b.top + conteneur.clientTop - conteneur.scrollTop } }
const zoneDeVol = racine => racine.querySelector('.pdt-atelier') || racine
const versPage = (conteneur, x, y) => { const o = coinPage(conteneur); return { x: x - o.x, y: y - o.y } }
const atterrissages = new Map() // copie en vol → sa vraie fiche
const grandesPlaces = new Map() // grande place d'un bloc → fonction qui la replace
let suiviPrevu = 0
function suivreDefilement() {
  if (suiviPrevu) return
  suiviPrevu = requestAnimationFrame(() => {
    suiviPrevu = 0
    for (const [copie, el] of atterrissages) {
      if (!copie.isConnected || !el.isConnected || !vols.has(copie)) { atterrissages.delete(copie); continue }
      const b = el.getBoundingClientRect(), v = vols.get(copie), cible = versPage(copie.offsetParent, b.left, b.top)
      if (Math.hypot(v.vers.x - cible.x, v.vers.y - cible.y) <= 1) continue
      // La place a bougé sous la copie (une liste a défilé) : plutôt que de courir après, la copie se pose tout de
      // suite et la vraie fiche apparaît à sa place.
      v.a.finish()
    }
    for (const [place, replacer] of grandesPlaces) { if (place.isConnected) replacer(); else grandesPlaces.delete(place) }
    if (!atterrissages.size && !grandesPlaces.size) removeEventListener('scroll', suivreDefilement, true)
  })
}
const ecouterDefilement = () => addEventListener('scroll', suivreDefilement, { capture: true, passive: true })

// Une seule grande place pour un bloc de fiches déposées : le rectangle qui les entoure toutes (coupé au
// cadre de la liste), dessiné comme la place ouverte pendant le glisser, qui s'efface pendant que les
// fiches s'y posent. En vue Photos, une seule case, comme la place ouverte (« +N »).
function grandePlace(racine, cartes, liste, couleur, nb, delai = 150 + (nb - 1) * 40, duree = 300) {
  if (calme() || !cartes.length) return
  const photos = liste?.classList.contains('pdt-vue-photos')
  const mesurer = () => {
    const rs = (photos ? cartes.slice(0, 1) : cartes).map(el => el.getBoundingClientRect())
    const cadre = liste?.getBoundingClientRect()
    let haut = Math.min(...rs.map(r => r.top)), bas = Math.max(...rs.map(r => r.bottom))
    let gauche = Math.min(...rs.map(r => r.left)), droite = Math.max(...rs.map(r => r.right))
    if (cadre) { haut = Math.max(haut, cadre.top); bas = Math.min(bas, cadre.bottom); gauche = Math.max(gauche, cadre.left); droite = Math.min(droite, cadre.right) }
    return { haut, bas, gauche, droite }
  }
  const { haut, bas, gauche, droite } = mesurer()
  if (bas <= haut || droite <= gauche) return
  const place = document.createElement('div')
  place.className = `pdt-trou pdt-grande-place${photos ? ' pdt-vue-photos' : ''}`
  if (photos) place.dataset.nb = nb
  if (couleur) place.style.setProperty('--t', couleur)
  Object.assign(place.style, { left: `${gauche}px`, top: `${haut}px`, width: `${droite - gauche}px`, height: `${bas - haut}px` })
  racine.appendChild(place)
  grandesPlaces.set(place, () => {
    const m = mesurer()
    Object.assign(place.style, { left: `${m.gauche}px`, top: `${m.haut}px`, width: `${Math.max(0, m.droite - m.gauche)}px`, height: `${Math.max(0, m.bas - m.haut)}px` })
  })
  ecouterDefilement()
  place.animate([{ opacity: 1 }, { opacity: 0 }], { delay: delai, duration: duree, easing: 'ease-out', fill: 'forwards' }).onfinish = () => { grandesPlaces.delete(place); place.remove() }
}

// Place et numéro de chaque fiche, et hauteur de chaque liste, relevés avant un changement. Seules les fiches à
// l'écran ou tout près (MARGE_RELEVE) sont relevées : les autres ne seront pas animées de toute façon (voir
// rejouerPositions), et relever la position de 1 000 fiches à chaque déplacement de la place visée coûtait cher.
// Un groupe entièrement hors de l'écran est sauté d'un bloc ; dans un groupe visible, la position approchée de
// chaque fiche (sans mesure coûteuse) dit si elle mérite d'être relevée.
const MARGE_RELEVE = 400
const releverPositions = racine => {
  const avant = new Map()
  const haut = -MARGE_RELEVE, bas = innerHeight + MARGE_RELEVE
  for (const section of racine.querySelectorAll('[data-machine]')) {
    const r = section.getBoundingClientRect()
    if (r.bottom < haut || r.top > bas) continue
    const defile = section.querySelector('.pdt-liste')?.scrollTop || 0
    for (const el of section.querySelectorAll('[data-fiche]')) {
      const y = r.top + el.offsetTop - defile
      if (y + el.offsetHeight < haut || y > bas) continue
      avant.set(el.dataset.fiche, { rect: el.getBoundingClientRect(), rang: el.querySelector('.pdt-rang')?.textContent ?? null, parent: el.offsetParent, haut: el.offsetTop, gauche: el.offsetLeft, groupe: [Math.round(r.left), Math.round(r.top)] })
    }
  }
  avant.listes = new Map([...racine.querySelectorAll('.pdt-liste')].map(l => [l, l.getBoundingClientRect().height]))
  return avant
}
// Resserrement en cours de chaque liste qui raccourcit.
const resserrements = new WeakMap()

// Quand le numéro d'une fiche change, l'ancien s'efface sur place pendant que le nouveau apparaît :
// on voit que c'est la même personne qui change de rang, pas une autre fiche qui la remplace.
// « place » : position du numéro déjà mesurée, pour ne pas relire la mise en page fiche par fiche.
function fondreNumero(el, ancien, delai = 0, place = null) {
  const rang = el.querySelector('.pdt-rang')
  if (calme() || !rang || ancien == null || String(ancien) === rang.textContent) return
  const p = place || { left: rang.offsetLeft, top: rang.offsetTop, width: rang.offsetWidth }
  const trace = document.createElement('span')
  trace.className = 'pdt-rang pdt-rang-ancien'
  trace.textContent = ancien
  Object.assign(trace.style, { left: `${p.left}px`, top: `${p.top}px`, width: `${p.width}px` })
  el.appendChild(trace)
  // Le fondu porte sur la couleur du texte, pas sur l'opacité : même rendu (le numéro n'est que du texte), mais
  // sans calque graphique. En opacité, chaque numéro qui changeait recevait le sien le temps du fondu : 16 calques
  // pendant un glisser, que le navigateur réorganisait à chaque image (mesuré le 2026-10-15).
  const reglage = { duration: 260, delay: delai, easing: 'ease-out', fill: 'both' }
  rang.animate([{ color: 'transparent', offset: 0 }], reglage)
  trace.animate([{ color: 'transparent', offset: 1 }], reglage).finished.then(() => trace.remove(), () => trace.remove())
}

// Chaque fiche glisse de son ancienne place à la nouvelle : c'est ce qui « écarte » la machine.
function rejouerPositions(racine, avant) {
  if (calme()) return
  // Une fiche qui attend sa copie en vol ne bouge pas : la copie vise sa place mesurée au départ.
  const fiches = [...racine.querySelectorAll('[data-fiche]')].filter(el => avant.has(el.dataset.fiche) && !('attend' in el.dataset))
  // Une fiche dont la place n'a pas changé depuis le relevé n'est pas relancée : si elle glisse encore, elle finit
  // son mouvement ; si elle est arrivée, elle reste où elle est. La relancer depuis le relevé la faisait sauter en
  // arrière : au lâcher, la page relève les positions, puis enregistre le dépôt une fraction de seconde plus tard
  // (jusqu'à 0,4 s sur un petit PC) ; entre-temps la fiche avait continué de glisser, et elle repartait de sa
  // position du lâcher, refaisant tout le trajet (geste enregistré du commanditaire, 2026-10-15 : 435 → 451,
  // retour à 435, puis 435 → 487 ; d'autant plus visible que le geste est rapide).
  // (Le groupe lui-même ne doit pas avoir bougé non plus : quand un groupe se déplace dans la page — un autre est
  // retiré, masqué ou ajouté —, ses fiches glissent toujours avec lui.)
  const cadres = new Map()
  const cadreDe = p => { if (!cadres.has(p)) { const b = p?.getBoundingClientRect(); cadres.set(p, b ? [Math.round(b.left), Math.round(b.top)] : null) } return cadres.get(p) }
  const continuent = new Set(fiches.filter(el => {
    const a = avant.get(el.dataset.fiche)
    if (a.parent !== el.offsetParent || a.haut !== el.offsetTop || a.gauche !== el.offsetLeft) return false
    const c = cadreDe(el.offsetParent)
    return !!c && Math.abs(c[0] - a.groupe[0]) < 1 && Math.abs(c[1] - a.groupe[1]) < 1
  }))
  // Trois passes pour une seule mise en page : on coupe tout, on mesure tout, puis on anime.
  // (Couper puis mesurer fiche par fiche forçait le navigateur à tout recalculer à chaque fiche.)
  // Repartir de la position visible (avant l'inclut) : l'écartement en cours est coupé avant de mesurer.
  fiches.forEach(el => { if (continuent.has(el)) return; ecartements.get(el)?.cancel(); ecartements.delete(el) })
  const listes = [...(avant.listes || [])].filter(([l]) => l.isConnected)
  listes.forEach(([l]) => { resserrements.get(l)?.cancel(); resserrements.delete(l) })
  const mesures = fiches.map(el => {
    const rang = el.querySelector('.pdt-rang')
    return { rect: el.getBoundingClientRect(), rang: rang && { left: rang.offsetLeft, top: rang.offsetTop, width: rang.offsetWidth } }
  })
  // Une liste qui raccourcit (sa place réservée se referme, une fiche la quitte) se resserre au
  // rythme des fiches qui remontent. Sinon son cadre sautait d'un coup et coupait par le bas
  // les fiches encore en mouvement, qui semblaient sortir de l'intérieur du groupe.
  listes.forEach(([l, hauteurAvant]) => {
    const hauteur = l.getBoundingClientRect().height
    const ressort = sansRebond ? ECARTEMENT_SANS_REBOND : ECARTEMENT
    if (hauteurAvant - hauteur > 1) resserrements.set(l, l.animate([{ minHeight: `${hauteurAvant}px` }, { minHeight: `${hauteur}px` }], { duration: ressort.duree, easing: ressort.courbe }))
  })
  // On n'anime que ce qui se voit : une fiche dont ni l'ancienne ni la nouvelle place n'est à l'écran (hors de
  // la fenêtre, ou cachée par le défilement de sa liste) prend sa place et son numéro directement. Sans cela, un
  // dépôt lançait des dizaines d'animations invisibles (34 fondus de numéro à la seule prise d'une fiche, mesuré
  // le 2026-10-15), qui chargeaient le programme sur un petit PC.
  const ecran = { left: 0, top: 0, right: innerWidth, bottom: innerHeight }
  const coupe = (r, z) => r.right > z.left && r.left < z.right && r.bottom > z.top && r.top < z.bottom
  const visibles = new Map()
  const cadreListe = el => {
    const l = el.closest('.pdt-liste')
    if (!l) return ecran
    if (!visibles.has(l)) visibles.set(l, l.getBoundingClientRect())
    return visibles.get(l)
  }
  fiches.forEach((el, k) => {
    const a = avant.get(el.dataset.fiche), b = mesures[k].rect
    if (!coupe(a.rect, ecran) && !(coupe(b, ecran) && coupe(b, cadreListe(el)))) return
    fondreNumero(el, a.rang, 0, mesures[k].rang)
    if (continuent.has(el)) return
    const dx = a.rect.left - b.left, dy = a.rect.top - b.top
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return
    const ressort = sansRebond ? ECARTEMENT_SANS_REBOND : ECARTEMENT
    ecartements.set(el, el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: ressort.duree, easing: ressort.courbe }))
  })
}

// La fiche se découpe en bandes verticales qui tombent puis se rassemblent à l'arrivée.
// Quand la vue d'arrivée diffère, chaque bande existe en deux formes (départ et arrivée) qui
// suivent le même trajet et se relaient par un fondu à mi-vol : rien n'est jamais étiré.
function lanieres(racine, { modele, modeleArrivee, de, vers, couleur, vue, vueArrivee }, fin) {
  if (calme() || !modele) return fin()
  // Le relais sert aussi dans une même vue : le numéro de départ laisse place à celui d'arrivée.
  const double = !!modeleArrivee
  const couches = [vue, ...(double ? [vueArrivee || vue] : [])].map(v => {
    const couche = document.createElement('div')
    // Les couches vivent hors des machines : elles reçoivent la teinte du groupe et leur vue.
    couche.className = `pdt-couche pdt-vue-${v}`
    couche.style.setProperty('--t', couleur)
    racine.appendChild(couche)
    return couche
  })
  const n = 12, cadence = { duration: 760, easing: 'cubic-bezier(.45, .05, .3, 1)', fill: 'both' }
  // Centre de la bande i d'une fiche posée dans le rectangle r.
  const centre = (r, i) => ({ x: r.left + ((i + 0.5) / n) * r.width, y: r.top + r.height / 2 })
  const poser = (source, r, i, couche) => {
    const bande = source.cloneNode(true)
    Object.assign(bande.style, {
      left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`,
      clipPath: `inset(0 ${100 - ((i + 1) / n) * 100}% 0 ${(i / n) * 100}%)`,
      transformOrigin: `${((i + 0.5) / n) * 100}% 50%`,
    })
    bande.classList.add('pdt-bande')
    couche.appendChild(bande)
    return bande
  }
  const vols = Array.from({ length: n }, (_, i) => {
    const ecart = (i - n / 2) * 7, chute = 30 + Math.random() * 46, tour = (Math.random() - 0.5) * 28
    const a = centre(de, i), b = centre(double ? vers : de, i)
    const arrivee = double ? b : { x: a.x + vers.left - de.left, y: a.y + vers.top - de.top }
    // Le trajet du centre de la bande, commun aux deux formes.
    const trajet = [
      { x: a.x, y: a.y, r: 0 },
      { x: a.x + ecart, y: a.y + chute, r: tour, offset: 0.32 },
      { x: arrivee.x + ecart * 0.25, y: arrivee.y - 28, r: -tour * 0.35, offset: 0.78 },
      { x: arrivee.x, y: arrivee.y, r: 0 },
    ]
    const suivre = (bande, depart) => bande.animate(trajet.map(({ x, y, r, offset }) => ({
      transform: `translate(${x - depart.x}px, ${y - depart.y}px) rotate(${r}deg)`, ...(offset ? { offset } : {}),
    })), { ...cadence, delay: i * 16 })
    const bandeDepart = poser(modele, de, i, couches[0])
    const vol = suivre(bandeDepart, a)
    if (!double) return vol.finished
    const bandeArrivee = poser(modeleArrivee, vers, i, couches[1])
    suivre(bandeArrivee, b)
    // Relais à mi-vol : la forme de départ s'efface pendant que celle d'arrivée apparaît.
    bandeDepart.animate([{ opacity: 1 }, { opacity: 1, offset: 0.42 }, { opacity: 0, offset: 0.66 }, { opacity: 0 }], { ...cadence, delay: i * 16 })
    bandeArrivee.animate([{ opacity: 0 }, { opacity: 0, offset: 0.42 }, { opacity: 1, offset: 0.66 }, { opacity: 1 }], { ...cadence, delay: i * 16 })
    return vol.finished
  })
  const finir = () => { couches.forEach(c => c.remove()); fin() }
  Promise.all(vols).then(finir, finir)
}

// Le chiffre roule vers le haut quand il augmente, vers le bas quand il baisse.
function Compteur({ valeur }) {
  const precedent = useRef(valeur)
  const sens = valeur > precedent.current ? 'monte' : valeur < precedent.current ? 'descend' : ''
  useEffect(() => { precedent.current = valeur }, [valeur])
  return <span className="pdt-compteur"><span key={valeur} className={sens ? `pdt-roule-${sens}` : undefined}>{valeur}</span></span>
}

const tiret = v => (v && String(v).trim()) || '—'

// Recherche tolérante, reprise de l'atelier de Codex : sans accents latins ni voyelles arabes,
// et alif/yā’ ramenés à une seule forme.
const normaliser = texte => String(texte || '').normalize('NFD')
  .replace(/[\u0300-\u036f\u064b-\u065f\u0670]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').toLowerCase().trim()

function ContenuFiche({ p, photo, vue, rang, venu, nomVenu, choisie, etatIcone, etatLibelle }) {
  return <>
    {rang != null && <span className="pdt-rang">{rang}</span>}
    <span className="pdt-portrait">
      {photo ? <img src={photo} alt="" draggable={false} /> : <span className="pdt-sans-photo">{(p.nomAr || p.nomLat || '?').trim().slice(0, 1)}</span>}
      {/* État Nusuk du pèlerin, la même icône que dans le fichier clients. */}
      {etatIcone && <img className="pdt-etat" src={etatIcone} alt={etatLibelle} title={etatLibelle} draggable={false} />}
    </span>
    {/* Nom arabe en premier, aligné à droite ; nom latin dessous, comme dans le fichier clients. */}
    <div className="pdt-fiche-noms">
      {p.nomAr
        ? <strong lang="ar" dir="rtl" className="pdt-nom-ar">{p.nomAr}</strong>
        : <strong>{p.nomLat || 'Nom non renseigné'}</strong>}
      {p.nomAr && p.nomLat && <span lang="fr" dir="ltr" className="pdt-nom-lat">{p.nomLat}</span>}
      {vue === 'details' && (
        <dl className="pdt-details">
          <div><dt>Hôtel</dt><dd>{tiret(p.hotelReel)}</dd></div>
          <div><dt>Chambre</dt><dd>{tiret(p.chambreReelle || p.chambrePayee)}</dd></div>
          <div><dt>Vol</dt><dd>{tiret(p.compagnie || p.vol)}</dd></div>
        </dl>
      )}
    </div>
    <code>{p.dossier}</code>
    {venu != null && <i className="pdt-coin" style={{ borderTopColor: teinte(venu) }} title={`Venu de ${nomVenu}`} />}
    {/* À la sélection, un trait lumineux fait une fois le tour de la fiche (idée reprise de Codex). */}
    {choisie && <svg className="pdt-eclat" aria-hidden="true"><rect x="1" y="1" rx="6" pathLength="100" /></svg>}
  </>
}

function ChoixVue({ vue, choisir, libelle }) {
  return (
    <div className="pdt-vues" role="radiogroup" aria-label={libelle}>
      {VUES.map(v => (
        <button key={v.id} role="radio" aria-checked={vue === v.id} className={vue === v.id ? 'pdt-vue-active' : undefined} title={v.nom} onClick={() => choisir(v.id)}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d={v.icone} /></svg>
          <span>{v.nom}</span>
        </button>
      ))}
    </div>
  )
}

// Une fiche d'une machine. Mémorisée : quand la place réservée bouge pendant un glisser,
// seules les fiches dont une donnée change sont redessinées, pas les 52.
const Fiche = memo(function Fiche({ p, num, photo, vue, rang, venu, nomVenu, choisie, recherche, surPointeur, etatIcone, etatLibelle }) {
  return (
    <div data-fiche={cle(p.dossier)} aria-selected={choisie}
      className={`pdt-fiche${choisie ? ' pdt-choisie' : ''}${recherche ? ` pdt-${recherche}` : ''}`}
      onPointerDown={e => surPointeur(e, p.dossier, num)}>
      <ContenuFiche p={p} photo={photo} vue={vue} rang={rang} venu={venu} nomVenu={nomVenu} choisie={choisie} etatIcone={etatIcone} etatLibelle={etatLibelle} />
    </div>
  )
})

// Le groupe « Hors groupe Visa » : un objet fixe, pour que son composant mémorisé le reconnaisse d'un rendu à
// l'autre.
const MACHINE_LIBRE = { num: LIBRE, nomPerso: 'Hors groupe Visa' }
const decouper = texte => (texte ? texte.split('|') : [])

// Un groupe (une « machine ») et ses fiches. Mémorisé : pendant un glisser, seuls le groupe de départ et le groupe
// visé changent de données ; les autres ne sont pas refaits. Avant (2026-10-15), toute la page était refaite à
// chaque déplacement de la place visée : avec 1 000 pèlerins, 1 000 fiches reconstruites à chaque fois.
// Les données de chaque groupe arrivent déjà réduites à des valeurs simples (textes, nombres) : « ids » est
// comparé par son texte « idsCle », et les actions passent par un objet stable.
const Machine = memo(function Machine({
  m, ids, vue, categorie, trou, trouOrigine, nbGlisse, glisseActif, choisisCle, trouvesCle, provenanceCle,
  photos, parDossier, effectif, nbChoisis, demonte, allumeeT, maintenu, visee, actions,
}) {
  const verrou = motifVerrouMachine(categorie)
  const fixe = machineFixe(m)
  // « Hors groupe Visa » et « sans groupe Nusuk » restent en tête ; les autres groupes se déplacent par leur en-tête.
  const mobile = m.num !== LIBRE && !fixe
  const choisis = new Set(decouper(choisisCle))
  const trouves = trouvesCle == null ? null : new Set(decouper(trouvesCle))
  const provenance = new Map(decouper(provenanceCle).map(x => { const i = x.lastIndexOf(':'); return [x.slice(0, i), Number(x.slice(i + 1))] }))
  // En grille, la place réservée vaut une case ; en liste, la hauteur de tout le bloc,
  // mesurée en fiches de la vue d'arrivée (qui peut différer de celle de départ).
  const styleTrou = vue === 'photos' || !glisseActif ? undefined : { height: `calc(${nbGlisse} * var(--fiche) + ${nbGlisse - 1} * var(--espace))` }
  const place = <div key="trou" className={`pdt-trou${trouOrigine ? ' pdt-trou-origine' : ''}`} style={styleTrou} data-nb={nbGlisse > 1 ? nbGlisse : undefined} />
  const rangs = []
  ids.forEach((id, i) => {
    const k = cle(id)
    if (trou === i) rangs.push(place)
    const p = parDossier.get(k)
    if (!p) return
    const venu = provenance.get(k)
    const ef = etatFiche(p, m.num === LIBRE ? null : m)
    rangs.push(
      <Fiche key={k} p={p} num={m.num} photo={photos[k]} vue={vue} rang={i + 1}
        venu={venu} nomVenu={venu != null ? actions.nomMachine(venu) : undefined}
        choisie={choisis.has(k)} recherche={trouves ? (trouves.has(k) ? 'trouvee' : 'hors-recherche') : ''}
        surPointeur={actions.surPointeur} etatIcone={ef.icone} etatLibelle={ef.libelle} />
    )
  })
  if (trou === ids.length) rangs.push(place)
  return (
    <section data-machine={m.num} data-categorie={categorie || 'hors'} data-mobile={mobile ? '' : undefined}
      className={`pdt-machine${demonte ? ' pdt-demontage' : ''}${visee ? ` pdt-${visee}` : ''}${verrou ? ' pdt-verrouillee' : ''}`}
      style={{ '--t': categorie ? CATEGORIES[categorie]?.color || teinte(m.num) : teinte(m.num) }} aria-label={m.nomPerso}>
      {visee === 'visee' && <span className="pdt-faisceau" aria-hidden="true" />}
      <div key={allumeeT ?? 'repos'} className={`pdt-plaque${allumeeT != null ? ' pdt-allumee' : ''}`} onPointerDown={mobile ? e => actions.tirerGroupe(e, m.num) : undefined}>
        {categorie ? <img className="pdt-icone-categorie" src={iconeCategorie(categorie)} alt="" title={CATEGORIES[categorie]?.label} /> : <span className="pdt-voyant" />}
        {/* Nom modifiable seulement pour un groupe modifiable : pas pour le « sans groupe » fixe ni un groupe verrouillé. */}
        {m.num === LIBRE || fixe || verrou
          ? <h2 title={m.nomPerso}>{m.nomPerso}</h2>
          : <input value={m.nomPerso} maxLength={60} aria-label={`Nom de ${m.nomPerso}`}
              onChange={e => actions.renommer(m.num, e.target.value, false)} onBlur={e => actions.renommer(m.num, e.target.value, true)} />}
        {nbChoisis > 0 && <span className="pdt-nb-choisis"><Compteur valeur={nbChoisis} /> sél.</span>}
        {verrou && <span className="pdt-cadenas" title={verrou} aria-label={verrou}>🔒</span>}
        <span className="pdt-effectif"><Compteur valeur={effectif} /></span>
        {/* Seul un groupe temporaire (préparé ici) se démonte ; les groupes Nusuk existent dans Nusuk. */}
        {categorie === 'temporaire' && (
          <button className={`pdt-demonter${maintenu ? ' pdt-maintenu' : ''}`} style={{ '--maintien': `${MAINTIEN}ms` }}
            aria-label={`Démonter ${m.nomPerso} (maintenir appuyé)`} title="Maintenir appuyé pour démonter"
            onPointerDown={e => { if (e.button === 0) actions.commencerMaintien(m.num) }} onPointerUp={actions.arreterMaintien} onPointerLeave={actions.arreterMaintien}
            onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); actions.commencerMaintien(m.num) } }}
            onKeyUp={e => { if (e.key === 'Enter' || e.key === ' ') actions.arreterMaintien() }}>
            <span>✕</span>
          </button>
        )}
      </div>
      <div className="pdt-barre-vue">
        <span className="pdt-categorie">
          {categorie ? CATEGORIES[categorie]?.label : 'Pas encore dans un groupe Visa'}
          {m.visaBrouillon?.nusukId && <> · n° <bdi>{m.visaBrouillon.nusukId}</bdi></>}
        </span>
        <ChoixVue vue={vue} choisir={v => actions.choisirVue(m.num, v)} libelle={`Vue de ${m.nomPerso}`} />
      </div>
      <div className={`pdt-liste pdt-vue-${vue}`}>
        {rangs}
        {!rangs.length && <p className="pdt-vide">{verrou ? 'Groupe verrouillé' : glisseActif ? `Déposer ${nbGlisse > 1 ? `les ${nbGlisse} pèlerins` : 'le pèlerin'} ici` : 'Déposer une fiche ici'}</p>}
      </div>
    </section>
  )
}, (a, b) => {
  for (const k in a) if (k !== 'ids' && !Object.is(a[k], b[k])) return false
  return true
})

// « connecte » (écran Groupes de l'espace client, ecran-groupes.jsx) : les pèlerins, la lecture Nusuk et les groupes
// sont ceux du registre, déjà chargés ; chaque changement de groupe y est écrit avec ses règles. « actif » : l'écran
// est affiché (caché, il ne réagit ni au clavier ni aux clics) ; « retour » : bouton vers le registre.
export default function PosteDeTri({ connecte = null, actif = true, retour = null } = {}) {
  const actifRef = useRef(actif)
  actifRef.current = actif
  // Barre de défilement de la page elle-même dans le style du Poste de tri, seulement quand il est affiché.
  useEffect(() => {
    if (!actif) return
    document.documentElement.classList.add('pdt-page')
    return () => document.documentElement.classList.remove('pdt-page')
  }, [actif])
  // Choix retenu dans le navigateur (préférence facultative), lu après l'affichage pour ne pas fausser le rendu serveur.
  const [sansAnimation, setSansAnimation] = useState(false)
  useEffect(() => { try { setSansAnimation(localStorage.getItem('pdt-sans-animation') === '1') } catch { /* préférence facultative */ } }, [])
  sansRebond = sansAnimation
  // Enregistreur de geste (essai du 2026-10-15) : '' prêt · 'arme' en cours · 'envoi' · 'fait' · 'erreur'.
  const [enregistrement, setEnregistrement] = useState('')
  function enregistrerGeste() {
    if (enregistrement === 'arme' || enregistrement === 'envoi') return
    setEnregistrement('arme')
    const t0 = performance.now(), images = [], evenements = [], vues = new WeakSet(), precedentes = new Map()
    let souris = null, fin = 0
    const temps = () => Math.round(performance.now() - t0)
    const surBouge = e => { souris = [Math.round(e.clientX), Math.round(e.clientY)] }
    const surAppui = e => evenements.push({ t: temps(), type: 'appui', x: Math.round(e.clientX), y: Math.round(e.clientY) })
    const surLacher = e => {
      evenements.push({ t: temps(), type: prise.current?.actif ? 'lâcher (fin de glisser)' : 'relâché', x: Math.round(e.clientX), y: Math.round(e.clientY) })
      if (prise.current?.actif) fin = performance.now() + 2000
    }
    window.addEventListener('pointermove', surBouge, true)
    window.addEventListener('pointerdown', surAppui, true)
    window.addEventListener('pointerup', surLacher, true)
    const decrire = x => {
      const el = x.effect?.target?.nodeType === 1 ? x.effect.target : null
      const nom = el ? ((el.className?.baseVal ?? el.className ?? '').toString().split(' ').filter(c => /^(pdt|mb|d5)/.test(c)).slice(0, 2).join('.') || el.tagName.toLowerCase()) : '?'
      const quoi = x.transitionProperty ? 'transition ' + x.transitionProperty : x.animationName ? 'animation ' + x.animationName
        : 'animation ' + [...new Set((x.effect?.getKeyframes?.() || []).flatMap(k => Object.keys(k).filter(c => !['offset', 'easing', 'composite', 'computedOffset'].includes(c))))].join('+')
      return `${quoi} · ${nom}${x.effect?.pseudoElement || ''}${el?.dataset?.fiche ? ' #' + el.dataset.fiche : ''} · groupe ${el?.closest?.('[data-machine]')?.dataset.machine ?? '-'}`
    }
    const terminer = async () => {
      window.removeEventListener('pointermove', surBouge, true)
      window.removeEventListener('pointerdown', surAppui, true)
      window.removeEventListener('pointerup', surLacher, true)
      setEnregistrement('envoi')
      try {
        const rep = await fetch('/test-groupes-broyeur/journal-geste', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ quand: new Date().toISOString(), ecran: { largeur: innerWidth, hauteur: innerHeight, densite: devicePixelRatio }, navigateur: navigator.userAgent, rebondRetire: sansRebond, evenements, images }),
        })
        setEnregistrement((await rep.json()).ok ? 'fait' : 'erreur')
      } catch { setEnregistrement('erreur') }
    }
    const image = () => {
      const maintenant = performance.now(), racineEl = racine.current
      // Fiches : seulement celles dont la position (ou l'état caché) a changé depuis l'image précédente.
      const fiches = {}
      for (const el of racineEl?.querySelectorAll('[data-fiche]') || []) {
        const b = el.getBoundingClientRect()
        const v = `${Math.round(b.left)},${Math.round(b.top)}${el.style.visibility === 'hidden' || el.dataset.attend != null ? ' cachée' : ''}`
        if (precedentes.get(el.dataset.fiche) !== v) { fiches[el.dataset.fiche] = v; precedentes.set(el.dataset.fiche, v) }
      }
      const trou = racineEl?.querySelector('.pdt-trou')
      const enMain = racineEl?.querySelector('.pdt-fantome:not(.pdt-vol-libre)')
      const nouvelles = []
      for (const a of document.getAnimations()) if (!vues.has(a)) { vues.add(a); nouvelles.push(decrire(a)) }
      const c = cibleCourante.current, at = attente.current
      images.push({
        t: Math.round(maintenant - t0), souris, fiches,
        place: trou ? { groupe: trou.closest('[data-machine]')?.dataset.machine, rang: [...trou.parentElement.children].indexOf(trou), depart: trou.classList.contains('pdt-trou-origine'), opacite: trou.style.opacity || '1' } : null,
        enMain: enMain ? (b => [Math.round(b.left), Math.round(b.top)])(enMain.getBoundingClientRect()) : null,
        copies: [...(racineEl?.querySelectorAll('.pdt-vol-libre') || [])].map(x => (b => [Math.round(b.left), Math.round(b.top)])(x.getBoundingClientRect())),
        cible: c ? `${c.num}:${c.index}${c.origine ? ' départ' : ''}${c.refus ? ' refus' : ''}` : null, attente: at ? String(at.num) : null,
        nouvelles,
      })
      if ((fin && maintenant > fin) || maintenant - t0 > 15000) return void terminer()
      requestAnimationFrame(image)
    }
    requestAnimationFrame(image)
  }
  const basculerAnimations = () => setSansAnimation(v => {
    try { localStorage.setItem('pdt-sans-animation', v ? '0' : '1') } catch { /* préférence facultative */ }
    return !v
  })
  const [pelerins, setPelerins] = useState([])
  const [chargement, setChargement] = useState('en-cours')
  const [lecture, setLecture] = useState(null)
  const [essai, setEssai] = useState(0)
  const [machines, setMachines] = useState([])
  // Groupes masqués depuis le panneau des groupes : ils disparaissent de l'atelier (rien n'est supprimé). C'est le
  // « ferme » des groupes : branché sur le registre, celui de sa partie Visa (fermé là-bas = masqué ici, et inversement).
  const cleMasques = machines.filter(m => m.ferme).map(m => m.num).join(',')
  const masques = useMemo(() => new Set(cleMasques ? cleMasques.split(',').map(Number) : []), [cleMasques])
  const basculerMasque = useCallback(num => actionsAJour.current.basculerVisibilite(num), [])
  const tirerDuPanneau = useCallback((e, num) => actionsAJour.current.tirerDepuisPanneau(e, num), [])
  const [actualisation, setActualisation] = useState(false)
  const [refus, setRefus] = useState(null)
  const [largeurTableau, setLargeurTableau] = useState(() => { try { return Number(localStorage.getItem('pdt-largeur-tableau')) || 560 } catch { return 560 } })
  const tableau = useRef(null)
  const [vues, setVues] = useState({})
  const [provenance, setProvenance] = useState({})
  const [allumee, setAllumee] = useState(null)
  const [demontage, setDemontage] = useState(null)
  const [journal, setJournal] = useState([])
  const [selection, setSelection] = useState([])
  const [glisse, setGlisse] = useState(null)
  const [cible, setCible] = useState(null)
  const [annulable, setAnnulable] = useState(null)
  const [maintien, setMaintien] = useState(null)
  const [photos, setPhotos] = useState({})
  // Disposition libre des zones (null : la page normale) et calque d'édition.
  const [disposition, setDisposition] = useState(null)
  const [miseEnPage, setMiseEnPage] = useState(false)
  useEffect(() => { setDisposition(lireDisposition()) }, [])
  const ouvrirMiseEnPage = () => {
    if (!disposition) setDisposition(releverDisposition(racine.current))
    setMiseEnPage(true)
  }
  const [recherche, setRecherche] = useState('')
  const champRecherche = useRef(null)
  const racine = useRef(null)
  // Point d'entrée stable du glisser : la fiche mémorisée n'est pas redessinée pour un nouveau rappel.
  const commencerActuel = useRef(null)
  const zones = useRef([])
  const surPointeur = useCallback((e, id, num) => commencerActuel.current?.(e, id, num), [])
  const surPriseTableau = useCallback((e, id) => commencerActuel.current?.(e, id, null, true), [])
  commencerActuel.current = commencer
  const fantome = useRef(null)
  const prise = useRef(null)
  const ancre = useRef(null)
  // Fiches qui viennent d'être déposées (et restent sélectionnées) : le premier clic sur une autre fiche repart
  // d'une sélection neuve au lieu de s'y ajouter. Un clic sur l'une d'elles la retire, comme d'habitude.
  const deposees = useRef(null)
  const cliquer = (avant, k) => {
    const d = deposees.current
    deposees.current = null
    if (d && !d.has(k)) return [k]
    return avant.includes(k) ? avant.filter(x => x !== k) : [...avant, k]
  }
  const cibleCourante = useRef(null)
  // Un dépôt s'enregistre en arrière-plan : tant qu'il n'est pas fini, on ne reprend pas de fiche
  // (les données seraient encore celles d'avant le dépôt).
  const depotEnCours = useRef(false)
  // Groupe survolé mais pas encore retenu (voir DELAI_GROUPE), et la minuterie qui le retient.
  const attente = useRef(null)
  const minuterieAttente = useRef(0)
  const avant = useRef(null)
  const arrivee = useRef(null)
  const minuterieMaintien = useRef(null)
  const etat = useRef({})
  etat.current = { machines, pelerins, selection, provenance, annulable, vues }

  const vueDe = num => vues[num] ?? 'liste'

  // Registre et dernière lecture Nusuk, par la fiche Visa. Les groupes viennent des données
  // (groupes Nusuk) ; une actualisation les complète sans effacer ce qui a été préparé ici.
  useEffect(() => {
    if (connecte) return
    const arret = new AbortController()
    if (!essai) setChargement('en-cours')
    else setActualisation(true)
    chargerVisa(arret.signal, etat.current.machines, { toutesAdresses: true })
      .then(r => {
        setPelerins(r.rows)
        // Un passeport supprimé entre deux lectures quitte aussi ses groupes : sinon il resterait
        // compté sans être affiché.
        const existants = new Set(r.rows.map(p => cle(p.dossier)))
        const premier = !etat.current.machines.length
        // Premier chargement : tous les groupes affichés ; une actualisation garde ce qui était affiché ou masqué.
        const lues = r.paniers.map(m => ({ ...m, ferme: premier ? false : !!etat.current.machines.find(x => x.num === m.num)?.ferme }))
          .map(m => m.ids.every(id => existants.has(cle(id))) ? m : { ...m, ids: m.ids.filter(id => existants.has(cle(id))) })
        // Premier chargement : groupes rangés par catégorie. Une actualisation garde l'ordre réglé.
        if (premier) lues.sort((a, b) => (RANG_CATEGORIE[categorieMachine(a, r.rows)] ?? 9) - (RANG_CATEGORIE[categorieMachine(b, r.rows)] ?? 9) || a.num - b.num)
        setMachines(lues)
        setLecture({ recus: r.recus, annules: r.annules, nusuk: r.lecture, alerte: r.alerte })
        setChargement('pret')
      })
      .catch(e => { if (!arret.signal.aborted) { setLecture({ erreur: e.message }); setChargement('erreur') } })
      .finally(() => { if (!arret.signal.aborted) setActualisation(false) })
    return () => arret.abort()
  }, [essai])

  // Branché sur le registre de l'espace client : ses groupes font foi. Ce qui arrive du registre remplace les groupes
  // affichés ; ce que l'on change ici (dépôt, nouveau groupe, nom, démontage, annulation) y est écrit, et le registre
  // applique ses règles Visa : un refus remet ses groupes et montre son motif. « synchro » : signature des derniers
  // groupes reçus ou écrits, pour ne jamais renvoyer au registre ce qu'il vient de donner. L'ordre et « ferme »
  // (affiché ou masqué) en font partie : ils sont communs aux deux écrans.
  const synchro = useRef(null)
  // Vrai entre une réception et le rendu qui l'affiche : pendant ce temps, rien n'est écrit (sinon les groupes encore
  // affichés, vides au premier passage, partiraient vers le registre).
  const enReception = useRef(false)
  const signatureGroupes = liste => JSON.stringify(liste.map(g => [g.num, g.nomPerso || '', g.ids.map(cle), !!g.ferme]))
  useEffect(() => {
    if (!connecte) return
    setPelerins(connecte.pelerins)
    setLecture(connecte.lecture)
    setChargement('pret')
  }, [connecte?.pelerins, connecte?.lecture]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!connecte) return
    const recue = signatureGroupes(connecte.paniers)
    if (recue !== signatureGroupes(etat.current.machines)) { enReception.current = true; setMachines(connecte.paniers) }
    synchro.current = recue
  }, [connecte?.paniers]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!connecte || synchro.current == null) return
    const ici = signatureGroupes(machines)
    if (enReception.current) { if (ici === synchro.current) enReception.current = false; return }
    if (ici === synchro.current) return
    // Nom en cours de saisie : écrit quand le champ est quitté (le nom définitif arrive à ce moment-là).
    if (document.activeElement?.closest?.('.pdt-plaque')) return
    const motif = connecte.ecrire(machines)
    if (typeof motif === 'string' && motif) {
      refuser(motif)
      enReception.current = true
      setMachines(connecte.paniers)
      return
    }
    // Une règle du registre a placé un pèlerin ailleurs : ses groupes arrivent juste après, avec la bonne place.
    if (motif?.avis) refuser(motif.avis)
    synchro.current = ici
  }, [machines]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sélection partagée avec le registre : en arrivant sur cet écran, le tableau coche ce que le registre avait coché ;
  // en le quittant, il rend ses coches au registre.
  const affiche = useRef(false)
  useEffect(() => {
    if (!connecte || chargement !== 'pret') return
    if (actif && !affiche.current) tableau.current?.selectionner?.(connecte.lireSelection())
    if (!actif && affiche.current) connecte.ecrireSelection(tableau.current?.selection?.() || [])
    affiche.current = actif
  }, [actif, chargement]) // eslint-disable-line react-hooks/exhaustive-deps

  // Nouvelle lecture envoyée par l'extension : on actualise, comme le fichier clients (branché sur le registre, c'est
  // lui qui la reçoit et l'applique).
  useEffect(() => {
    if (connecte) return
    const recevoir = e => {
      if (e.source === window && e.origin === location.origin && e.data?.channel === NUSUK_CHANNEL && e.data.direction === 'nusuk-preview') setEssai(n => n + 1)
    }
    window.addEventListener('message', recevoir)
    return () => window.removeEventListener('message', recevoir)
  }, [])

  // Les photos arrivent par lots de quatre, une seule fois chacune pour toute la page.
  useEffect(() => {
    if (chargement !== 'pret') return
    let actif = true
    // Une photo en échec n'est pas notée : la prochaine lecture du registre (« Relire ») la redemande.
    const manquantes = pelerins.filter(p => (p.vignetteUrl || p.portraitUrl) && !photos[cle(p.dossier)])
    void chargerPhotos(manquantes, lot => setPhotos(v => ({ ...v, ...Object.fromEntries(lot.filter(([, source]) => source)) })), () => actif)
    return () => { actif = false }
    // Ne relancer qu'à la lecture du registre, pas à chaque photo reçue.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pelerins, chargement])

  // Ctrl+K va à la recherche ; Échap vide la sélection (le glisser en cours gère sa propre touche).
  useEffect(() => {
    const clavier = e => {
      if (!actifRef.current) return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); champRecherche.current?.focus(); champRecherche.current?.select(); return }
      if (e.key === 'Escape' && !prise.current && etat.current.selection.length && !e.target.closest?.('input, textarea')) setSelection([])
    }
    window.addEventListener('keydown', clavier)
    return () => window.removeEventListener('keydown', clavier)
  }, [])

  // Un clic ailleurs que sur une fiche vide la sélection, y compris dans un groupe (fond, titre, bas de
  // liste) : avec tous les groupes affichés côte à côte, c'est le geste le plus simple (demande du
  // 2026-10-15). Seule exception : la fine bande horizontale entre deux fiches l'une au-dessus de l'autre,
  // où l'on clique en visant une fiche de trop près — elle ne compte pas. Les commandes (boutons, champs),
  // le tableau et le panneau des groupes gardent leurs propres clics.
  useEffect(() => {
    const entreDeuxFiches = (cible, x, y) => {
      const liste = cible.closest?.('.pdt-liste')
      if (!liste) return false
      const rs = [...liste.querySelectorAll('[data-fiche]')].map(el => el.getBoundingClientRect())
      return rs.some(a => x >= a.left && x <= a.right && y >= a.bottom && rs.some(b => b !== a && b.top >= y && b.top - a.bottom <= 14 && x >= b.left && x <= b.right))
    }
    const dehors = e => {
      if (!actifRef.current || !etat.current.selection.length) return
      if (e.target.closest?.('.pdt-fiche, .pdt-tableau, .d5, input, button, select, textarea, label')) return
      if (entreDeuxFiches(e.target, e.clientX, e.clientY)) return
      setSelection([])
    }
    document.addEventListener('mousedown', dehors, true)
    return () => document.removeEventListener('mousedown', dehors, true)
  }, [])

  // Ctrl+Z annule le dernier transfert tant que son bandeau est affiché.
  useEffect(() => {
    const clavier = e => {
      if (!actifRef.current || !(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z' || !etat.current.annulable) return
      if (e.target.closest?.('input, textarea')) return
      e.preventDefault()
      annuler()
    }
    window.addEventListener('keydown', clavier)
    return () => window.removeEventListener('keydown', clavier)
  }, [])

  useLayoutEffect(() => {
    if (glisse && prise.current) placerFantome()
    if (avant.current && racine.current) rejouerPositions(racine.current, avant.current)
    avant.current = null
    // La mise en page vient de changer pendant un glisser : on remesure la carte des machines.
    if (glisse) releverZones()
    const a = arrivee.current
    // Tant que la fiche est encore « en main » (dépôt pas encore enregistré en arrière-plan), un autre
    // rendu ne doit pas consommer l'arrivée : la fiche n'est pas encore à sa nouvelle place.
    if (!a || !racine.current || glisse) return
    arrivee.current = null
    depotEnCours.current = false
    const cartes = a.ids.map(id => racine.current.querySelector(`[data-fiche="${id}"]`))
    // Le trait lumineux de sélection salue une sélection (un clic), pas un dépôt : une fiche déposée ou rendue à
    // sa place est redessinée, et le trait refaisait son tour à chaque déplacement (« petit ruban », 2026-10-15).
    if (!a.clic) cartes.forEach(el => el?.querySelectorAll('.pdt-eclat').forEach(e => e.getAnimations({ subtree: true }).forEach(x => x.finish())))
    cartes.find(Boolean)?.scrollIntoView({ block: 'nearest' })
    const transfere = k => (Array.isArray(a.transfert) ? a.transfert[k] : a.transfert)
    // Les lanières ne servent que si la fiche change de forme (vues différentes) ;
    // dans une même vue, elle glisse simplement jusqu'à sa place.
    const dechire = k => transfere(k) && a.vueArrivee && a.vueArrivee !== a.vue
    // Vol libre en cours : une copie par fiche, lancée au lâcher et jouée par la carte graphique (voir
    // lancerVol). Ici, chaque copie est seulement redirigée vers la place exacte de sa fiche si elle diffère
    // de la place prévue, sans s'arrêter. Rien n'est confié au programme pour la fin du vol : c'est ce qui
    // faisait saccader le dépôt d'un bloc (la cascade repartait en animation pilotée par le programme, au
    // moment précis où il était le plus occupé ; signalé le 2026-10-15).
    // La place : une seule fiche attend invisible (elle garde son espace, sans rien dessiner) ; un bloc a une
    // seule grande place pour toutes ses fiches, qui s'efface en fondu quand les fiches s'en approchent.
    if (a.vols?.length && cartes.some(Boolean) && !a.ids.some((_, k) => dechire(k))) {
      const seule = a.ids.length === 1
      const enAttente = new Set()
      const reveler = el => { revelerFiche(el); enAttente.delete(el) }
      let debutFondu = Infinity, finVols = 0
      a.ids.forEach((id, k) => {
        const el = cartes[k], v = a.vols.find(x => String(x.id) === String(id))
        if (!el) { v?.copie.remove(); return }
        el.dataset.attend = ''
        if (!seule) el.style.visibility = 'hidden'
        enAttente.add(el)
        fondreNumero(el, a.rangs?.[id], 0)
        if (!v || !vols.has(v.copie)) return
        const r = el.getBoundingClientRect(), vers = versPage(v.copie.offsetParent || racine.current, r.left, r.top)
        const prevu = vols.get(v.copie)
        if (Math.hypot(prevu.vers.x - vers.x, prevu.vers.y - vers.y) > 1) {
          if (prevu.a.playState === 'finished') voler(v.copie, etatVol(v.copie), vers)
          else redirigerVol(v.copie, vers)
        }
        const { a: anim, etats } = vols.get(v.copie)
        const ecoule = Number(anim.currentTime) || 0
        const proche = Math.max(0, etats.findIndex((e, i) => i * PAS_VOL >= (vols.get(v.copie).attente || 0) && Math.hypot(e.x - vers.x, e.y - vers.y) < 60))
        debutFondu = Math.min(debutFondu, Math.max(0, proche * PAS_VOL * 1000 - ecoule))
        finVols = Math.max(finVols, (etats.length - 1) * PAS_VOL * 1000 - ecoule)
        const atterrir = () => { atterrissages.delete(v.copie); reveler(el); v.copie.remove(); if (transfere(k)) saluerFiche(el) }
        atterrissages.set(v.copie, el); ecouterDefilement()
        if (anim.playState === 'finished') atterrir()
        else anim.onfinish = anim.oncancel = atterrir
      })
      // Copies sans fiche d'arrivée : retirées.
      a.vols.forEach(v => { if (!a.ids.some(id => String(id) === String(v.id))) v.copie.remove() })
      if (!Number.isFinite(debutFondu)) debutFondu = 0
      const duree = Math.max(80, finVols - debutFondu)
      if (!seule) {
        const machine = racine.current.querySelector(`[data-machine="${a.vers}"]`)
        grandePlace(racine.current, cartes.filter(Boolean), machine?.querySelector('.pdt-liste'), machine && getComputedStyle(machine).getPropertyValue('--t'), a.ids.length, debutFondu, duree)
      }
      // Filet : une fiche qui n'aurait pas eu de vol apparaît à la fin des autres.
      setTimeout(() => [...enAttente].forEach(reveler), finVols + 100)
      if (a.ids.some((_, k) => transfere(k))) setTimeout(() => setAllumee({ num: a.vers, t: Date.now() }), Math.min(finVols, 400))
      return
    }
    a.vols?.forEach(v => v.copie.remove())
    const dernier = a.ids.map((_, k) => k).filter(transfere).pop()
    a.ids.forEach((id, k) => {
      const el = cartes[k]
      if (!el) return
      const vers = el.getBoundingClientRect()
      const de = a.de[id]
      if (dechire(k) && de) {
        // Modèle de la forme d'arrivée, pris sur la vraie fiche avant de la masquer.
        const modeleArrivee = el.cloneNode(true)
        ;['style', 'data-fiche', 'aria-selected'].forEach(n => modeleArrivee.removeAttribute(n))
        // Le trait de sélection rejouerait dans chaque lanière : il ne part qu'avec la vraie fiche.
        modeleArrivee.querySelector('.pdt-eclat')?.remove()
        el.style.opacity = '0'
        setTimeout(() => lanieres(racine.current, { modele: a.modeles[id], modeleArrivee, de, vers, couleur: couleurDe(a.vers), vue: a.vue, vueArrivee: a.vueArrivee }, () => {
          el.style.opacity = ''
          saluerFiche(el)
          if (k === dernier) setAllumee({ num: a.vers, t: Date.now() })
        }), calme() ? 0 : k * CASCADE)
      } else {
        const delai = k * 40
        // Départ : la place exacte de la fiche dans la pile tenue en main, avec son élan.
        const depart = a.depart?.[id]
        const machine = el.closest('[data-machine]')
        if (depart) poser(racine.current, el, depart, a.elan, {
          delai, vue: machine?.querySelector('.pdt-liste')?.className.match(/pdt-vue-(\w+)/)?.[1],
          couleur: machine && getComputedStyle(machine).getPropertyValue('--t'), ancienRang: a.rangs?.[id],
        })
        else fondreNumero(el, a.rangs?.[id], delai)
        if (transfere(k) && k === dernier) setTimeout(() => setAllumee({ num: a.vers, t: Date.now() }), delai + 200)
      }
    })
  })

  const noter = texte => setJournal(j => [{ id: Date.now() + Math.random(), texte }, ...j].slice(0, 6))
  const nomMachine = num => num === LIBRE ? 'Hors groupe Visa' : etat.current.machines.find(m => m.num === num)?.nomPerso ?? `Groupe ${num}`
  const nomPelerin = id => etat.current.pelerins.find(p => cle(p.dossier) === cle(id))?.nomLat || `Dossier ${id}`

  // Liste affichée d'une machine, sans les fiches en cours de glissement.
  const idsDe = (num, liste = machines, sauf = []) => {
    let ids
    if (num === LIBRE) {
      const pris = new Set(liste.flatMap(m => m.ids.map(cle)))
      ids = etat.current.pelerins.filter(p => !pris.has(cle(p.dossier))).map(p => p.dossier)
    } else ids = liste.find(m => m.num === num)?.ids ?? []
    if (!sauf.length) return ids
    const exclus = new Set(sauf.map(cle))
    return ids.filter(id => !exclus.has(cle(id)))
  }

  const groupeDe = id => etat.current.machines.find(m => m.ids.some(x => cle(x) === cle(id)))?.num ?? LIBRE
  // Catégorie d'une machine (les 5 catégories du Visa), d'après les données à jour.
  const categorieDe = num => {
    const m = num === LIBRE ? null : etat.current.machines.find(x => x.num === num)
    return m ? categorieMachine(m, etat.current.pelerins) : null
  }
  // Couleur réelle d'un groupe, la même que son cadre (couleur de sa catégorie). La fiche tenue en main et
  // ses lanières la prennent aussi : elles prenaient la teinte numérotée du groupe, qui n'a rien à voir (une
  // fiche de « Pèlerins sans groupe Nusuk » devenait orange une fois prise en main ; signalé le 2026-10-15).
  const couleurDe = num => {
    const c = categorieDe(num)
    return c ? CATEGORIES[c]?.color || teinte(num) : teinte(num)
  }
  // Geste refusé : la raison s'affiche quelques secondes.
  const refuser = texte => setRefus({ id: Date.now(), texte })

  // Sélection : un clic sur la fiche (ou sa case) l'ajoute ou la retire (les clics arrivent toujours avec
  // « ctrl ») ; Maj ajoute la plage depuis l'ancre dans le même groupe. Échap ou « Désélectionner » vident.
  function selectionner(id, num, { ctrl, shift }) {
    const cur = etat.current.selection
    let next
    if (shift && ancre.current?.num === num) {
      const ids = idsDe(num, etat.current.machines).map(cle)
      const a = ids.indexOf(cle(ancre.current.id)), b = ids.indexOf(cle(id))
      if (a >= 0 && b >= 0) {
        const plage = ids.slice(Math.min(a, b), Math.max(a, b) + 1)
        next = ctrl ? [...new Set([...cur, ...plage])] : plage
      }
    }
    if (!next) {
      if (ctrl) next = cliquer(cur, cle(id))
      else next = cur.length === 1 && cur[0] === cle(id) ? [] : [cle(id)]
      ancre.current = { num, id }
    }
    setSelection(next)
  }

  // Carte des machines et de leurs fiches pendant un glisser, mesurée une seule fois puis après
  // chaque changement de mise en page ou défilement. Interroger le navigateur à chaque mouvement
  // (elementFromPoint, offsetTop…) l'obligeait à recalculer les styles des fiches en mouvement.
  function releverZones() {
    if (!racine.current) return
    zones.current = [...racine.current.querySelectorAll('[data-machine]')].map(el => {
      const liste = el.querySelector('.pdt-liste')
      const r = el.getBoundingClientRect()
      return {
        el, num: Number(el.dataset.machine), r, liste, rListe: liste?.getBoundingClientRect(),
        deborde: !!liste && liste.scrollHeight > liste.clientHeight,
        grille: !!liste?.classList.contains('pdt-vue-photos'),
        // Les fiches d'un groupe ne sont mesurées que si la souris passe au-dessus de lui (et une seule fois
        // par mise en page) : mesurer les 1 000 fiches de tous les groupes à chaque image coûtait cher.
        get fiches() {
          return this._fiches ??= [...el.querySelectorAll('[data-fiche]')].map(f => ({
            id: f.dataset.fiche,
            cx: r.left + f.offsetLeft + f.offsetWidth / 2,
            cy: r.top + f.offsetTop - (liste?.scrollTop || 0) + f.offsetHeight / 2,
            h: f.offsetHeight, w: f.offsetWidth,
          }))
        },
      }
    })
  }
  const zoneSous = (x, y) => zones.current.find(z => x >= z.r.left && x <= z.r.right && y >= z.r.top && y <= z.r.bottom)

  function chercherCible(x, y) {
    const zone = zoneSous(x, y)
    if (!zone) return null
    const num = zone.num
    // Rien n'entre dans un groupe verrouillé : la machine visée le montre, sans ouvrir de place.
    const verrou = num !== LIBRE && motifVerrouMachine(categorieDe(num))
    if (verrou) return { num, index: -1, refus: verrou }
    if (num === LIBRE) {
      // Les non-affectés gardent l'ordre du registre : la place montrée est celle de la première fiche du bloc.
      const ordre = etat.current.pelerins.map(p => cle(p.dossier))
      const rang = Math.min(...prise.current.ids.map(id => ordre.indexOf(cle(id))))
      return { num, index: idsDe(LIBRE, etat.current.machines, prise.current.ids).filter(x => ordre.indexOf(cle(x)) < rang).length }
    }
    // Ordre de lecture : une fiche est « avant » le curseur si sa ligne est au-dessus,
    // ou si elle est sur la même ligne et à sa gauche (vue Photos en grille).
    // On lit la place de mise en page (offset), pas la position animée à l'écran :
    // sinon les fiches qui s'écartent faussent le calcul pendant leur glissement.
    // Les fiches tenues en main ne comptent pas : juste à la prise, le plan du groupe peut encore les contenir
    // (relevé avant que la page les retire de la liste). Une fiche prise par sa moitié droite (Photos) ou basse
    // (Liste) se comptait elle-même, et la place s'ouvrait un cran trop loin : l'autre fiche glissait pour rien,
    // puis revenait (« va-et-vient deux fois », mesuré le 2026-10-15).
    const tenues = new Set((prise.current?.ids || []).map(cle))
    const { grille } = zone
    const fiches = zone.fiches.filter(f => !tenues.has(f.id))
    let index = fiches.filter(f => {
      // En Liste et Détails, une fiche par ligne : seule la hauteur compte.
      if (!grille) return f.cy < y
      return f.cy < y - f.h / 2 || (Math.abs(f.cy - y) <= f.h / 2 && f.cx < x)
    }).length
    // Marge de 8 px autour de la frontière (comme le Shredder) : la place ne saute pas si l'on hésite.
    const precedente = cibleCourante.current
    if (!grille && precedente?.num === num && index !== precedente.index) {
      const bord = fiches[index > precedente.index ? index - 1 : index]
      if (bord && Math.abs(bord.cy - y) < HYSTERESE) index = precedente.index
    }
    return { num, index }
  }

  function viser(x, y) {
    const c = chercherCible(x, y)
    const v = cibleCourante.current
    if (c?.num === v?.num && c?.index === v?.index) { attente.current = null; return }
    if (c?.num !== v?.num) {
      // Changement de groupe : retenu seulement après DELAI_GROUPE ms au-dessus du même groupe. Si la
      // souris s'arrête, la minuterie le retient sans attendre un nouveau mouvement.
      const a = attente.current, maintenant = performance.now()
      if (!a || a.num !== c?.num) {
        attente.current = { num: c?.num, t: maintenant }
        clearTimeout(minuterieAttente.current)
        minuterieAttente.current = setTimeout(() => { const p = prise.current; if (p?.actif) viser(p.x, p.y) }, DELAI_GROUPE + 10)
        return
      }
      if (maintenant - a.t < DELAI_GROUPE) return
    }
    attente.current = null
    avant.current = releverPositions(racine.current)
    cibleCourante.current = c
    setCible(c)
  }

  // Au lâcher : chaque fiche de la pile tenue devient une copie qui continue son vol, avec l'élan du geste,
  // vers la place où elle va se poser (voir voler) ; les fiches d'un bloc partent en cascade (40 ms d'écart),
  // en glissant sur leur élan en attendant leur tour. Pendant ce temps, le dépôt s'enregistre en
  // arrière-plan ; l'effet d'arrivée ne corrige ensuite la destination que si la vraie place est ailleurs.
  function lancerVol(p, c) {
    const f = fantome.current
    if (!f || !racine.current || calme()) return null
    const pile = [...f.querySelectorAll('.pdt-pile-fiche')]
    if (!pile.length) return null
    const zone = zoneDeVol(racine.current)
    const places = placesPrevues(c, pile.length, p.h).map(q => versPage(zone, q.x, q.y))
    const depart = versPage(zone, p.gx, p.gy)
    const copies = pile.map((carte, k) => {
      // Copie légère : le cadre de la pile sans son contenu, plus cette seule fiche.
      const copie = f.cloneNode(false)
      copie.removeAttribute('aria-hidden')
      copie.classList.add('pdt-vol-libre')
      const seule = copie.appendChild(carte.cloneNode(true))
      seule.style.transform = ''; seule.style.visibility = ''
      // Sous la fiche tenue en main (z 65) : une copie qui finit d'atterrir ne passe jamais devant elle.
      copie.style.zIndex = String(50 + Math.min(pile.length - k, 9))
      zone.appendChild(copie)
      const d = Math.min(k, PILE) * 5
      voler(copie, { x: depart.x + d, y: depart.y + d, vx: p.gvx, vy: p.gvy, r: p.penche, s: p.souleve }, places[k], k * 0.04)
      return { id: carte.dataset.pile, copie }
    })
    f.style.visibility = 'hidden'
    return copies
  }

  // Coin haut-gauche de la place de chaque fiche : la place ouverte si elle est là (découpée en autant de
  // fiches), sinon une estimation d'après les fiches du groupe (lâcher rapide, avant que la place ait eu le
  // temps de s'ouvrir). En vue Photos, la grille n'est connue qu'à l'arrivée : toutes visent la première case.
  function placesPrevues(c, n, hauteur) {
    const trou = racine.current.querySelector(`[data-machine="${c.num}"] .pdt-trou`)
    const zone = zones.current.find(z => z.num === c.num)
    let base
    let pas = zone?.grille ? 0 : hauteur + 5
    if (trou) {
      const r = trou.getBoundingClientRect()
      base = { x: r.left, y: r.top }
      if (!zone?.grille) pas = (r.height + 5) / n
    } else {
      const fiches = zone?.fiches || []
      const index = c.index ?? fiches.length
      const f = fiches[Math.min(index, fiches.length - 1)]
      const rz = zone?.rListe || zone?.r
      base = f ? { x: f.cx - f.w / 2, y: f.cy - f.h / 2 + (index >= fiches.length && !zone.grille ? f.h + 5 : 0) }
        : rz ? { x: rz.left + 9, y: rz.top + 9 } : { x: 0, y: 0 }
    }
    return Array.from({ length: n }, (_, k) => ({ x: base.x, y: base.y + k * pas }))
  }

  // Arrête net tout atterrissage en cours (vols libres, ancienne animation de pose, grande place) et remet
  // chaque fiche en attente à sa place, visible.
  function terminerAtterrissages() {
    const r = racine.current
    if (!r) return
    r.querySelectorAll('.pdt-vol-libre').forEach(c => { c.getAnimations().forEach(a => a.cancel()); c.remove() })
    r.querySelectorAll('.pdt-couche, .pdt-grande-place').forEach(c => c.remove())
    r.querySelectorAll('[data-fiche][data-attend]').forEach(revelerFiche)
  }

  function placerFantome() {
    const p = prise.current
    if (!p || !fantome.current) return
    fantome.current.style.transform = `translate(${p.gx}px, ${p.gy}px) rotate(${p.penche}deg) scale(${p.souleve})`
  }

  // À chaque image : la fiche tenue rejoint la souris par un ressort, penche selon sa vitesse
  // et se soulève ; la liste survolée défile seule près de son bord.
  function animer(maintenant) {
    const p = prise.current
    if (!p?.actif) return
    const dt = borner((maintenant - (p.t || maintenant)) / 1000, 0.001, 0.05)
    p.t = maintenant
    const cx = p.x - p.decalageX, cy = p.y - p.decalageY
    if (calme()) { p.gx = cx; p.gy = cy; p.gvx = p.gvy = 0 }
    else {
      ;[p.gx, p.gvx] = ressort(p.gx, p.gvx, cx, dt, SUIVI)
      ;[p.gy, p.gvy] = ressort(p.gy, p.gvy, cy, dt, SUIVI)
      p.penche = amortir(p.penche, borner(p.gvx * 0.012, -PENCHE_MAX, PENCHE_MAX), dt, 0.09)
      p.souleve = amortir(p.souleve, SOULEVE, dt, 0.12)
    }
    placerFantome()
    const zone = zoneSous(p.x, p.y)
    if (zone?.deborde) {
      const r = zone.rListe
      const pas = p.y < r.top + BORD ? -10 : p.y > r.bottom - BORD ? 10 : 0
      if (pas) { zone.liste.scrollTop += pas; releverZones(); viser(p.x, p.y) }
    }
    p.boucle = requestAnimationFrame(animer)
  }

  // « depuisTableau » : prise par une ligne du tableau (sa photo, son numéro ou son nom). La fiche tenue prend alors la
  // taille d'une fiche Liste, accrochée à la souris par son bord gauche.
  function commencer(e, id, depuis, depuisTableau = false) {
    if (e.button !== 0 || prise.current || depotEnCours.current) return
    e.preventDefault()
    if (depuis == null) depuis = groupeDe(id)
    // Depuis le tableau : la carte prend la taille exacte d'une fiche de groupe en vue Liste et se tient par son milieu
    // (elle faisait 320 × 46 px, tenue près du bord gauche, et rétrécissait d'un coup en se posant : 2026-10-25).
    const r = depuisTableau ? (() => { const { width, height } = tailleFicheListe(racine.current); return { left: e.clientX - width / 2, top: e.clientY - height / 2, width, height } })()
      : e.currentTarget.getBoundingClientRect()
    prise.current = {
      id, depuis, depuisTableau, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY,
      decalageX: e.clientX - r.left, decalageY: e.clientY - r.top, w: r.width, h: r.height,
      // La coche se comporte comme Ctrl+clic : elle ajoute ou retire la fiche.
      // Un clic n'importe où sur la fiche coche ou décoche, comme la case (demande du 2026-10-14) ; Maj ajoute la plage.
      touches: { ctrl: true, shift: e.shiftKey },
      actif: false,
      // La fiche tenue part exactement de sa place, immobile, à plat.
      gx: r.left, gy: r.top, gvx: 0, gvy: 0, penche: 0, souleve: 1, t: 0,
    }
    window.addEventListener('pointermove', bouger)
    window.addEventListener('pointerup', lacher)
    window.addEventListener('pointercancel', abandonner)
    window.addEventListener('keydown', echapper)
    // Alt+Tab ou clic dans une autre fenêtre pendant le geste : la fiche revient à sa place.
    window.addEventListener('blur', abandonner)
  }

  function bouger(e) {
    const p = prise.current
    if (!p) return
    // Bouton relâché hors de la fenêtre (le relâchement n'est alors jamais reçu) : on termine le geste.
    if (!(e.buttons & 1)) { lacher(); return }
    p.x = e.clientX; p.y = e.clientY
    if (!p.actif) {
      if (Math.hypot(p.x - p.x0, p.y - p.y0) < SEUIL) return
      p.actif = true
      document.body.classList.add('pdt-glisse-page')
      // Un dépôt précédent finit peut-être encore d'atterrir : ses copies sont retirées sur-le-champ et leurs
      // fiches remises à leur place. Sans cela, en reprenant une fiche juste après l'avoir posée, sa copie
      // restait à la place d'arrivée pendant le nouveau glisser : deux fiches à l'écran (signalé le 2026-10-15).
      terminerAtterrissages()
      // Un texte surligné avant le geste (double-clic, etc.) ne doit pas rester sélectionné pendant le glisser.
      // Jamais le curseur d'un champ encore actif (nom d'un groupe juste renommé) : l'effacer faisait défiler
      // la zone des groupes jusqu'à ce champ, et le glisser partait d'un endroit qui n'était plus sous la souris.
      const surligne = window.getSelection?.()
      if (surligne && !surligne.isCollapsed && !document.activeElement?.matches?.('input, textarea')) surligne.removeAllRanges()
      // Glisser une fiche sélectionnée emporte toute la sélection, tous groupes confondus :
      // dans l'ordre des machines, puis dans l'ordre de chaque groupe.
      // Depuis le tableau, c'est la sélection du tableau (cases cochées) qui part en bloc.
      const sel = p.depuisTableau ? (tableau.current?.selection() || []).map(cle) : etat.current.selection
      const ordre = [LIBRE, ...etat.current.machines.map(m => m.num)]
      p.ids = sel.includes(cle(p.id)) && sel.length > 1
        ? ordre.flatMap(num => idsDe(num, etat.current.machines).filter(x => sel.includes(cle(x))))
        : [p.id]
      // Chaque fiche garde son groupe et son numéro de départ.
      p.sources = Object.fromEntries(p.ids.map(id => [cle(id), groupeDe(id)]))
      // Rien ne sort d'un groupe verrouillé (visa en traitement ou délivré) : le geste est refusé.
      const verrou = [...new Set(Object.values(p.sources))].map(num => motifVerrouMachine(categorieDe(num))).find(Boolean)
      if (verrou) { nettoyer(); refuser(verrou); return }
      p.rangs = Object.fromEntries(p.ids.map(id => [cle(id), idsDe(p.sources[cle(id)], etat.current.machines).findIndex(x => cle(x) === cle(id)) + 1]))
      p.vue = p.depuisTableau ? 'liste' : etat.current.vues[p.depuis] ?? 'liste'
      p.selectionAvant = etat.current.selection
      // La sélection en cours n'est plus remplacée ici : un clic où la main bouge un peu commence un glisser, et
      // le bloc sélectionné disparaissait aussitôt (signalé le 2026-10-15). Elle ne change qu'au dépôt d'un vrai
      // déplacement (les fiches déposées deviennent la sélection) ou, pour un glisser sans effet, comme un clic.
      avant.current = releverPositions(racine.current)
      // La place s'ouvre tout de suite là où était la fiche, dans le même rendu : sans cela, la fiche du
      // dessous montait, redescendait quand la place s'ouvrait (délai de survol), puis remontait en quittant
      // le groupe (« tic-tac » signalé le 2026-10-15).
      if (!p.depuisTableau) {
        const partis = new Set(p.ids.map(cle))
        const liste = idsDe(p.depuis, etat.current.machines)
        const index = liste.slice(0, liste.findIndex(x => cle(x) === cle(p.id))).filter(x => !partis.has(cle(x))).length
        cibleCourante.current = { num: p.depuis, index, origine: true }
        p.indexOrigine = index
        setCible(cibleCourante.current)
      }
      setGlisse({ ids: p.ids.map(cle), principal: cle(p.id), w: p.w, h: p.h, teinte: couleurDe(p.depuis), vue: p.vue, depuis: p.depuis, sources: p.sources, rangs: p.rangs })
      p.boucle = requestAnimationFrame(animer)
      releverZones()
      // Un défilement déplace les machines à l'écran : la carte est remesurée.
      p.surDefilement = () => releverZones()
      window.addEventListener('scroll', p.surDefilement, true)
    }
    viser(p.x, p.y)
  }

  function nettoyer() {
    document.body.classList.remove('pdt-glisse-page')
    window.removeEventListener('pointermove', bouger)
    window.removeEventListener('pointerup', lacher)
    window.removeEventListener('pointercancel', abandonner)
    window.removeEventListener('keydown', echapper)
    window.removeEventListener('blur', abandonner)
    cancelAnimationFrame(prise.current?.boucle)
    if (prise.current?.surDefilement) window.removeEventListener('scroll', prise.current.surDefilement, true)
    const p = prise.current
    prise.current = null
    cibleCourante.current = null
    attente.current = null
    clearTimeout(minuterieAttente.current)
    return p
  }

  function echapper(e) { if (e.key === 'Escape') abandonner() }

  // Pour chaque fiche du bloc, prise dans la pile tenue en main : son rectangle et son modèle
  // (pour les lanières), sa place exacte et l'élan de la pile (pour le vol jusqu'à sa place).
  // « avecModeles » : les modèles ne servent qu'aux lanières (changement de vue) ; les copier pour rien
  // alourdissait l'image du lâcher sur un petit PC.
  function releverPile(p, avecModeles = true) {
    const cartes = fantome.current ? [...fantome.current.querySelectorAll('.pdt-pile-fiche')] : []
    const de = {}, modeles = {}, depart = {}
    cartes.forEach((c, k) => {
      const id = c.dataset.pile
      de[id] = c.getBoundingClientRect()
      if (avecModeles) {
        const m = c.cloneNode(true)
        m.removeAttribute('style'); m.removeAttribute('data-pile')
        m.classList.remove('pdt-pile-fiche')
        modeles[id] = m
      }
      const decale = Math.min(k, PILE) * 5
      depart[id] = { x: p.gx + decale, y: p.gy + decale }
    })
    return { de, modeles, depart, elan: { vx: p.gvx, vy: p.gvy, penche: p.penche, souleve: p.souleve } }
  }

  function abandonner() {
    const p = nettoyer()
    if (!p?.actif) return
    const { de, depart, elan } = releverPile(p)
    avant.current = releverPositions(racine.current)
    arrivee.current = { ids: p.ids.map(cle), de, depart, elan, transfert: false, rangs: p.rangs }
    setGlisse(null); setCible(null)
  }

  function lacher() {
    const c = attente.current && prise.current?.actif ? chercherCible(prise.current.x, prise.current.y) : cibleCourante.current
    const visee = cibleCourante.current
    const p = nettoyer()
    if (!p) return
    // Un simple clic sur une ligne du tableau ne sélectionne rien dans les groupes.
    if (!p.actif) { if (!p.depuisTableau) selectionner(p.id, p.depuis, p.touches); return }
    const { de, modeles, depart, elan } = releverPile(p, !!c && !c.refus && (etat.current.vues[c.num] ?? 'liste') !== p.vue)
    avant.current = releverPositions(racine.current)
    const ids = p.ids
    // Dépôt réussi (ni clic, ni refus, ni lâcher hors des groupes) : la fiche continue son vol tout de suite.
    // Glisser sans effet : une seule fiche lâchée dans son propre groupe, à sa propre place. Rien ne bouge ; c'est
    // traité comme un clic (voir plus bas), pour ne pas perdre la sélection en cours.
    const surPlace = !p.depuisTableau && ids.length === 1 && !!c && !c.refus && c.num === p.sources[cle(p.id)] && c.index === p.indexOrigine
    const commeClic = !p.depuisTableau && (Math.hypot(p.x - p.x0, p.y - p.y0) < SEUIL_CLIC || surPlace)
    const depotReussi = !commeClic && (p.depuisTableau || Math.hypot(p.x - p.x0, p.y - p.y0) >= SEUIL_CLIC) && c && !c.refus
    const vol = depotReussi ? lancerVol(p, c) : null
    // Lâcher rapide, avant que la place ait eu le temps de s'ouvrir dans le groupe d'arrivée : la place
    // ouverte dans le groupe survolé juste avant restait affichée derrière la fiche jusqu'à l'enregistrement
    // du dépôt (« résidu » signalé le 2026-10-15). Elle disparaît dès l'image du lâcher (une animation de
    // fondu ne démarrait qu'après plusieurs images, le temps que le programme se libère).
    if (vol?.length && visee && visee.num !== c.num) {
      const ancienne = racine.current?.querySelector(`[data-machine="${visee.num}"] .pdt-trou`)
      if (ancienne) ancienne.style.opacity = '0'
    }
    // Une seule fiche : la place ouverte dans le groupe d'arrivée s'efface elle aussi dès le lâcher. Elle
    // restait dessinée 60 à 80 ms (le temps d'enregistrer le dépôt), puis s'éteignait d'un coup pendant que
    // la fiche était encore en route : un carré en pointillés seul à l'écran (mesuré sur 18 dépôts sur 20 le
    // 2026-10-15). Un bloc garde la sienne : sa grande place prend le relais sans coupure.
    if (vol?.length === 1) racine.current?.querySelectorAll('.pdt-trou').forEach(t => { t.style.opacity = '0' })
    if (!depotReussi) { setGlisse(null); setCible(null) }
    // Glissement de quelques pixels seulement (main qui bouge pendant le clic, surtout près du bord d'une
    // fiche) : c'est un clic. La fiche revient à sa place, la sélection d'avant est rendue, et la fiche
    // est ajoutée ou retirée comme pour un clic — sans quoi la sélection se réduisait à cette seule fiche.
    if (commeClic) {
      arrivee.current = { ids: ids.map(cle), de, depart, elan, transfert: false, rangs: p.rangs, clic: true }
      const avantGeste = p.selectionAvant || [], k = cle(p.id)
      setSelection(cliquer(avantGeste, k))
      ancre.current = { num: p.depuis, id: p.id }
      return
    }
    // Lâché hors des groupes, ou sur un groupe verrouillé : la fiche revient à sa place.
    if (c?.refus) refuser(c.refus)
    if (!c || c.refus) { arrivee.current = { ids: ids.map(cle), de, depart, elan, transfert: false, rangs: p.rangs }; return }
    if (p.depuisTableau) tableau.current?.deselectionner()

    const actuelles = etat.current.machines
    const sourceDe = id => p.sources[cle(id)]
    const partants = ids.filter(id => sourceDe(id) !== c.num)
    let suivantes = actuelles
    if (c.num === LIBRE) {
      if (partants.length) {
        const cles = new Set(partants.map(cle))
        suivantes = actuelles.map(m => ({ ...m, ids: m.ids.filter(x => !cles.has(cle(x))) }))
      }
    } else {
      const liste = idsDe(c.num, actuelles, ids)
      const repere = liste.length ? liste[Math.min(c.index, liste.length - 1)] : null
      const apres = liste.length > 0 && c.index >= liste.length
      suivantes = deplacerMembres(actuelles, c.num, ids, repere, apres)
      if (partants.length) {
        // La machine retient d'où vient chaque fiche, pour la rendre à sa place au démontage.
        const origines = Object.fromEntries(partants.map(id => {
          const src = sourceDe(id)
          const place = src === LIBRE ? null : actuelles.find(m => m.num === src)?.ids.findIndex(x => cle(x) === cle(id)) ?? null
          return [cle(id), { num: src, place }]
        }))
        suivantes = suivantes.map(m => m.num === c.num ? { ...m, origines: { ...m.origines, ...origines } } : m)
      }
    }
    arrivee.current = {
      ids: ids.map(cle), de, modeles, depart, elan, vers: c.num, rangs: p.rangs, vue: p.vue, vueArrivee: etat.current.vues[c.num] ?? 'liste',
      transfert: ids.map(id => sourceDe(id) !== c.num), vols: vol,
    }
    // L'enregistrement du dépôt (données, groupes, panneau, tableau) se fait en arrière-plan, découpé par
    // React entre deux images : la fiche continue de voler pendant ce temps. Il attend que le vol soit
    // vraiment parti sur la carte graphique : lancé tout de suite, il retenait le départ du vol (mesuré le
    // 2026-10-14 : fiche figée 100 ms au lâcher, 300 ms sur un PC quatre fois plus lent).
    depotEnCours.current = true
    const texte = partants.length
      ? (partants.length > 1
        ? `${partants.length} pèlerins · ${[...new Set(partants.map(sourceDe))].map(nomMachine).join(', ')} → ${nomMachine(c.num)}`
        : `${nomPelerin(partants[0])} · ${[...new Set(partants.map(sourceDe))].map(nomMachine).join(', ')} → ${nomMachine(c.num)}`)
      : null
    let fait = false
    const enregistrer = () => {
      if (fait) return
      fait = true
      startTransition(() => {
        setGlisse(null); setCible(null)
        if (suivantes !== actuelles) setMachines(suivantes)
        // Les fiches déposées restent sélectionnées, comme dans le fichier clients.
        setSelection(ids.map(cle))
        deposees.current = new Set(ids.map(cle))
        if (texte) {
          proposerAnnulation(texte, actuelles)
          setProvenance(v => ({ ...v, ...Object.fromEntries(partants.map(id => [cle(id), sourceDe(id)])) }))
          noter(texte)
        }
      })
    }
    if (vol?.length) {
      vols.get(vol[0].copie).a.ready.then(() => setTimeout(enregistrer, 0), enregistrer)
      setTimeout(enregistrer, 250) // filet : le dépôt s'enregistre même si le vol ne démarre jamais
    } else enregistrer()
  }

  useEffect(() => () => { if (prise.current) nettoyer() }, [])

  // Déplacer un groupe (demandes du 2026-10-25) : on le prend par son en-tête dans l'atelier, ou par sa pastille dans le
  // panneau des groupes, et on le pose où l'on veut parmi les autres. Pendant le geste, seule une forme légère suit
  // la souris (depuis l'atelier : l'en-tête et le contour du groupe ; depuis le panneau : son étiquette) ; le groupe
  // lui-même devient la place visée, en pointillé, et les autres glissent pour la lui ouvrir — de simples
  // translations : aucune fiche n'est redessinée. Lâché dans l'atelier, il y prend cette place (et s'affiche s'il était
  // masqué) ; lâché sur « المخفية » du panneau, il est masqué ; lâché ailleurs ou Échap, rien ne change. Le nouvel
  // ordre devient l'ordre des groupes (branché sur le registre, il y est écrit). « Hors groupe Visa » et « sans
  // groupe Nusuk » restent en tête : on peut seulement les afficher ou les masquer.
  const placesGroupes = useRef(null)
  const [apercu, setApercu] = useState(null)
  const gesteEnAttente = useRef(null)
  // Attend un vrai mouvement (6 px) avant de commencer : un simple clic garde son effet (saisie du nom, affichage).
  function attendreMouvement(e, commencerGeste) {
    const x0 = e.clientX, y0 = e.clientY
    const bouge = ev => {
      if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return
      arreter()
      // Le clic qui suit le lâcher n'est pas un clic (sinon il afficherait ou masquerait le groupe du panneau).
      const avaler = c => { c.stopPropagation(); c.preventDefault() }
      window.addEventListener('click', avaler, { capture: true, once: true })
      setTimeout(() => window.removeEventListener('click', avaler, { capture: true }), 600)
      commencerGeste({ x: ev.clientX, y: ev.clientY }, { x: x0, y: y0 })
    }
    const arreter = () => { window.removeEventListener('pointermove', bouge); window.removeEventListener('pointerup', arreter); window.removeEventListener('pointercancel', arreter) }
    window.addEventListener('pointermove', bouge); window.addEventListener('pointerup', arreter); window.addEventListener('pointercancel', arreter)
  }
  function tirerGroupe(e, num) {
    if (e.button !== 0 || prise.current || e.target.closest('button, select, textarea, label')) return
    const el = e.currentTarget.closest('[data-machine]')
    if (!el) return
    const champ = e.target.closest('input')
    if (!champ) e.preventDefault()
    attendreMouvement(e, (souris, depart) => {
      if (champ) { champ.blur(); window.getSelection?.()?.removeAllRanges() }
      const r = el.getBoundingClientRect()
      const silhouette = document.createElement('div')
      silhouette.className = 'pdt-silhouette'
      silhouette.style.cssText = `width:${r.width}px;height:${Math.min(r.height, 220)}px;--t:${getComputedStyle(el).getPropertyValue('--t')}`
      const tete = el.querySelector('.pdt-plaque')?.cloneNode(true)
      if (tete) {
        const nom = el.querySelector('.pdt-plaque input')?.value
        tete.querySelectorAll('input').forEach(i => { const h = document.createElement('h2'); h.textContent = nom || ''; i.replaceWith(h) })
        tete.querySelectorAll('button').forEach(b => b.remove())
        silhouette.appendChild(tete)
      }
      gesteGroupe({ num, el, souris, forme: silhouette, decalage: { x: depart.x - r.left, y: depart.y - r.top } })
    })
  }
  // Depuis le panneau des groupes : son étiquette (icône, nom, effectif) suit la souris. Un groupe masqué est d'abord
  // posé dans l'atelier comme place visée (rendu suivant), à sa place dans l'ordre.
  function tirerDepuisPanneau(e, num) {
    // Le nom est un bouton au niveau minimal (un clic affiche ou masque) : on peut aussi le tirer ; pas les autres boutons.
    if (e.button !== 0 || prise.current || e.target.closest('button:not(.d5-nom-bouton)')) return
    const machine = etat.current.machines.find(m => m.num === num)
    if (!machine) return
    const pastille = e.currentTarget
    attendreMouvement(e, souris => {
      const etiquette = document.createElement('div')
      etiquette.className = 'pdt-etiquette-groupe'
      etiquette.style.setProperty('--t', pastille.style.getPropertyValue('--teinte') || '#888')
      const icone = pastille.querySelector('.d5-icone')
      if (icone) { const i = document.createElement('img'); i.src = icone.src; i.alt = ''; etiquette.appendChild(i) }
      const nom = document.createElement('span'); nom.textContent = pastille.querySelector('.d5-nom')?.textContent || machine.nomPerso; etiquette.appendChild(nom)
      const nombre = document.createElement('b'); nombre.textContent = String(machine.ids.length); etiquette.appendChild(nombre)
      const fixe = machineFixe(machine)
      const lancer = el => gesteGroupe({ num, el, souris, forme: etiquette, decalage: { x: 20, y: 16 }, cache: !!machine.ferme, fixe })
      if (!machine.ferme) return lancer(racine.current?.querySelector(`.pdt-atelier > [data-machine="${num}"]`))
      gesteEnAttente.current = { lancer, num }
      setApercu(num)
    })
  }
  // Groupe masqué tiré du panneau : il vient d'être rendu dans l'atelier, le geste peut commencer.
  useLayoutEffect(() => {
    const g = gesteEnAttente.current
    if (!g || apercu !== g.num) return
    gesteEnAttente.current = null
    g.lancer(racine.current?.querySelector(`.pdt-atelier > [data-machine="${g.num}"]`))
  }, [apercu])

  // Le geste commun. « el » : le groupe dans l'atelier ; « forme » : ce qui suit la souris ; « cache » : groupe masqué
  // (rendu pour le geste seulement) ; « fixe » : groupe qui ne change pas de place (seulement affiché ou masqué).
  function gesteGroupe({ num, el, souris, forme, decalage, cache = false, fixe = false }) {
    const atelier = racine.current?.querySelector('.pdt-atelier'), defileur = atelier?.parentElement
    if (!atelier || !defileur || !el) { if (cache) setApercu(null); return }
    // Positions dans le contenu de l'atelier (il suit le défilement de sa zone) : elles restent justes pendant un
    // défilement.
    const dansAtelier = (x, y) => { const a = atelier.getBoundingClientRect(); return { x: x - a.left, y: y - a.top } }
    const places = fixe ? [] : [...atelier.querySelectorAll(':scope > [data-mobile]')].map(g => {
      const r = g.getBoundingClientRect(), p = dansAtelier(r.left, r.top)
      return { num: Number(g.dataset.machine), el: g, x: p.x, y: p.y, w: r.width, h: r.height }
    })
    const moi = places.find(s => s.num === num) || null
    let index = moi ? places.indexOf(moi) : -1, pos = souris, defile = 0, survol = null
    const surAtelier = () => { const a = defileur.getBoundingClientRect(); return pos.x >= a.left && pos.x <= a.right && pos.y >= a.top && pos.y <= a.bottom }
    const casePanneau = () => document.elementFromPoint(pos.x, pos.y)?.closest?.('.d5-case-tous, .d5-pile, .d5-case-epingles, .d5-liste-epinglee') || null
    const disposer = () => {
      if (!moi || !surAtelier()) return
      // Place visée : celle des places d'origine la plus proche de la souris ; les autres groupes gardent leur ordre.
      const p = dansAtelier(pos.x, pos.y)
      const distance = s => Math.hypot(Math.max(s.x - p.x, 0, p.x - s.x - s.w), Math.max(s.y - p.y, 0, p.y - s.y - s.h))
      let k = 0
      places.forEach((s, i) => { if (distance(s) < distance(places[k])) k = i })
      if (k === index) return
      index = k
      const ordre = places.filter(s => s !== moi)
      ordre.splice(index, 0, moi)
      ordre.forEach((s, i) => { s.el.style.transform = `translate(${places[i].x - s.x}px, ${places[i].y - s.y}px)` })
    }
    const suivre = () => {
      forme.style.transform = `translate(${pos.x - decalage.x}px, ${pos.y - decalage.y}px)`
      disposer()
      // Case du panneau survolée : elle s'éclaire (« المخفية » masque le groupe, « المعروضة » l'affiche).
      const c = casePanneau()
      if (c !== survol) { survol?.removeAttribute('data-cible-groupe'); survol = c; c?.setAttribute('data-cible-groupe', '') }
    }
    racine.current.appendChild(forme)
    for (const s of places) s.el.style.transition = 'transform .24s cubic-bezier(.2,.8,.2,1)'
    el.classList.add('pdt-groupe-place')
    suivre()
    // L'atelier défile quand la souris approche de son bord haut ou bas.
    const boucle = () => {
      const a = defileur.getBoundingClientRect()
      const sens = !surAtelier() ? 0 : pos.y < a.top + 60 ? -1 : pos.y > a.bottom - 60 ? 1 : 0
      if (sens) { defileur.scrollTop += sens * 14; disposer() }
      defile = requestAnimationFrame(boucle)
    }
    defile = requestAnimationFrame(boucle)
    const remettre = () => {
      for (const s of places) { s.el.style.transform = '' }
      el.classList.remove('pdt-groupe-place')
      forme.remove()
      if (cache) setApercu(null)
    }
    const bouge = ev => { pos = { x: ev.clientX, y: ev.clientY }; suivre() }
    const echap = ev => { if (ev.key === 'Escape') { ev.preventDefault(); terminer(true) } }
    const terminer = annule => {
      window.removeEventListener('pointermove', bouge); window.removeEventListener('pointerup', lacher); window.removeEventListener('pointercancel', lacher); window.removeEventListener('keydown', echap, true)
      cancelAnimationFrame(defile)
      survol?.removeAttribute('data-cible-groupe')
      const c = annule ? null : casePanneau()
      const versMasques = c?.matches('.d5-case-tous, .d5-pile')
      const versAffiches = c && !versMasques
      if (annule || versMasques || (!surAtelier() && !versAffiches)) {
        remettre()
        if (versMasques && !cache) basculerVisibilite(num)
        return
      }
      // Lâché dans l'atelier (ou sur « المعروضة » : à sa place actuelle) : nouvel ordre, et affiché s'il était masqué.
      const ordre = places.filter(s => s !== moi)
      if (moi) ordre.splice(versAffiches ? places.indexOf(moi) : index, 0, moi)
      const nums = ordre.map(s => s.num)
      placesGroupes.current = { t: performance.now(), silhouette: forme, tenu: num, nums, apparition: cache ? num : null,
        places: new Map(places.map(s => { const r = s.el.getBoundingClientRect(); return [s.num, [r.left, r.top]] })) }
      const rang = new Map(nums.map((n, k) => [n, k]))
      const change = nums.some((n, k) => n !== places[k].num)
      if (!change && !cache) { poserGroupes(); return }
      setMachines(liste => {
        const file = liste.filter(m => rang.has(m.num)).sort((a, b) => rang.get(a.num) - rang.get(b.num))
        return liste.map(m => (rang.has(m.num) ? file.shift() : m)).map(m => (m.num === num && m.ferme ? { ...m, ferme: false } : m))
      })
      if (cache) setApercu(null)
    }
    const lacher = () => terminer(false)
    window.addEventListener('pointermove', bouge); window.addEventListener('pointerup', lacher); window.addEventListener('pointercancel', lacher); window.addEventListener('keydown', echap, true)
  }
  // Après le lâcher : les groupes quittent leurs translations du geste et glissent de la place où on les voyait à leur
  // vraie place ; la forme qui suivait la souris se fond dans le groupe posé. Attend le rendu où l'ordre a vraiment
  // changé (au plus 2 s).
  function poserGroupes() {
    const releve = placesGroupes.current
    if (!releve || !racine.current) return
    const groupes = [...racine.current.querySelectorAll('.pdt-atelier > [data-machine]')]
    const ordre = groupes.map(g => Number(g.dataset.machine)).filter(n => releve.nums.includes(n))
    if (ordre.join() !== releve.nums.join() && performance.now() - releve.t < 2000) return
    placesGroupes.current = null
    for (const g of groupes) { g.style.transition = 'none'; g.style.transform = ''; g.classList.remove('pdt-groupe-place') }
    const depart = releve.silhouette?.getBoundingClientRect()
    for (const g of groupes) {
      const num = Number(g.dataset.machine), r = g.getBoundingClientRect()
      const de = num === releve.tenu && depart ? [depart.left, depart.top] : releve.places.get(num)
      g.style.transition = ''
      if (!de) continue
      const dx = de[0] - r.left, dy = de[1] - r.top
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) g.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' })
    }
    releve.silhouette?.remove()
    if (releve.apparition != null) setAllumee({ num: releve.apparition, t: Date.now() })
  }
  useLayoutEffect(poserGroupes)

  // Afficher ou masquer un groupe (clic dans le panneau, demande du 2026-10-25) : qu'on le voie. Il disparaît en
  // s'effaçant puis les groupes suivants reprennent sa place en glissant ; il apparaît en fondu, à sa place, les
  // suivants s'écartant en glissant, son contour s'allume, et l'atelier défile jusqu'à lui s'il est hors de vue.
  const visibilite = useRef(null)
  const releverAtelier = () => new Map([...(racine.current?.querySelectorAll('.pdt-atelier > [data-machine]') || [])].map(g => { const r = g.getBoundingClientRect(); return [Number(g.dataset.machine), [r.left, r.top]] }))
  function basculerVisibilite(num) {
    const m = etat.current.machines.find(x => x.num === num)
    if (!m) return
    const basculer = () => setMachines(liste => liste.map(x => (x.num === num ? { ...x, ferme: !x.ferme } : x)))
    const nb = racine.current?.querySelectorAll('.pdt-atelier > [data-machine]').length || 0
    const calme = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (m.ferme) {
      visibilite.current = calme ? null : { positions: releverAtelier(), apparait: num, attendu: nb + 1 }
      return basculer()
    }
    const el = racine.current?.querySelector(`.pdt-atelier > [data-machine="${num}"]`)
    const masquer = () => { visibilite.current = calme ? null : { positions: releverAtelier(), apparait: null, attendu: nb - 1 }; basculer() }
    if (!el || calme) return masquer()
    el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.96)' }], { duration: 170, easing: 'ease-in', fill: 'forwards' }).finished.then(masquer, masquer)
  }
  useLayoutEffect(() => {
    const v = visibilite.current
    const atelier = racine.current?.querySelector('.pdt-atelier'), defileur = atelier?.parentElement
    if (!v || !atelier || !defileur) return
    const groupes = [...atelier.querySelectorAll(':scope > [data-machine]')]
    if (groupes.length !== v.attendu) return
    visibilite.current = null
    for (const g of groupes) {
      const num = Number(g.dataset.machine)
      if (num === v.apparait) {
        g.animate([{ opacity: 0, transform: 'scale(.96)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' })
        const a = defileur.getBoundingClientRect(), r = g.getBoundingClientRect()
        if (r.top < a.top || r.top > a.bottom - 80) defileur.scrollTo({ top: defileur.scrollTop + r.top - a.top - 16, behavior: 'smooth' })
        continue
      }
      const de = v.positions.get(num)
      if (!de) continue
      const r = g.getBoundingClientRect(), dx = de[0] - r.left, dy = de[1] - r.top
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) g.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' })
    }
    if (v.apparait != null) setAllumee({ num: v.apparait, t: Date.now() })
  })

  // Chaque transfert ou démontage garde l'état d'avant, rattrapable pendant 5 s.
  function proposerAnnulation(texte, machinesAvant) {
    setAnnulable({ id: Date.now(), texte, machines: machinesAvant, provenance: etat.current.provenance })
  }

  function annuler() {
    const a = etat.current.annulable
    // Pendant le vol d'un dépôt, pas encore enregistré : Ctrl+Z attend qu'il le soit.
    if (!a || depotEnCours.current) return
    avant.current = releverPositions(racine.current)
    setMachines(a.machines)
    setProvenance(a.provenance)
    setSelection([])
    setAnnulable(null)
    noter(`Annulé : ${a.texte}`)
  }

  // Démonter demande un appui maintenu : relâcher avant la fin ne fait rien.
  function commencerMaintien(num) {
    clearTimeout(minuterieMaintien.current)
    setMaintien(num)
    minuterieMaintien.current = setTimeout(() => { setMaintien(null); demonter(num) }, MAINTIEN)
  }

  function arreterMaintien() {
    clearTimeout(minuterieMaintien.current)
    setMaintien(null)
  }

  // Changer de vue fait glisser les fiches vers leur nouvelle place.
  function choisirVue(num, vue) {
    avant.current = releverPositions(racine.current)
    setVues(v => ({ ...v, [num]: vue }))
  }

  function choisirVueToutes(vue) {
    avant.current = releverPositions(racine.current)
    setVues(Object.fromEntries([LIBRE, ...etat.current.machines.map(m => m.num)].map(num => [num, vue])))
  }

  // Une nouvelle machine est un groupe Visa temporaire, « à créer » dans Nusuk, nommé comme dans
  // le fichier clients (« Nusuk temporaire N »).
  function ajouterMachine() {
    setMachines(liste => {
      // Branché sur le registre : numéro libre et nom parmi tous ses groupes, brouillon comme les siens.
      const num = connecte ? connecte.prochainNum() : Math.max(0, ...liste.map(m => m.num)) + 1
      const nom = connecte ? connecte.prochainNom() : prochainNomVisa(liste.map(m => m.nomPerso))
      return [...liste, nouvelleMachine(num, nom, connecte ? connecte.nouveauBrouillon(num) : nouveauBrouillon(num))]
    })
  }

  function renommer(num, saisie, definitif) {
    setMachines(liste => liste.map(m => {
      if (m.num !== num) return m
      if (!definitif) return { ...m, nomPerso: saisie }
      return { ...m, nomPerso: nomGroupeUnique(saisie || `Groupe ${num}`, liste.filter(o => o.num !== num).map(o => o.nomPerso)) }
    }))
  }

  function demonter(num) {
    const cibleMachine = etat.current.machines.find(m => m.num === num)
    if (!cibleMachine || demontage != null) return
    setDemontage(num)
    setTimeout(() => {
      const avantDemontage = etat.current.machines
      const reste = avantDemontage.filter(m => m.num !== num).map(m => ({ ...m, ids: [...m.ids] }))
      const bilan = new Map()
      // Rendre chaque fiche à sa machine d'origine, à sa place, dans l'ordre initial.
      const ordre = [...cibleMachine.ids].sort((a, b) => (cibleMachine.origines[cle(a)]?.place ?? 0) - (cibleMachine.origines[cle(b)]?.place ?? 0))
      for (const id of ordre) {
        const origine = cibleMachine.origines[cle(id)]
        const retour = origine && reste.find(m => m.num === origine.num)
        if (retour && !reste.some(m => m.ids.some(x => cle(x) === cle(id)))) retour.ids.splice(Math.min(origine.place ?? retour.ids.length, retour.ids.length), 0, id)
        const nom = retour ? retour.nomPerso : 'Hors groupe Visa'
        bilan.set(nom, (bilan.get(nom) || 0) + 1)
      }
      const texte = cibleMachine.ids.length
        ? `${cibleMachine.nomPerso} démonté · retour : ${[...bilan].map(([n, c]) => `${n} (${c})`).join(', ')}`
        : `${cibleMachine.nomPerso} démonté`
      proposerAnnulation(texte, avantDemontage)
      avant.current = releverPositions(racine.current)
      setMachines(reste)
      setDemontage(null)
      noter(texte)
    }, 380)
  }

  // Catégorie de chaque groupe. Les groupes affichés, dans l'ordre des groupes (réglé en les déplaçant).
  const categories = new Map(machines.map(m => [m.num, categorieMachine(m, pelerins)]))
  // « apercu » : groupe masqué tiré depuis le panneau, rendu le temps du geste comme place visée.
  const toutes = [MACHINE_LIBRE, ...machines.filter(m => !masques.has(m.num) || m.num === apercu)]
  const parDossier = useMemo(() => new Map(pelerins.map(p => [cle(p.dossier), p])), [pelerins])
  // Groupe de chaque dossier, calculé une fois par changement des groupes (et non plus en parcourant tous les
  // groupes pour chaque pèlerin : un million de comparaisons avec 1 000 pèlerins).
  const groupeParDossier = useMemo(() => { const t = new Map(); for (const m of machines) for (const id of m.ids) t.set(cle(id), m); return t }, [machines])
  const nomsCle = useMemo(() => machines.map(m => `${m.num}=${m.nomPerso}`).join('|'), [machines])
  // Actions des groupes : un objet stable (les groupes mémorisés ne se refont pas pour lui), qui appelle
  // toujours la version à jour.
  const actionsAJour = useRef(null)
  actionsAJour.current = { surPointeur, renommer, commencerMaintien, arreterMaintien, choisirVue, nomMachine, tirerGroupe, basculerVisibilite, tirerDepuisPanneau }
  const actionsMachine = useMemo(() => ({
    surPointeur: (...a) => actionsAJour.current.surPointeur(...a), renommer: (...a) => actionsAJour.current.renommer(...a),
    commencerMaintien: (...a) => actionsAJour.current.commencerMaintien(...a), arreterMaintien: (...a) => actionsAJour.current.arreterMaintien(...a),
    choisirVue: (...a) => actionsAJour.current.choisirVue(...a), nomMachine: (...a) => actionsAJour.current.nomMachine(...a),
    tirerGroupe: (...a) => actionsAJour.current.tirerGroupe(...a),
  }), [])
  // Le panneau des groupes reçoit les groupes de cette page : une seule source, aucun conflit.
  const groupesPanneau = useMemo(() => listeGroupesVisa({ paniers: machines, rows: pelerins, lecture: lecture?.nusuk }), [machines, pelerins, lecture])
  // Lignes du tableau : les mêmes données que les groupes (nom du groupe Visa, état Nusuk).
  const lignes = useMemo(() => pelerins.map(p => {
    const m = groupeParDossier.get(cle(p.dossier))
    const ef = etatFiche(p, m)
    return { ...p, photo: photos[cle(p.dossier)], groupeVisa: m?.nomPerso || '', etatLibelle: ef.libelle, etatIcone: ef.icone }
  }), [pelerins, groupeParDossier, photos])

  // Barre entre les groupes et le tableau (à droite) : on la tire pour régler la largeur du tableau.
  function commencerSeparation(e) {
    if (e.button !== 0) return
    e.preventDefault()
    const x0 = e.clientX, l0 = largeurTableau
    let derniere = l0
    const bouge = ev => { derniere = borner(l0 - ev.clientX + x0, 300, window.innerWidth - 420); setLargeurTableau(derniere) }
    const fin = () => {
      window.removeEventListener('pointermove', bouge); window.removeEventListener('pointerup', fin)
      try { localStorage.setItem('pdt-largeur-tableau', String(Math.round(derniere))) } catch { /* préférence facultative */ }
    }
    window.addEventListener('pointermove', bouge); window.addEventListener('pointerup', fin)
  }
  const pelerinDe = id => parDossier.get(cle(id))
  const enMain = glisse ? [glisse.principal, ...glisse.ids.filter(x => x !== glisse.principal)].map(pelerinDe).filter(Boolean) : []
  const choisis = new Set(selection)
  const vueCommune = toutes.every(m => vueDe(m.num) === vueDe(LIBRE)) ? vueDe(LIBRE) : null
  // Recherche : nom arabe, nom latin, dossier, passeport et nom du groupe ; les autres fiches pâlissent.
  const termes = normaliser(recherche).split(/\s+/).filter(Boolean)
  const nomGroupeDe = id => nomMachine(groupeParDossier.get(cle(id))?.num ?? LIBRE)
  const trouve = p => termes.every(t => normaliser(`${p.nomAr} ${p.nomLat} ${p.dossier} ${p.jawazNumero ?? ''} ${nomGroupeDe(p.dossier)}`).includes(t))
  const nbTrouves = termes.length ? pelerins.filter(trouve).length : 0
  const groupesChoisis = new Set(selection.map(groupeDe)).size
  // Cartes du menu de la barre du haut : les réglages qui étaient alignés en haut de page.
  const texteLecture = chargement !== 'pret' ? '' : [
    lecture?.recus ? `Registre : ${lecture.recus} passeport(s)${lecture.annules ? `, dont ${lecture.annules} annulé(s) écarté(s)` : ''}.` : 'Registre : 0 passeport.',
    lecture?.nusuk && `Lecture Nusuk du ${new Date(lecture.nusuk.importedAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })} · contrat ${lecture.nusuk.contrat} · ${lecture.nusuk.groupes} groupe(s) Nusuk.`,
    connecte && 'Données du registre : il reçoit et applique lui-même les nouvelles lectures.',
  ].filter(Boolean).join(' ')
  const cartesMenu = [
    { label: 'Affichage', description: 'Vue de tous les groupes, et effets de la page.', links: [
      ...['liste', 'photos', 'details'].map(v => ({ label: `Toutes en ${v === 'details' ? 'détails' : v}`, actif: vueCommune === v, agir: () => choisirVueToutes(v) })),
      { label: `Rebond : ${sansAnimation ? 'retiré' : 'avec'}`, actif: !sansAnimation, agir: basculerAnimations, titre: 'Petit rebond des fiches voisines quand une carte arrive' },
    ] },
    { label: 'Lecture Nusuk', description: texteLecture, links: connecte ? [] : [
      { label: actualisation ? 'Actualisation…' : 'Actualiser depuis Nusuk', desactive: actualisation, agir: () => setEssai(n => n + 1) },
    ] },
    // L'enregistreur écrit son relevé sur le PC (route de développement) : il n'existe pas en ligne.
    ...(process.env.NODE_ENV === 'development' ? [{ label: 'Outils', description: 'Relevé image par image d’un geste, jusqu’à 2 s après le lâcher.', links: [
      { label: enregistrement === 'arme' ? '● Enregistrement… fais ton geste' : enregistrement === 'envoi' ? 'Envoi…' : enregistrement === 'fait' ? 'Geste enregistré ✓' : enregistrement === 'erreur' ? 'Échec de l’envoi' : 'Enregistrer mon geste', agir: enregistrerGeste },
    ] }] : []),
  ]

  return (
    <div className={`pdt${disposition ? ' pdt-libre' : ''}`} ref={racine} style={variablesDisposition(disposition)}>
      {/* Haut de page (2026-10-16) : plus de titre, de compteurs ni de consignes ; le panneau des groupes, ancré en
          haut par défaut, porte la vue de toutes les machines. À sa gauche : lecture du registre et outils. */}
      <div className="pdt-haut">
      {/* Barre du haut (CardNav de React Bits, 2026-10-26) : « Menu » déroule les réglages en cartes (affichage, lecture
          Nusuk, outils) ; la recherche et la sélection restent visibles au centre ; les actions à droite. */}
      <div className="pdt-haut-gauche">
      <CardNav items={cartesMenu} onLinkClick={lien => lien.agir?.()}
        centre={chargement === 'pret' && (
          <>
          <label className="pdt-recherche">
            <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5l3 3" /></svg>
            <input ref={champRecherche} type="search" value={recherche} onChange={e => setRecherche(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') { setRecherche(''); e.currentTarget.blur() } }}
              placeholder="Nom, dossier, passeport, groupe…" aria-label="Rechercher un pèlerin" />
            {termes.length > 0 ? <span className="pdt-trouves">{nbTrouves} trouvé(s)</span> : <kbd>Ctrl K</kbd>}
          </label>
          <div className={`pdt-barre-selection${selection.length ? ' pdt-active' : ''}`} role="status">
            <span className="pdt-barre-pastille"><Compteur valeur={selection.length} /></span>
            <span>{selection.length
              ? `${selection.length === 1 ? 'pèlerin sélectionné' : 'pèlerins sélectionnés'}${groupesChoisis > 1 ? ` dans ${groupesChoisis} groupes` : ''} · glisser pour déplacer le bloc`
              : 'Aucune sélection · clic, Ctrl+clic ou Maj+clic'}</span>
            <button onClick={() => setSelection([])} disabled={!selection.length}>Désélectionner <kbd>Échap</kbd></button>
          </div>
          </>
        )}
        droite={<>
          {retour && <button type="button" className="pdt-bouton-animations pdt-retour" onClick={retour} title="Revenir au registre : mêmes données, ce qui a été fait ici y est déjà">← Registre</button>}
          {/* Mise en page : hors du menu, à portée directe (demande du 2026-10-26). */}
          {chargement === 'pret' && <button type="button" className="pdt-bouton-animations" aria-pressed={miseEnPage} onClick={() => (miseEnPage ? setMiseEnPage(false) : ouvrirMiseEnPage())} title="Placer les zones de la page à la souris (version test)">Mise en page</button>}
          {chargement === 'pret' && <button type="button" className="pdt-bouton-animations pdt-bouton-nouveau" onClick={ajouterMachine} title="Créer un groupe Visa temporaire (préparation locale)">＋ Nouveau groupe temporaire</button>}
        </>} />
      {chargement === 'en-cours' && <p className="pdt-attente" role="status">Lecture du registre…</p>}
      {chargement === 'erreur' && <p className="pdt-attente" role="alert">Le registre n’a pas pu être lu : {lecture?.erreur} <button onClick={() => setEssai(n => n + 1)}>Relire</button></p>}
      {/* Une alerte de lecture reste visible hors du menu. */}
      {chargement === 'pret' && lecture?.alerte && <p className="pdt-alerte-nusuk" role="alert">{lecture.alerte}</p>}
      </div>
      {chargement === 'pret' && (
        <PanneauGroupes groupes={groupesPanneau} masques={masques} onMasquer={basculerMasque} onTirer={tirerDuPanneau} ancrable />
      )}
      </div>

      {chargement === 'pret' && (
        <div className="pdt-espace" style={{ '--largeur-tableau': `${largeurTableau}px` }}>
        {/* Zone qui défile, barre à gauche (demande du 2026-10-25) : sens droite-gauche pour le défilement seulement ;
            les groupes, dedans, gardent leur sens. */}
        <div className="pdt-atelier-defile">
        <main className={`pdt-atelier${glisse ? ' pdt-en-main' : ''}`}>
          {toutes.map(m => {
            const ids = idsDe(m.num, machines, glisse?.ids)
            const tous = idsDe(m.num)
            const viseeIci = cible?.num === m.num
            return (
              <Machine key={m.num} m={m} ids={ids} idsCle={ids.map(cle).join('|')} vue={vueDe(m.num)} categorie={categories.get(m.num) || null}
                trou={viseeIci && !cible.refus ? Math.min(cible.index, ids.length) : null} trouOrigine={viseeIci && !!cible.origine}
                nbGlisse={glisse?.ids.length || 1} glisseActif={!!glisse}
                choisisCle={ids.filter(id => choisis.has(cle(id))).map(cle).join('|')}
                trouvesCle={termes.length ? ids.filter(id => { const p = pelerinDe(id); return p && trouve(p) }).map(cle).join('|') : null}
                provenanceCle={ids.filter(id => provenance[cle(id)] != null).map(id => `${cle(id)}:${provenance[cle(id)]}`).join('|')}
                nomsCle={nomsCle} photos={photos} parDossier={parDossier}
                effectif={tous.length} nbChoisis={tous.filter(id => choisis.has(cle(id))).length}
                demonte={demontage === m.num} allumeeT={allumee?.num === m.num ? allumee.t : null} maintenu={maintien === m.num}
                visee={viseeIci ? (cible.refus ? 'refusee' : 'visee') : null} actions={actionsMachine} />
            )
          })}
          <button className="pdt-ajout" onClick={ajouterMachine}><span>＋</span>Nouveau groupe temporaire</button>
        </main>
        </div>
        <div className="pdt-separateur" role="separator" aria-orientation="vertical" title="Glisser pour régler la largeur du tableau" onPointerDown={commencerSeparation} />
        <Tableau ref={tableau} lignes={lignes} colonnes={COLONNES} surPrise={surPriseTableau} />
        </div>
      )}

      {miseEnPage && disposition && (
        <EditeurDisposition racine={racine} disposition={disposition}
          changer={d => { setDisposition(d); ecrireDisposition(d) }}
          fermer={() => { ecrireDisposition(disposition); setMiseEnPage(false) }}
          reinitialiser={() => { ecrireDisposition(null); setDisposition(null); setMiseEnPage(false) }} />
      )}
      {refus && <div key={refus.id} className="pdt-refus-message" role="alert" onAnimationEnd={() => setRefus(r => (r?.id === refus.id ? null : r))}>🔒 {refus.texte}</div>}

      {glisse && enMain.length > 0 && (
        <div ref={fantome} className={`pdt-fantome pdt-vue-${glisse.vue}`} style={{ width: glisse.w, height: glisse.h, '--t': glisse.teinte }} aria-hidden="true">
          {enMain.map((p, k) => (
            <div key={cle(p.dossier)} data-pile={cle(p.dossier)} className="pdt-fiche pdt-choisie pdt-pile-fiche"
              style={{ '--t': couleurDe(glisse.sources[cle(p.dossier)]), transform: `translate(${Math.min(k, PILE) * 5}px, ${Math.min(k, PILE) * 5}px)`, zIndex: enMain.length - k, visibility: k > PILE ? 'hidden' : undefined }}>
              <ContenuFiche p={p} photo={photos[cle(p.dossier)]} vue={glisse.vue} rang={glisse.rangs[cle(p.dossier)]} venu={provenance[cle(p.dossier)]} nomVenu={nomMachine(provenance[cle(p.dossier)])}
                {...(e => ({ etatIcone: e.icone, etatLibelle: e.libelle }))(etatFiche(p, machines.find(x => x.num === glisse.sources[cle(p.dossier)])))} />
            </div>
          ))}
          {enMain.length > 1 && <span className="pdt-badge">{enMain.length}</span>}
        </div>
      )}

      {/* Plus de bandeau « Annuler » après un déplacement (retiré le 2026-10-14 : il donnait une impression
          de ralentissement). Ctrl+Z annule toujours le dernier déplacement. */}

      <footer className="pdt-journal" aria-live="polite">
        <h3>Derniers passages</h3>
        {journal.length ? <ol>{journal.map(l => <li key={l.id}>{l.texte}</li>)}</ol> : <p>Aucun passage pour l’instant.</p>}
      </footer>
    </div>
  )
}
