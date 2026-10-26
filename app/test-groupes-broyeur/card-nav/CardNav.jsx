'use client'
// Barre du haut du Poste de tri : composant CardNav de React Bits (reactbits.dev), adapté le 2026-10-26.
// Un bouton « Menu » déroule des cartes (titre, phrase, liens-boutons) qui montent avec un ressort.
// Adaptations : couleurs du Poste de tri (variables de .pdt), surface pleine (pas de verre flou, coûteux sur les petits
// PC), flèches lucide-react au lieu de Hugeicons, « centre » et « droite » libres à la place du logo et du bouton
// d'action (la recherche et la sélection y restent toujours visibles), libellés en français, et liens qui portent
// leur état (« actif », « desactive ») puisqu'ici ce sont des réglages.

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { ArrowUpRight } from 'lucide-react'
import './CardNav.css'

// Couleurs prises sur la page (variables de .pdt) : la barre se fond dans le Poste de tri.
const COULEURS = {
  '--cn-panel': 'var(--panneau)',
  '--cn-edge': 'var(--bord)',
  '--cn-highlight': 'rgba(255, 255, 255, 0.04)',
  '--cn-shadow': '0 18px 40px -22px rgba(0, 0, 0, 0.85)',
  '--cn-text': 'var(--texte)',
  '--cn-muted': 'var(--doux)',
  '--cn-hover': 'rgba(255, 255, 255, 0.05)',
  '--cn-ring': 'rgba(242, 165, 65, 0.6)',
  '--cn-tile': 'linear-gradient(180deg, #22262d 0%, #1d2026 100%)',
  '--cn-tile-rim': 'inset 0 0 0 1px var(--bord), inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 4px 10px -4px rgba(0, 0, 0, 0.6)',
  '--cn-actif': '#f2a541',
}

const ETROIT = 560
const SORTIE = 'cubic-bezier(0.22, 1, 0.36, 1)'
const borner = (v, min, max) => Math.min(max, Math.max(min, v))
const adoucir = t => 1 - (1 - t) ** 3

