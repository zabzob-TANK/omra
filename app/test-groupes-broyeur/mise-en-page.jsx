'use client'

import { useEffect, useRef, useState } from 'react'

// Mise en page (version test, demande du commanditaire, 2026-10-21) : les quatre grandes zones de la page sont
// recouvertes d'un rectangle de couleur qu'on déplace et redimensionne à la souris, comme une sélection Photoshop ;
// la vraie zone suit en direct. Positions en pourcentage de l'écran, retenues dans ce navigateur. Outil de réglage :
// « Copier la disposition » donne les chiffres, à inscrire ensuite comme disposition par défaut.

export const ZONES = [
  { cle: 'options', nom: 'Options', selecteur: '.pdt-haut-gauche', couleur: '#f2a541' },
  { cle: 'groupes', nom: 'Groupes', selecteur: '.d5-compact', couleur: '#4ea5f0' },
  { cle: 'atelier', nom: 'Groupes et pèlerins', selecteur: '.pdt-atelier-defile', couleur: '#4ade80' },
  { cle: 'liste', nom: 'Liste', selecteur: '.pdt-tableau', couleur: '#c084fc' },
]
const CLE = 'pdt-disposition'
const MIN = 4 // taille minimale d'une zone, en % de l'écran
const GRILLE = 8 // pas de la grille, en pixels
const AIMANT = 8 // distance à laquelle un bord se colle à un autre, en pixels

export function lireDisposition() {
  try {
    const d = JSON.parse(localStorage.getItem(CLE) || 'null')
    return d && ZONES.every(z => ['x', 'y', 'l', 'h'].every(k => Number.isFinite(d[z.cle]?.[k]))) ? d : null
  } catch { return null }
}
export function ecrireDisposition(d) {
  try { d ? localStorage.setItem(CLE, JSON.stringify(d)) : localStorage.removeItem(CLE) } catch { /* préférence facultative */ }
}
const arrondi = v => Math.round(v * 100) / 100
// Variables CSS posées sur la racine de la page (voir .pdt-libre dans poste-de-tri.css).
export function variablesDisposition(d) {
  if (!d) return undefined
  const s = {}
  for (const z of ZONES) {
    const r = d[z.cle]
    s[`--${z.cle}-x`] = `${r.x}%`; s[`--${z.cle}-y`] = `${r.y}%`; s[`--${z.cle}-l`] = `${r.l}%`; s[`--${z.cle}-h`] = `${r.h}%`
  }
  return s
}
function poserVariables(racine, d) {
  const v = variablesDisposition(d)
  for (const [k, val] of Object.entries(v)) racine.style.setProperty(k, val)
}

// Disposition de départ : là où sont les zones dans la page normale, ramenées à un écran (la page libre fait la
// hauteur de l'écran ; ce qui dépassait en bas est raccourci).
export function releverDisposition(racine) {
  const b = racine.getBoundingClientRect(), L = b.width, H = window.innerHeight
  const d = {}
  ZONES.forEach((z, k) => {
    const el = racine.querySelector(z.selecteur)
    const r = el?.getBoundingClientRect()
    let x = r ? (r.left - b.left) / L * 100 : 5 + k * 5, y = r ? (r.top - b.top) / H * 100 : 5 + k * 5
    let l = r ? r.width / L * 100 : 20, h = r ? r.height / H * 100 : 15
    x = Math.min(Math.max(0, x), 100 - MIN); y = Math.min(Math.max(0, y), 100 - MIN)
    l = Math.min(Math.max(MIN, l), 100 - x); h = Math.min(Math.max(MIN, h), 100 - y)
    d[z.cle] = { x: arrondi(x), y: arrondi(y), l: arrondi(l), h: arrondi(h) }
  })
  return d
}

const POIGNEES = ['n', 's', 'e', 'o', 'ne', 'no', 'se', 'so']

