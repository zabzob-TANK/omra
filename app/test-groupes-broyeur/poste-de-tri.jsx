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
    if (!enAttente && Math.hypot(x - vers.x, y - vers.y) < 0.3 && Math.hypot(vx, vy) < 6 && Math.abs(r) < 0.05 && Math.abs(s - 1) < 0.0005) break
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
    <section data-machine={m.num} data-categorie={categorie || 'hors'}
      className={`pdt-machine${demonte ? ' pdt-demontage' : ''}${visee ? ` pdt-${visee}` : ''}${verrou ? ' pdt-verrouillee' : ''}`}
      style={{ '--t': categorie ? CATEGORIES[categorie]?.color || teinte(m.num) : teinte(m.num) }} aria-label={m.nomPerso}>
      {visee === 'visee' && <span className="pdt-faisceau" aria-hidden="true" />}
      <div key={allumeeT ?? 'repos'} className={`pdt-plaque${allumeeT != null ? ' pdt-allumee' : ''}`}>
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

export default function PosteDeTri() {
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
  // Groupes masqués depuis le panneau des groupes : ils disparaissent de l'atelier (rien n'est supprimé).
  const [masques, setMasques] = useState(() => new Set())
  const basculerMasque = useCallback(num => setMasques(s => { const n = new Set(s); n.has(num) ? n.delete(num) : n.add(num); return n }), [])
  const [essai, setEssai] = useState(0)
  const [machines, setMachines] = useState([])
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
    const arret = new AbortController()
    if (!essai) setChargement('en-cours')
    else setActualisation(true)
    chargerVisa(arret.signal, etat.current.machines, { toutesAdresses: true })
      .then(r => {
        setPelerins(r.rows)
        // Un passeport supprimé entre deux lectures quitte aussi ses groupes : sinon il resterait
        // compté sans être affiché.
        const existants = new Set(r.rows.map(p => cle(p.dossier)))
        setMachines(r.paniers.map(m => m.ids.every(id => existants.has(cle(id))) ? m : { ...m, ids: m.ids.filter(id => existants.has(cle(id))) }))
        setLecture({ recus: r.recus, annules: r.annules, nusuk: r.lecture, alerte: r.alerte })
        setChargement('pret')
      })
      .catch(e => { if (!arret.signal.aborted) { setLecture({ erreur: e.message }); setChargement('erreur') } })
      .finally(() => { if (!arret.signal.aborted) setActualisation(false) })
    return () => arret.abort()
  }, [essai])

  // Nouvelle lecture envoyée par l'extension : on actualise, comme le fichier clients.
  useEffect(() => {
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
      if (!etat.current.selection.length) return
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
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z' || !etat.current.annulable) return
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
        const atterrir = () => { atterrissages.delete(v.copie); reveler(el); v.copie.remove() }
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

  // « depuisTableau » : prise par la poignée d'une ligne du tableau. La fiche tenue prend alors la
  // taille d'une fiche Liste, accrochée à la souris par son bord gauche.
  function commencer(e, id, depuis, depuisTableau = false) {
    if (e.button !== 0 || prise.current || depotEnCours.current) return
    e.preventDefault()
    if (depuis == null) depuis = groupeDe(id)
    const r = depuisTableau ? { left: e.clientX - 24, top: e.clientY - 23, width: 320, height: 46 } : e.currentTarget.getBoundingClientRect()
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
    // Un simple clic sur la poignée du tableau ne sélectionne rien dans les groupes.
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
      const num = Math.max(0, ...liste.map(m => m.num)) + 1
      return [...liste, nouvelleMachine(num, prochainNomVisa(liste.map(m => m.nomPerso)), nouveauBrouillon(num))]
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

  // Catégorie de chaque groupe ; ordre d'affichage : sans groupe Nusuk, groupes Nusuk, visas, temporaires.
  const categories = new Map(machines.map(m => [m.num, categorieMachine(m, pelerins)]))
  const RANG_CATEGORIE = { 'sans-groupe': 0, groupe: 1, 'attente-visa': 2, 'visa-emis': 3, temporaire: 4 }
  const toutes = [MACHINE_LIBRE,
    ...[...machines].filter(m => !masques.has(m.num)).sort((a, b) => (RANG_CATEGORIE[categories.get(a.num)] - RANG_CATEGORIE[categories.get(b.num)]) || a.num - b.num)]
  const parDossier = useMemo(() => new Map(pelerins.map(p => [cle(p.dossier), p])), [pelerins])
  // Groupe de chaque dossier, calculé une fois par changement des groupes (et non plus en parcourant tous les
  // groupes pour chaque pèlerin : un million de comparaisons avec 1 000 pèlerins).
  const groupeParDossier = useMemo(() => { const t = new Map(); for (const m of machines) for (const id of m.ids) t.set(cle(id), m); return t }, [machines])
  const nomsCle = useMemo(() => machines.map(m => `${m.num}=${m.nomPerso}`).join('|'), [machines])
  // Actions des groupes : un objet stable (les groupes mémorisés ne se refont pas pour lui), qui appelle
  // toujours la version à jour.
  const actionsAJour = useRef(null)
  actionsAJour.current = { surPointeur, renommer, commencerMaintien, arreterMaintien, choisirVue, nomMachine }
  const actionsMachine = useMemo(() => ({
    surPointeur: (...a) => actionsAJour.current.surPointeur(...a), renommer: (...a) => actionsAJour.current.renommer(...a),
    commencerMaintien: (...a) => actionsAJour.current.commencerMaintien(...a), arreterMaintien: (...a) => actionsAJour.current.arreterMaintien(...a),
    choisirVue: (...a) => actionsAJour.current.choisirVue(...a), nomMachine: (...a) => actionsAJour.current.nomMachine(...a),
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

  return (
    <div className="pdt" ref={racine}>
      <header className="pdt-bandeau">
        <div>
          <p className="pdt-sur">Banc d’essai · groupes</p>
          <h1>Poste de tri</h1>
        </div>
        <div className="pdt-bandeau-droite">
          <div className="pdt-toutes"><span>Toutes</span><ChoixVue vue={vueCommune} choisir={choisirVueToutes} libelle="Vue de toutes les machines" /></div>
          <ul className="pdt-compteurs" aria-label="Effectif par machine">
            {toutes.map(m => <li key={m.num} style={{ '--t': teinte(m.num) }}><b><Compteur valeur={idsDe(m.num).length} /></b>{m.nomPerso}</li>)}
          </ul>
        </div>
      </header>

      <div className="pdt-consigne">
        <p><b>Sélectionner :</b> clic sur la fiche = ajouter/retirer · Maj+clic = ajouter toute la plage · Échap = tout désélectionner.</p>
        <p><b>Déplacer :</b> glisser une fiche sélectionnée emporte toute la sélection, même répartie sur plusieurs groupes, en un bloc.</p>
        <p><b>Depuis le tableau :</b> tirer la poignée ⠿ d’une ligne vers un groupe ; les lignes cochées partent ensemble.</p>
        <p><b>Groupes 🔒 :</b> visa en attente ou obtenu, rien n’entre ni ne sort. Seul un groupe temporaire se démonte (✕ maintenu). Ctrl+Z annule.</p>
        <p className="pdt-avertissement">Lecture seule de Nusuk ; les déplacements sont une simulation en mémoire : rien n’est enregistré, rien ne part vers Nusuk.</p>
      </div>

      {chargement === 'en-cours' && <p className="pdt-attente" role="status">Lecture du registre…</p>}
      {chargement === 'erreur' && <p className="pdt-attente" role="alert">Le registre n’a pas pu être lu : {lecture?.erreur} <button onClick={() => setEssai(n => n + 1)}>Relire</button></p>}
      {chargement === 'pret' && (
        <p className="pdt-lecture" role="status">
          {lecture?.recus
            ? `Registre lu : ${lecture.recus} passeport(s)${lecture.annules ? `, dont ${lecture.annules} annulé(s) écarté(s)` : ''}.`
            : 'Registre lu : 0 passeport. Le fichier clients est vide pour cette base.'}
          {lecture?.nusuk && ` Lecture Nusuk du ${new Date(lecture.nusuk.importedAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })} · contrat ${lecture.nusuk.contrat} · ${lecture.nusuk.groupes} groupe(s) Nusuk.`}
          {' '}<button onClick={() => setEssai(n => n + 1)} disabled={actualisation}>{actualisation ? 'Actualisation…' : 'Actualiser depuis Nusuk'}</button>
          {lecture?.alerte && <span className="pdt-alerte-nusuk" role="alert">{lecture.alerte}</span>}
        </p>
      )}

      {chargement === 'pret' && (
        <div className="pdt-outils">
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
          <button type="button" className="pdt-bouton-animations" aria-pressed={sansAnimation} onClick={basculerAnimations}
            title={sansAnimation ? 'Les fiches voisines glissent et s’arrêtent net à leur place. Cliquer pour remettre le petit rebond.' : 'Cliquer pour retirer le petit rebond des fiches voisines (elles glissent toujours).'}>
            Rebond : {sansAnimation ? 'retiré' : 'avec'}
          </button>
          {/* L'enregistreur écrit son relevé sur le PC (route de développement) : il n'existe pas en ligne. */}
          {process.env.NODE_ENV === 'development' && (
          <button type="button" className="pdt-bouton-animations pdt-bouton-geste" data-etat={enregistrement} onClick={enregistrerGeste}
            title="Cliquer, puis faire le geste : la page relève image par image ce qui bouge, jusqu'à 2 s après le lâcher.">
            {enregistrement === 'arme' ? '● Enregistrement… fais ton geste' : enregistrement === 'envoi' ? 'Envoi…' : enregistrement === 'fait' ? 'Geste enregistré ✓' : enregistrement === 'erreur' ? 'Échec de l’envoi' : 'Enregistrer mon geste'}
          </button>
          )}
        </div>
      )}

      {chargement === 'pret' && (
        <div className="pdt-espace" style={{ '--largeur-tableau': `${largeurTableau}px` }}>
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
        <div className="pdt-separateur" role="separator" aria-orientation="vertical" title="Glisser pour régler la largeur du tableau" onPointerDown={commencerSeparation} />
        <Tableau ref={tableau} lignes={lignes} colonnes={COLONNES} surPrise={surPriseTableau} />
        </div>
      )}

      {chargement === 'pret' && <PanneauGroupes groupes={groupesPanneau} masques={masques} onMasquer={basculerMasque} />}
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
