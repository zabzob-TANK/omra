'use client'

import { memo, useEffect, useLayoutEffect, useRef } from 'react'
import { estTriable } from '../rubrique-visa'

// Pièces d'affichage du panneau des groupes : ressorts, chiffres qui roulent, rang, boutons d'action,
// titres cliquables, œil. Aucune règle des groupes ici : elles vivent dans la fiche Visa.

// Ressort échantillonné une fois en courbe CSS (masse m, raideur k, amortissement c).
export function courbeRessort(k, c, m = 1) {
  const pas = 1 / 60, points = [0]
  let y = 0, v = 0, t = 0
  while (t < 2) {
    for (let i = 0; i < 4; i++) { v += ((-k * (y - 1) - c * v) / m) * (pas / 4); y += v * (pas / 4) }
    t += pas
    points.push(+y.toFixed(4))
    if (Math.abs(y - 1) < 0.002 && Math.abs(v) < 0.05) break
  }
  points[points.length - 1] = 1
  return { duree: Math.round(t * 1000), courbe: `linear(${points.join(', ')})` }
}
export const S_BOUTON = courbeRessort(250, 25) // retour au repos
export const S_OUVRE = courbeRessort(200, 35) // allongement au survol (après 0,15 s)
export const S_LIBELLE = courbeRessort(200, 25) // apparition du nom
export const S_PILE = courbeRessort(300, 26) // la pile qui s'étale (Notification List)
export const S_EPINGLE = courbeRessort(320, 20, 0.8) // une pastille épinglée ou désépinglée (Pin List)

// Variables CSS des ressorts, posées sur la racine du panneau.
export const STYLE_RESSORTS = {
  '--s-bouton-duree': `${S_BOUTON.duree}ms`, '--s-bouton': S_BOUTON.courbe,
  '--s-ouvre-duree': `${S_OUVRE.duree}ms`, '--s-ouvre': S_OUVRE.courbe,
  '--s-libelle-duree': `${S_LIBELLE.duree}ms`, '--s-libelle': S_LIBELLE.courbe,
  '--s-pile-duree': `${S_PILE.duree}ms`, '--s-pile': S_PILE.courbe,
}

// Un chiffre qui roule (SlidingNumber) : ressort masse 0,4, raideur 200, amortissement 20. Chaque chiffre
// se décale d'un pourcentage de sa propre hauteur : aucune mesure de la page (lire la hauteur à chaque
// redessin forçait le navigateur à recalculer la mise en page en plein dépôt d'un pèlerin). Mémorisé : il
// ne se redessine que si sa valeur change.
const Rouleau = memo(function Rouleau({ chiffre }) {
  const chiffres = useRef([])
  const etat = useRef({ x: chiffre, v: 0, cible: chiffre, boucle: 0 })
  const peindre = () => {
    const courant = ((etat.current.x % 10) + 10) % 10
    chiffres.current.forEach((el, n) => {
      if (!el) return
      let decalage = (10 + n - courant) % 10
      if (decalage > 5) decalage -= 10
      el.style.transform = `translateY(${decalage * 100}%)`
    })
  }
  useLayoutEffect(peindre, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const e = etat.current
    e.cible = chiffre
    cancelAnimationFrame(e.boucle)
    let avant = performance.now()
    const avancer = maintenant => {
      const dt = Math.min(0.05, (maintenant - avant) / 1000)
      avant = maintenant
      for (let i = 0; i < 4; i++) {
        const a = (-200 * (e.x - e.cible) - 20 * e.v) / 0.4
        e.v += a * (dt / 4); e.x += e.v * (dt / 4)
      }
      peindre()
      if (Math.abs(e.x - e.cible) > 0.001 || Math.abs(e.v) > 0.01) e.boucle = requestAnimationFrame(avancer)
      else { e.x = e.cible; e.v = 0; peindre() }
    }
    e.boucle = requestAnimationFrame(avancer)
    return () => cancelAnimationFrame(e.boucle)
  }, [chiffre])
  return (
    <span className="mb-rouleau">
      <span className="mb-rouleau-gabarit">0</span>
      {Array.from({ length: 10 }, (_, n) => (
        <span key={n} ref={el => { chiffres.current[n] = el }} className="mb-rouleau-chiffre">{n}</span>
      ))}
    </span>
  )
})

export const NombreGlissant = memo(function NombreGlissant({ nombre }) {
  const texte = String(nombre)
  return (
    <span className="mb-nombre" dir="ltr">
      {[...texte].map((c, i) => <Rouleau key={texte.length - i} chiffre={Number(c)} />)}
    </span>
  )
})

// Rang du groupe dans la liste Nusuk (1, 2, 3…), discret ; « — » pour un groupe absent de Nusuk.
export function RangNusuk({ rang }) {
  return <span className="mb-rang-nusuk" dir="ltr" data-vide={rang == null} title={rang == null ? 'Absent de la liste Nusuk' : `Groupe n° ${rang} dans la liste Nusuk`}>{rang ?? '—'}</span>
}

// Bouton façon « Management Bar » : carré au repos, il s'allonge au survol et montre son nom.
export function BoutonAction({ Icone, libelle, ton, onClick, desactive, raison }) {
  return (
    <button type="button" className="mb-action" data-ton={ton} aria-label={libelle} onClick={onClick} disabled={desactive} title={desactive ? raison : undefined}>
      <Icone size={20} className="mb-action-icone" />
      <span className="mb-action-libelle">{libelle}</span>
    </button>
  )
}

// Titre cliquable : trie par sa colonne ; la flèche montre le tri actif.
export function TitreTri({ cle, titre, bulle, tri, onTrier }) {
  if (!onTrier || !estTriable(cle)) return <span title={bulle}>{titre}</span>
  const actif = tri?.cle === cle
  return (
    <button type="button" className="mb-tri" data-actif={actif} onClick={() => onTrier(cle)} title={bulle}>
      <span dir={cle === 'ecart' ? 'ltr' : undefined}>{titre}</span>
      <span className="mb-tri-fleche" aria-hidden="true">{actif ? (tri.sens === 'haut' ? '▲' : '▼') : '▲'}</span>
    </button>
  )
}

export function Oeil({ masque, onMasquer }) {
  return (
    <button type="button" className="mb-oeil mb-oeil-petit" data-masque={masque} onClick={onMasquer} aria-label={masque ? 'Afficher le groupe' : 'Masquer le groupe'}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {masque
          ? <><path d="M10.7 5.1A10 10 0 0 1 22 12a13 13 0 0 1-1.7 2.7" /><path d="M6.6 6.6A13.5 13.5 0 0 0 2 12s3 7 10 7a9.7 9.7 0 0 0 5.4-1.6" /><path d="m2 2 20 20" /></>
          : <><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></>}
      </svg>
    </button>
  )
}

export function Ecart({ plus, moins }) {
  return plus || moins
    ? <span className="mb-ecart" dir="ltr">{plus > 0 && <b data-signe="plus">+{plus}</b>}{moins > 0 && <b data-signe="moins">−{moins}</b>}</span>
    : <span className="mb-vide">—</span>
}