// Calque d'édition : un rectangle par zone, posé par-dessus la page.
export function EditeurDisposition({ racine, disposition, changer, fermer, reinitialiser }) {
  const [d, setD] = useState(disposition)
  const courant = useRef(disposition)
  const [copie, setCopie] = useState(false)
  useEffect(() => { setD(disposition); courant.current = disposition }, [disposition])

  function commencer(e, cle, poignee) {
    if (e.button !== 0) return
    e.preventDefault(); e.stopPropagation()
    const conteneur = racine.current
    if (!conteneur) return
    const b = conteneur.getBoundingClientRect(), L = b.width, H = b.height
    const depart = { ...courant.current[cle] }, x0 = e.clientX, y0 = e.clientY
    // Bords auxquels s'aimanter : ceux de l'écran et ceux des autres zones (en pixels).
    const autres = ZONES.filter(z => z.cle !== cle).map(z => courant.current[z.cle])
    const bordsX = [0, L, ...autres.flatMap(r => [r.x * L / 100, (r.x + r.l) * L / 100])]
    const bordsY = [0, H, ...autres.flatMap(r => [r.y * H / 100, (r.y + r.h) * H / 100])]
    const aimanter = (v, bords) => {
      let mieux = Math.round(v / GRILLE) * GRILLE, ecart = AIMANT + 1
      for (const bo of bords) if (Math.abs(bo - v) < ecart) { ecart = Math.abs(bo - v); mieux = bo }
      return mieux
    }
    let image = 0
    const bouge = ev => {
      const dx = ev.clientX - x0, dy = ev.clientY - y0
      let gauche = depart.x * L / 100, haut = depart.y * H / 100, droite = gauche + depart.l * L / 100, bas = haut + depart.h * H / 100
      if (!poignee) {
        const larg = droite - gauche, haute = bas - haut
        // Déplacement : le bord le plus proche d'un autre bord s'y colle.
        let g = gauche + dx, hh = haut + dy
        const gA = aimanter(g, bordsX), dA = aimanter(g + larg, bordsX)
        g = Math.abs(gA - g) <= Math.abs(dA - (g + larg)) ? gA : dA - larg
        const hA = aimanter(hh, bordsY), bA = aimanter(hh + haute, bordsY)
        hh = Math.abs(hA - hh) <= Math.abs(bA - (hh + haute)) ? hA : bA - haute
        gauche = Math.min(Math.max(0, g), L - larg); haut = Math.min(Math.max(0, hh), H - haute)
        droite = gauche + larg; bas = haut + haute
      } else {
        const minL = MIN * L / 100, minH = MIN * H / 100
        if (poignee.includes('o')) gauche = Math.min(Math.max(0, aimanter(gauche + dx, bordsX)), droite - minL)
        if (poignee.includes('e')) droite = Math.max(Math.min(L, aimanter(droite + dx, bordsX)), gauche + minL)
        if (poignee.includes('n')) haut = Math.min(Math.max(0, aimanter(haut + dy, bordsY)), bas - minH)
        if (poignee.includes('s')) bas = Math.max(Math.min(H, aimanter(bas + dy, bordsY)), haut + minH)
      }
      const r = { x: arrondi(gauche / L * 100), y: arrondi(haut / H * 100), l: arrondi((droite - gauche) / L * 100), h: arrondi((bas - haut) / H * 100) }
      courant.current = { ...courant.current, [cle]: r }
      cancelAnimationFrame(image)
      // La vraie zone suit à chaque image, sans redessiner toute la page.
      image = requestAnimationFrame(() => { poserVariables(conteneur, courant.current); setD(courant.current) })
    }
    const fin = () => {
      window.removeEventListener('pointermove', bouge); window.removeEventListener('pointerup', fin)
      cancelAnimationFrame(image)
      changer(courant.current)
    }
    window.addEventListener('pointermove', bouge); window.addEventListener('pointerup', fin)
  }

  async function copier() {
    try { await navigator.clipboard.writeText(JSON.stringify(courant.current, null, 2)); setCopie(true); setTimeout(() => setCopie(false), 1600) } catch { setCopie(false) }
  }

  return (
    <div className="pdt-mep" aria-label="Mise en page">
      {ZONES.map(z => {
        const r = d[z.cle]
        const absente = !racine.current?.querySelector(z.selecteur)
        return (
          <div key={z.cle} className="pdt-mep-zone" data-zone={z.cle} style={{ '--c': z.couleur, left: `${r.x}%`, top: `${r.y}%`, width: `${r.l}%`, height: `${r.h}%` }}
            onPointerDown={e => commencer(e, z.cle, null)}>
            <span className="pdt-mep-nom">{z.nom}{absente ? ' (en fenêtre)' : ''} <small>{Math.round(r.l)} × {Math.round(r.h)} %</small></span>
            {POIGNEES.map(q => <i key={q} className={`pdt-mep-poignee pdt-mep-${q}`} onPointerDown={e => commencer(e, z.cle, q)} />)}
          </div>
        )
      })}
      <div className="pdt-mep-barre" role="toolbar">
        <b>Mise en page</b>
        <span>Glisser une zone pour la déplacer, tirer ses bords pour la redimensionner.</span>
        <button type="button" onClick={copier}>{copie ? 'Copiée ✓' : 'Copier la disposition'}</button>
        <button type="button" onClick={reinitialiser}>Réinitialiser</button>
        <button type="button" className="pdt-mep-terminer" onClick={fermer}>Terminer</button>
      </div>
    </div>
  )
}