export default function CardNav({
  items = [],
  centre = null,
  droite = null,
  libelleMenu = 'Menu',
  libelleFermer = 'Fermer',
  cardEffect = 'rise',
  stagger = 0.12,
  bounce = 0.2,
  speed = 1,
  cardHeight = 120,
  intro = true,
  onLinkClick,
  ariaLabel = 'Poste de tri',
  className = '',
  style,
}) {
  const idContenu = useId()
  const racine = useRef(null)
  const panneau = useRef(null)
  const contenu = useRef(null)
  const boutonMenu = useRef(null)
  const cartes = useRef([])
  const moteur = useRef(null)
  const barre = useRef(null)
  const introRef = useRef(intro)
  const [ouvert, setOuvertEtat] = useState(false)
  const [etroit, setEtroit] = useState(false)
  const [montre, setMontre] = useState(false)

  const reglages = { ouvert, cardEffect, stagger: borner(stagger, 0, 0.3), bounce: borner(bounce, 0, 1), speed: borner(speed, 0.2, 3) }
  const reglagesRef = useRef(reglages)
  reglagesRef.current = reglages
  const setOuvert = suivant => { if (suivant !== ouvert) setOuvertEtat(suivant) }
  const setOuvertRef = useRef(setOuvert)
  setOuvertRef.current = setOuvert

  // Ressort de l'ouverture : la hauteur du panneau et l'arrivée des cartes, une image à la fois, seulement pendant
  // l'ouverture ou la fermeture.
  useEffect(() => {
    const p = panneau.current, c = contenu.current
    if (!p || !c) return undefined
    const calme = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    const etat = { p: reglagesRef.current.ouvert ? 1 : 0, v: 0, hauteur: c.offsetHeight, barre: 60 }
    let raf = 0, dernier = 0
    const dessiner = () => {
      const s = reglagesRef.current
      etat.barre = parseFloat(getComputedStyle(p).getPropertyValue('--cn-bar')) || 60
      p.style.height = `${etat.barre + Math.max(0, etat.p) * etat.hauteur}px`
      const liste = cartes.current.filter(Boolean), n = liste.length
      const retard = n > 1 ? Math.min(s.stagger, 0.7 / (n - 1)) : 0
      const duree = 1 - retard * (n - 1)
      liste.forEach((carte, i) => {
        const local = borner((etat.p - i * retard) / Math.max(duree, 0.05), 0, 1), e = adoucir(local)
        if (s.cardEffect === 'unfold') {
          carte.style.transform = `translateY(${(1 - e) * -10}px) rotateX(${(1 - e) * -72}deg)`
          carte.style.opacity = `${borner(local * 1.8, 0, 1)}`
        } else if (s.cardEffect === 'fade') {
          carte.style.transform = `translateY(${(1 - e) * 6}px)`
          carte.style.opacity = `${e}`
        } else {
          carte.style.transform = `translateY(${(1 - e) * 26}px) scale(${0.97 + 0.03 * e})`
          carte.style.opacity = `${e}`
        }
      })
    }
    const image = maintenant => {
      raf = 0
      const s = reglagesRef.current
      const dt = dernier ? Math.min(0.05, (maintenant - dernier) / 1000) : 1 / 60
      dernier = maintenant
      const cible = s.ouvert ? 1 : 0
      if (calme) { etat.p = cible; etat.v = 0 } else {
        const k = 160 * s.speed * s.speed, zeta = s.ouvert ? 1 - 0.68 * s.bounce : 1
        const pas = Math.ceil(dt / (1 / 240)), h = dt / pas
        for (let i = 0; i < pas; i++) { etat.v += (-k * (etat.p - cible) - 2 * zeta * Math.sqrt(k) * etat.v) * h; etat.p += etat.v * h }
      }
      const fini = Math.abs(etat.p - cible) < 0.0005 && Math.abs(etat.v) < 0.002
      if (fini) { etat.p = cible; etat.v = 0 }
      dessiner()
      if (fini && cible === 0) setMontre(false)
      if (!fini) raf = requestAnimationFrame(image)
    }
    moteur.current = {
      reveiller: () => { if (!raf) { dernier = 0; raf = requestAnimationFrame(image) } },
      actualiser: () => { etat.hauteur = c.offsetHeight; dessiner() },
    }
    dessiner()
    const obs = new ResizeObserver(() => { etat.hauteur = c.offsetHeight; dessiner() })
    obs.observe(c)
    return () => { cancelAnimationFrame(raf); obs.disconnect(); moteur.current = null }
  }, [items.length, etroit])

  useLayoutEffect(() => {
    if (ouvert) setMontre(true)
    moteur.current?.actualiser()
    moteur.current?.reveiller()
  }, [ouvert])
  useEffect(() => { moteur.current?.actualiser() })

  useLayoutEffect(() => {
    const r = racine.current
    if (!r) return undefined
    const mesurer = () => setEtroit(r.offsetWidth < ETROIT)
    mesurer()
    const obs = new ResizeObserver(mesurer)
    obs.observe(r)
    return () => obs.disconnect()
  }, [])

  // Ouvert : un clic ailleurs ou Échap le referme.
  useEffect(() => {
    if (!ouvert) return undefined
    const appui = e => { if (e.target instanceof Node && racine.current?.contains(e.target)) return; setOuvertRef.current(false) }
    const touche = e => { if (e.key !== 'Escape') return; setOuvertRef.current(false); boutonMenu.current?.focus() }
    document.addEventListener('pointerdown', appui)
    document.addEventListener('keydown', touche)
    return () => { document.removeEventListener('pointerdown', appui); document.removeEventListener('keydown', touche) }
  }, [ouvert])

  // À l'arrivée sur la page, la barre se déroule depuis son centre.
  useLayoutEffect(() => {
    const p = panneau.current, b = barre.current
    if (!p || !b || !introRef.current) return
    introRef.current = false
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const largeur = p.offsetWidth, hauteur = p.offsetHeight
    const rayon = parseFloat(getComputedStyle(p).borderTopLeftRadius) || 18
    p.animate([
      { clipPath: `inset(0px ${Math.max(0, (largeur - hauteur) / 2)}px round ${hauteur / 2}px)`, opacity: 0 },
      { clipPath: `inset(0px 0px round ${rayon}px)`, opacity: 1 },
    ], { duration: 820, easing: SORTIE, fill: 'backwards' })
    Array.from(b.children).forEach((enfant, i) => {
      enfant.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 560, delay: 220 + i * 70, easing: SORTIE, fill: 'backwards' })
    })
  }, [])

  return (
    <div ref={racine} className={['card-nav', className].filter(Boolean).join(' ')} data-open={ouvert ? '' : undefined}
      data-shown={montre || ouvert ? '' : undefined} data-narrow={etroit ? '' : undefined}
      style={{ ...COULEURS, '--cn-bar': '60px', '--cn-inset': '8px', '--cn-gap': '8px', '--cn-radius': '16px', '--cn-card': `${cardHeight}px`, ...style }}>
      <nav ref={panneau} className="card-nav__panel" aria-label={ariaLabel}>
        <div ref={barre} className="card-nav__bar">
          <button ref={boutonMenu} type="button" className="card-nav__menu" aria-expanded={ouvert} aria-controls={idContenu} onClick={() => setOuvert(!ouvert)}>
            <span className="card-nav__burger" aria-hidden="true">
              <span className="card-nav__line card-nav__line--top" />
              <span className="card-nav__line card-nav__line--bottom" />
            </span>
            <span className="card-nav__menu-label">
              <span className="card-nav__word card-nav__word--open" aria-hidden={ouvert}>{libelleMenu}</span>
              <span className="card-nav__word card-nav__word--close" aria-hidden={!ouvert}>{libelleFermer}</span>
            </span>
          </button>
          <div className="card-nav__centre">{centre}</div>
          <div className="card-nav__droite">{droite}</div>
        </div>

        <div ref={contenu} id={idContenu} className="card-nav__content" aria-hidden={!ouvert}>
          <div className="card-nav__cards">
            {items.map((item, i) => (
              <div key={`${item.label}-${i}`} ref={el => { cartes.current[i] = el }} className="card-nav__card">
                <div className="card-nav__card-head">
                  <span className="card-nav__label">{item.label}</span>
                  {item.description && <p className="card-nav__description">{item.description}</p>}
                </div>
                {item.links?.length > 0 && (
                  <ul className="card-nav__links">
                    {item.links.map((lien, j) => (
                      <li key={`${lien.label}-${j}`}>
                        <button type="button" className="card-nav__link" data-actif={lien.actif ? '' : undefined} disabled={lien.desactive}
                          aria-pressed={lien.actif === undefined ? undefined : !!lien.actif} title={lien.titre} tabIndex={ouvert ? undefined : -1}
                          onClick={e => { onLinkClick?.(lien, item, e); if (!lien.garderOuvert) setOuvert(false) }}>
                          <span className="card-nav__arrow" aria-hidden="true">
                            <ArrowUpRight className="card-nav__arrow-icon card-nav__arrow-icon--out" size={14} strokeWidth={2} />
                            <ArrowUpRight className="card-nav__arrow-icon card-nav__arrow-icon--in" size={14} strokeWidth={2} />
                          </span>
                          {lien.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
        <span className="card-nav__rim" />
      </nav>
    </div>
  )
}
